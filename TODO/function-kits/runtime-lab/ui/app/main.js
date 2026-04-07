const kitId = "runtime-lab";
const surface = "panel";

const storageKeys = ["lastActiveTab", "aiPrompt", "aiTemperature", "aiMaxTokens", "fetchUrl", "commitText"];

const defaultSettings = {
  lastActiveTab: "ai",
  aiPrompt:
    "你将获得一个输入法上下文快照（beforeCursor / selectedText / afterCursor）。\n" +
    "请生成 3 条可直接发送的中文回复候选，要求简短、自然。\n" +
    "严格只输出 JSON：{\"candidates\":[{\"text\":\"...\"}]}",
  aiTemperature: 0.6,
  aiMaxTokens: 800,
  fetchUrl: "https://httpbin.org/delay/2",
  commitText: "好的，我明白了。"
};

const viewNames = new Set(["ai", "tasks", "input", "logs"]);

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

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getInstanceId() {
  if (!globalThis.__runtimeLabInstanceId) {
    globalThis.__runtimeLabInstanceId = `inst-${Math.random().toString(16).slice(2, 10)}`;
  }
  return globalThis.__runtimeLabInstanceId;
}

function buildSessionMetaText(surfaceName, sessionId, buildName) {
  const build = buildName ? ` · build=${buildName}` : "";
  return `surface=${surfaceName} · session=${sessionId ?? "pending"}${build}`;
}

function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const lastActiveTab = safeText(source.lastActiveTab) || defaultSettings.lastActiveTab;
  const resolvedTab = viewNames.has(lastActiveTab) ? lastActiveTab : defaultSettings.lastActiveTab;
  return {
    lastActiveTab: resolvedTab,
    aiPrompt: typeof source.aiPrompt === "string" ? source.aiPrompt : defaultSettings.aiPrompt,
    aiTemperature: String(clampNumber(source.aiTemperature, defaultSettings.aiTemperature, 0, 2)),
    aiMaxTokens: String(Math.round(clampNumber(source.aiMaxTokens, defaultSettings.aiMaxTokens, 16, 4096))),
    fetchUrl:
      typeof source.fetchUrl === "string" && source.fetchUrl.trim() ? source.fetchUrl.trim() : defaultSettings.fetchUrl,
    commitText: typeof source.commitText === "string" ? source.commitText : defaultSettings.commitText
  };
}

function extractFirstCandidateText(aiResult) {
  const output = aiResult?.output ?? null;
  const structured =
    output && typeof output === "object" && output.type === "json" && output.json && typeof output.json === "object"
      ? output.json
      : null;
  const candidates = ensureArray(structured?.candidates);
  const first = candidates.find((candidate) => candidate && typeof candidate.text === "string" && candidate.text.trim());
  return first ? first.text.trim() : null;
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
    storage: { ...defaultSettings },
    context: {
      sourcePackage: "preview.mock.host",
      selectionStart: 3,
      selectionEnd: 3,
      selectedText: "",
      beforeCursor: "你好呀",
      afterCursor: "",
      preeditText: "",
      inputType: "text",
      candidateCount: 0
    }
  }
});

async function loadSettingsFromStorage() {
  if (!kit.hasPermission("storage.read")) {
    return { ...defaultSettings };
  }

  try {
    const stored = await kit.storage.get(storageKeys);
    return {
      ...defaultSettings,
      ...(stored && typeof stored === "object" ? stored : {})
    };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettingsToStorage(values) {
  if (!kit.hasPermission("storage.write")) {
    return;
  }
  const patch = values && typeof values === "object" ? values : {};
  kit.storage.set(patch).catch(() => {});
}

const app = globalThis.PetiteVue.reactive({
  instanceId: getInstanceId(),
  activeView: defaultSettings.lastActiveTab,
  status: {
    state: "idle",
    text: "等待宿主握手",
    metaOverride: null
  },
  host: {
    surface,
    sessionId: null,
    buildName: null,
    connected: false
  },
  permissions: [],
  caps: {
    canAiRequest: false,
    canInsert: false,
    canReplace: false,
    canNetworkFetch: false,
    canReadContext: false,
    canReadStorage: false,
    canWriteStorage: false
  },
  settings: normalizeSettings(null),
  context: null,
  ai: {
    running: false,
    result: null,
    badgeKind: "muted",
    badgeText: "未生成"
  },
  tasks: {
    running: [],
    history: [],
    syncing: false,
    fetchRunning: false
  },
  logs: [],

  get sessionMetaText() {
    return buildSessionMetaText(this.host.surface, this.host.sessionId, this.host.buildName);
  },

  get statusMetaText() {
    return this.status.metaOverride || this.sessionMetaText;
  },

  get permissionsEmptyText() {
    return this.host.connected ? "暂无（或未同步）" : "等待权限同步";
  },

  get aiBadgeClass() {
    if (this.ai.badgeKind === "warning") {
      return "badge badge--warning";
    }
    if (this.ai.badgeKind === "danger") {
      return "badge badge--danger";
    }
    if (this.ai.badgeKind === "muted") {
      return "badge badge--muted";
    }
    return "badge";
  },

  get aiBadgeText() {
    return this.ai.badgeText || "未生成";
  },

  get aiResultText() {
    return this.ai.result ? safeJson(this.ai.result) : "null";
  },

  get firstCandidateText() {
    return extractFirstCandidateText(this.ai.result);
  },

  get canRunAi() {
    return this.caps.canAiRequest && !this.ai.running;
  },

  get canInsertCandidate() {
    return !!this.firstCandidateText && this.caps.canInsert;
  },

  get canReplaceCandidate() {
    return !!this.firstCandidateText && this.caps.canReplace;
  },

  get runningTasksText() {
    return safeJson(this.tasks.running);
  },

  get historyTasksText() {
    return safeJson(this.tasks.history);
  },

  get canStartSlowFetch() {
    return this.caps.canNetworkFetch && !this.tasks.fetchRunning;
  },

  get canCancelRunningTask() {
    return this.tasks.running.length > 0;
  },

  get contextBadgeClass() {
    return this.context ? "badge" : "badge badge--muted";
  },

  get contextBadgeText() {
    return this.context ? "已同步" : "等待上下文";
  },

  get contextPackageText() {
    const pkg = this.context?.sourcePackage ?? this.context?.packageName ?? null;
    return safeText(pkg) || "-";
  },

  get contextSelectionText() {
    const start = Number.isFinite(this.context?.selectionStart) ? this.context.selectionStart : null;
    const end = Number.isFinite(this.context?.selectionEnd) ? this.context.selectionEnd : null;
    return start === null || end === null ? "-" : `${start}-${end}`;
  },

  get contextBeforeCursorText() {
    return typeof this.context?.beforeCursor === "string" ? this.context.beforeCursor : "-";
  },

  get contextSelectedText() {
    return typeof this.context?.selectedText === "string" ? this.context.selectedText : "-";
  },

  get contextAfterCursorText() {
    return typeof this.context?.afterCursor === "string" ? this.context.afterCursor : "-";
  },

  get contextPreeditText() {
    return typeof this.context?.preeditText === "string" ? this.context.preeditText : "-";
  },

  get contextJsonText() {
    return safeJson(this.context);
  },

  get logsText() {
    return this.logs.length ? this.logs.join("\n\n") : "等待事件";
  },

  updateStatus(status, text, metaOverride) {
    this.status.state = status;
    this.status.text = text;
    this.status.metaOverride = metaOverride || null;
  },

  logLine(message, data) {
    const line = data ? `${nowIso()} ${message} ${safeJson(data)}` : `${nowIso()} ${message}`;
    this.logs.unshift(line);
    if (this.logs.length > 160) {
      this.logs = this.logs.slice(0, 160);
    }
  },

  clearLogs() {
    this.logs = [];
  },

  refreshTasks() {
    this.tasks.running = kit.tasks.listRunning();
    this.tasks.history = kit.tasks.listHistory();
  },

  syncCapabilities() {
    this.caps.canAiRequest = kit.hasPermission("ai.request");
    this.caps.canInsert = kit.hasPermission("input.insert");
    this.caps.canReplace = kit.hasPermission("input.replace");
    this.caps.canNetworkFetch = kit.hasPermission("network.fetch");
    this.caps.canReadContext = kit.hasPermission("context.read");
    this.caps.canReadStorage = kit.hasPermission("storage.read");
    this.caps.canWriteStorage = kit.hasPermission("storage.write");
  },

  setActiveView(viewName, options = {}) {
    const resolved = safeText(viewName);
    const name = viewNames.has(resolved) ? resolved : defaultSettings.lastActiveTab;
    const persist = options.persist !== false;
    this.activeView = name;
    this.settings.lastActiveTab = name;
    if (persist) {
      saveSettingsToStorage({ lastActiveTab: name });
    }
  },

  applySettings(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    this.settings = normalized;
    this.setActiveView(normalized.lastActiveTab, { persist: false });
  },

  saveSettings(values) {
    saveSettingsToStorage(values);
  },

  openSettings() {
    kit.settings.open({});
  },

  async refreshContext(reason) {
    if (!kit.hasPermission("context.read")) {
      this.updateStatus("error", "缺少权限：context.read", this.sessionMetaText);
      return;
    }

    try {
      const context = await kit.context.refresh({ reason: safeText(reason) || "manual" });
      this.context = context ?? null;
      this.logLine("context.refresh", { reason: safeText(reason) || "manual" });
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.logLine("context.refresh.error", resolved);
      this.updateStatus("error", `刷新上下文失败：${resolved.message}`, this.sessionMetaText);
    }
  },

  async runAiRequest() {
    if (!kit.hasPermission("ai.request")) {
      this.updateStatus("error", "缺少权限：ai.request", this.sessionMetaText);
      return;
    }

    const prompt = safeText(this.settings.aiPrompt) || defaultSettings.aiPrompt;
    const temperature = clampNumber(this.settings.aiTemperature, defaultSettings.aiTemperature, 0, 2);
    const maxTokens = Math.round(clampNumber(this.settings.aiMaxTokens, defaultSettings.aiMaxTokens, 16, 4096));

    this.ai.running = true;
    this.ai.badgeKind = "warning";
    this.ai.badgeText = "生成中";
    this.updateStatus("busy", "Android AI request 请求中", this.sessionMetaText);

    try {
      const systemPrompt =
        "你是 Android 输入法里的助手。严格只输出一个 JSON 对象，不要输出 Markdown，不要解释，不要代码围栏。" +
        "JSON 结构必须是：{\"candidates\":[{\"text\":\"...\"}]}";

      const result = await kit.ai.request({
        task: { title: "运行 AI 请求" },
        route: { kind: "host-shared" },
        systemPrompt,
        prompt,
        response: { type: "json" },
        input: {
          ...(this.context && typeof this.context === "object" ? this.context : {})
        },
        temperature,
        maxTokens
      });

      this.ai.result = result ?? null;
      this.ai.badgeKind = "ok";
      this.ai.badgeText = safeText(result?.status) || "ok";
      this.logLine("ai.request.done", { status: result?.status ?? null });
      this.updateStatus("ready", "Android AI chat 已完成", this.sessionMetaText);
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.ai.result = { error: resolved };
      this.ai.badgeKind = "danger";
      this.ai.badgeText = "失败";
      this.logLine("ai.request.error", resolved);
      this.updateStatus("error", `AI 生成失败：${resolved.message}`, this.sessionMetaText);
    } finally {
      this.ai.running = false;
      saveSettingsToStorage({
        aiPrompt: this.settings.aiPrompt,
        aiTemperature: Number(this.settings.aiTemperature),
        aiMaxTokens: Number(this.settings.aiMaxTokens)
      });
    }
  },

  commitCandidateToInput(mode) {
    const text = this.firstCandidateText;
    if (!text) {
      return;
    }

    if (mode === "replace") {
      if (!kit.hasPermission("input.replace")) {
        return;
      }
      kit.input.replace(text);
      this.logLine("input.replace", { source: "ai.candidates[0]", length: text.length });
    } else {
      if (!kit.hasPermission("input.insert")) {
        return;
      }
      kit.input.insert(text);
      this.logLine("input.insert", { source: "ai.candidates[0]", length: text.length });
    }
  },

  async syncTasks() {
    this.tasks.syncing = true;
    try {
      const result = await kit.tasks.sync();
      this.logLine("tasks.sync.request", { ok: true, payload: result });
      this.refreshTasks();
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.logLine("tasks.sync.error", resolved);
    } finally {
      this.tasks.syncing = false;
    }
  },

  getFirstRunningTaskId() {
    const running = kit.tasks.listRunning();
    const first = running[0];
    const taskId = safeText(first?.taskId);
    return taskId || null;
  },

  async cancelFirstRunningTask() {
    const taskId = this.getFirstRunningTaskId();
    if (!taskId) {
      return;
    }

    try {
      const result = await kit.tasks.cancel({ taskId, reason: "user" });
      this.logLine("task.cancel", { taskId, result });
      this.refreshTasks();
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.logLine("task.cancel.error", { taskId, error: resolved });
    }
  },

  startSlowFetch() {
    if (!kit.hasPermission("network.fetch")) {
      this.updateStatus("error", "缺少权限：network.fetch", this.sessionMetaText);
      return;
    }

    const url = safeText(this.settings.fetchUrl) || defaultSettings.fetchUrl;
    this.tasks.fetchRunning = true;
    this.updateStatus("busy", "network.fetch running", this.sessionMetaText);
    saveSettingsToStorage({ fetchUrl: url });

    kit
      .fetch(url, { method: "GET", timeoutMs: 20000, task: { title: "运行网络请求" } })
      .then((payload) => {
        this.logLine("network.fetch.result", {
          status: payload?.status ?? payload?.response?.status ?? null,
          url
        });
        this.updateStatus("ready", "network.fetch 已完成", this.sessionMetaText);
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.logLine("network.fetch.error", { url, error: resolved });
        this.updateStatus("error", `network.fetch 失败：${resolved.message}`, this.sessionMetaText);
      })
      .finally(() => {
        this.tasks.fetchRunning = false;
        this.refreshTasks();
      });
  },

  commitTextToInput(mode) {
    const text = safeText(this.settings.commitText);
    if (!text) {
      return;
    }

    saveSettingsToStorage({ commitText: this.settings.commitText });
    if (mode === "replace") {
      if (!kit.hasPermission("input.replace")) {
        return;
      }
      kit.input.replace(text);
      this.logLine("input.replace", { source: "manual", length: text.length });
    } else {
      if (!kit.hasPermission("input.insert")) {
        return;
      }
      kit.input.insert(text);
      this.logLine("input.insert", { source: "manual", length: text.length });
    }
  }
});

globalThis.PetiteVue.createApp(app).mount("#app");

app.refreshTasks();
app.syncCapabilities();

kit.on("ready", async ({ sessionId, permissions, hostInfo }) => {
  app.host.connected = true;
  app.host.sessionId = sessionId ?? null;
  app.host.buildName = hostInfo?.build?.displayName ?? null;
  app.permissions = ensureArray(permissions);
  app.syncCapabilities();
  app.refreshTasks();
  app.updateStatus("ready", "宿主握手完成", app.sessionMetaText);
  app.logLine("ready", { sessionId, permissionsCount: app.permissions.length });

  const settings = await loadSettingsFromStorage();
  app.applySettings(settings);
  await app.refreshContext("boot");
});

kit.on("permissions", ({ permissions }) => {
  app.permissions = ensureArray(permissions);
  app.syncCapabilities();
  app.refreshTasks();
  app.logLine("permissions.sync", { permissionsCount: app.permissions.length });
});

kit.on("host", ({ hostInfo }) => {
  app.host.buildName = hostInfo?.build?.displayName ?? app.host.buildName;
  app.host.sessionId = kit.state.sessionId ?? app.host.sessionId;
});

kit.on("host.update", ({ label, details }) => {
  if (!label) {
    return;
  }
  app.logLine("host.update", { label, details });
});

kit.on("context", ({ context }) => {
  app.context = context ?? null;
});

kit.on("ai", ({ result }) => {
  if (!result) {
    return;
  }
  app.logLine("ai.response", { status: result.status ?? null });
});

kit.on("task", ({ task }) => {
  app.logLine("task.update", { taskId: task.taskId, status: task.status, kind: task.kind, seq: task.seq });
  app.refreshTasks();
});

kit.on("tasks.sync", ({ running, history }) => {
  app.logLine("tasks.sync", { running: ensureArray(running).length, history: ensureArray(history).length });
  app.refreshTasks();
});

kit.on("error", ({ error }) => {
  const resolved = resolveRuntimeError(error);
  app.logLine("error", resolved);
  app.updateStatus("error", resolved.message, app.sessionMetaText);
});

kit.connect().catch((error) => {
  const resolved = resolveRuntimeError(error);
  app.logLine("connect.error", resolved);
  app.updateStatus("error", `宿主握手失败：${resolved.message}`, app.sessionMetaText);
});

