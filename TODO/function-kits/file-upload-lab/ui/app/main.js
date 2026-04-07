const kitId = "file-upload-lab";
const surface = "panel";

const storageKeys = ["uploadUrl", "method", "contentType", "headersJson", "acceptMimeTypes", "allowMultiple"];

const defaultSettings = {
  uploadUrl: "https://httpbin.org/post",
  method: "POST",
  contentType: "",
  headersJson: "{}",
  acceptMimeTypes: "",
  allowMultiple: false
};

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveRuntimeError(error) {
  if (!error) {
    return { message: "unknown error" };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (typeof error.message === "string" && error.message.length > 0) {
    return { message: error.message };
  }
  if (error.error && typeof error.error === "object") {
    const nested = error.error;
    if (typeof nested.message === "string" && nested.message.length > 0) {
      return { message: nested.message, meta: `code=${nested.code ?? "unknown"}` };
    }
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function parseHeaderJson(raw) {
  const text = safeText(raw);
  if (!text) {
    return {};
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("headers JSON must be an object");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [String(key), typeof value === "string" ? value : String(value ?? "")])
  );
}

function parseAcceptMimeTypes(raw) {
  return safeText(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sendTaskCancel(taskId) {
  const resolved = safeText(taskId);
  if (!resolved) {
    throw new Error("taskId missing");
  }
  if (!globalThis.FunctionKitHost || typeof globalThis.FunctionKitHost.postMessage !== "function") {
    throw new Error("FunctionKitHost.postMessage is unavailable");
  }

  const envelope = {
    version: "1.0.0",
    messageId: `ui-task-cancel-${Date.now()}`,
    timestamp: new Date().toISOString(),
    kitId,
    surface,
    source: "function-kit-ui",
    target: "host-adapter",
    type: "task.cancel",
    payload: { taskId: resolved }
  };

  globalThis.FunctionKitHost.postMessage(envelope);
  return envelope.messageId;
}

const kit = globalThis.FunctionKitRuntimeSDK.createKit({
  kitId,
  surface,
  debug: true,
  connect: {
    timeoutMs: 20000,
    retries: 3
  },
  preview: {
    grantAll: true,
    storage: { ...defaultSettings }
  }
});

const app = globalThis.PetiteVue.reactive({
  status: {
    state: "idle",
    text: "等待宿主握手",
    metaOverride: null
  },
  sessionId: null,
  permissions: [],
  wantedPermissions: ["storage.read", "storage.write", "network.fetch", "settings.open"],
  settings: { ...defaultSettings },
  pickedFiles: [],
  uploadResult: null,
  logs: [],
  lastNetworkFetchTaskId: null,
  lastNetworkFetchTaskStatus: null,

  get sessionMetaText() {
    return `surface=${surface} · session=${this.sessionId ?? "pending"}`;
  },

  get statusMetaText() {
    return this.status.metaOverride || this.sessionMetaText;
  },

  get pickedFilesText() {
    return safeJson(this.pickedFiles ?? []);
  },

  get uploadResultText() {
    if (this.uploadResult === null || this.uploadResult === undefined) {
      return "";
    }
    return safeJson(this.uploadResult);
  },

  get logsText() {
    return this.logs.length ? this.logs.join("\n\n") : "";
  },

  get canCancelTask() {
    const taskId = safeText(this.lastNetworkFetchTaskId);
    const status = safeText(this.lastNetworkFetchTaskStatus);
    return Boolean(taskId) && (status === "queued" || status === "running" || status === "canceling");
  },

  get cancelTaskLabel() {
    const status = safeText(this.lastNetworkFetchTaskStatus);
    if (this.canCancelTask && status) {
      return `取消任务（${status}）`;
    }
    return "取消任务";
  },

  updateStatus(kind, text, metaOverride) {
    this.status.state = kind;
    this.status.text = text;
    this.status.metaOverride = metaOverride || null;
  },

  log(line, data) {
    const base = `[${new Date().toISOString()}] ${line}`;
    const next = data === undefined ? base : `${base}\n${safeJson(data)}`;
    this.logs.unshift(next);
    if (this.logs.length > 120) {
      this.logs = this.logs.slice(0, 120);
    }
  },

  permissionChipClass(permission) {
    return this.permissions.includes(permission) ? "chip--on" : "chip--off";
  },

  setMethod(value) {
    const resolved = safeText(value).toUpperCase();
    this.settings.method = resolved === "PUT" ? "PUT" : "POST";
  },

  applySettings(values) {
    const merged = { ...defaultSettings, ...(values && typeof values === "object" ? values : {}) };

    this.settings.uploadUrl = safeText(merged.uploadUrl) || defaultSettings.uploadUrl;
    this.settings.method = safeText(merged.method).toUpperCase() === "PUT" ? "PUT" : "POST";
    this.settings.contentType = safeText(merged.contentType);
    this.settings.headersJson = typeof merged.headersJson === "string" ? merged.headersJson : defaultSettings.headersJson;
    this.settings.acceptMimeTypes = typeof merged.acceptMimeTypes === "string" ? merged.acceptMimeTypes : "";
    this.settings.allowMultiple = merged.allowMultiple === true;
  },

  async loadSettings() {
    try {
      const values = await kit.storage.get(storageKeys);
      this.applySettings(values);
      this.log("loaded storage settings", values);
    } catch (error) {
      this.log("storage.get failed", resolveRuntimeError(error));
    }
  },

  async saveSettings() {
    const values = {
      uploadUrl: safeText(this.settings.uploadUrl),
      method: safeText(this.settings.method).toUpperCase() === "PUT" ? "PUT" : "POST",
      contentType: safeText(this.settings.contentType),
      headersJson: typeof this.settings.headersJson === "string" ? this.settings.headersJson : defaultSettings.headersJson,
      acceptMimeTypes: typeof this.settings.acceptMimeTypes === "string" ? this.settings.acceptMimeTypes : "",
      allowMultiple: this.settings.allowMultiple === true
    };

    try {
      await kit.storage.set(values);
      this.log("saved storage settings", values);
    } catch (error) {
      this.log("storage.set failed", resolveRuntimeError(error));
    }
  },

  async connect() {
    this.updateStatus("busy", "握手中…");
    try {
      const result = await kit.connect();
      this.sessionId = result.sessionId ?? null;
      this.permissions = Array.isArray(result.permissions) ? result.permissions : [];
      this.updateStatus("ready", "宿主已连接");
      this.log("connected", result);
      await this.loadSettings();
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `握手失败：${resolved.message}`);
      this.log("connect failed", resolved);
    }
  },

  async refreshPermissions() {
    try {
      const result = await kit.connect();
      this.permissions = Array.isArray(result.permissions) ? result.permissions : [];
      this.log("refreshed permissions", this.permissions);
    } catch (error) {
      this.log("refresh permissions failed", resolveRuntimeError(error));
    }
  },

  openSettings() {
    try {
      kit.settings.open();
    } catch (error) {
      this.log("settings.open failed", resolveRuntimeError(error));
    }
  },

  async pickFiles() {
    this.updateStatus("busy", "正在打开文件选择器…");
    try {
      const payload = await kit.files.pick({
        multiple: this.settings.allowMultiple === true,
        acceptMimeTypes: parseAcceptMimeTypes(this.settings.acceptMimeTypes)
      });

      this.pickedFiles = Array.isArray(payload?.files) ? payload.files : [];
      this.updateStatus("ready", payload?.canceled ? "已取消选择" : "文件已选择");
      this.log("files.pick.result", payload);
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `files.pick 失败：${resolved.message}`);
      this.log("files.pick failed", resolved);
    }
  },

  getSelectedFile() {
    const files = this.pickedFiles;
    if (!Array.isArray(files) || files.length === 0) {
      return null;
    }
    const first = files[0];
    return first && typeof first === "object" ? first : null;
  },

  async upload() {
    const file = this.getSelectedFile();
    if (!file) {
      this.updateStatus("error", "请先选择文件");
      return;
    }

    const url = safeText(this.settings.uploadUrl);
    if (!url) {
      this.updateStatus("error", "请填写上传 URL");
      return;
    }

    let headers = {};
    try {
      headers = parseHeaderJson(this.settings.headersJson);
    } catch (error) {
      this.updateStatus("error", `headers JSON 无效：${error.message ?? "parse failed"}`);
      return;
    }

    const contentType = safeText(this.settings.contentType);
    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    const fileId = safeText(file.fileId);
    if (!fileId) {
      this.updateStatus("error", "fileId 缺失");
      return;
    }

    this.updateStatus("busy", "上传中…");
    this.uploadResult = null;

    try {
      const envelope = await kit.raw.fetch(url, {
        method: safeText(this.settings.method).toUpperCase() === "PUT" ? "PUT" : "POST",
        headers,
        bodyRef: {
          type: "file",
          fileId
        },
        timeoutMs: 30000
      });

      const output = envelope.payload ?? envelope;
      this.uploadResult = output;
      this.updateStatus("ready", "上传完成");
      this.log("network.fetch.result", output);
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.uploadResult = error;
      this.updateStatus("error", `上传失败：${resolved.message}`);
      this.log("upload failed", resolved);
    }
  },

  cancelTask() {
    const taskId = safeText(this.lastNetworkFetchTaskId);
    if (!taskId) {
      this.updateStatus("error", "没有可取消的 taskId");
      return;
    }

    try {
      const messageId = sendTaskCancel(taskId);
      this.updateStatus("busy", "已请求取消…", `taskId=${taskId} · messageId=${messageId}`);
      this.log("task.cancel", { taskId, messageId });
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `task.cancel 失败：${resolved.message}`);
      this.log("task.cancel failed", resolved);
    }
  },

  clearLogs() {
    this.logs = [];
  },

  init() {
    this.connect();
  }
});

globalThis.PetiteVue.createApp(app).mount("#app");
app.init();

kit.raw.on("task.update", (envelope) => {
  const task = envelope?.payload?.task;
  if (!task || typeof task !== "object") {
    return;
  }
  if (safeText(task.kind) !== "network.fetch") {
    return;
  }
  app.lastNetworkFetchTaskId = safeText(task.taskId) || null;
  app.lastNetworkFetchTaskStatus = safeText(task.status) || null;
});

kit.raw.on("task.cancel.ack", (envelope) => {
  app.log("task.cancel.ack", envelope?.payload ?? envelope);
});

