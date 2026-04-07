const kitId = "quick-phrases";
const surface = "panel";

const storageKeys = ["phraseSlot1", "phraseSlot2", "phraseSlot3"];
const defaultPhrases = {
  phraseSlot1: "收到，我先看一下，稍后给你回复。",
  phraseSlot2: "可以，这件事我先记下，晚点同步进展。",
  phraseSlot3: "我先处理手头上的，整理好后第一时间发你。"
};

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
    storage: { ...defaultPhrases },
    context: {
      sourceMessage: "当前输入框内容：周三之前先给我一个第一版，我晚上统一看。",
      sourcePackage: "preview.mock.host",
      selectedText: "周三之前先给我一个第一版"
    }
  }
});

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
  return { message: JSON.stringify(error) };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function applyStorageValuesToSlots(slots, values) {
  if (!values || typeof values !== "object") {
    return;
  }

  slots.forEach((slot) => {
    if (!Object.prototype.hasOwnProperty.call(values, slot.key)) {
      return;
    }

    const resolved = normalizeText(values[slot.key]) || defaultPhrases[slot.key] || "";
    slot.text = resolved;
  });
}

const app = globalThis.PetiteVue.reactive({
  activeView: "phrases",
  status: {
    state: "idle",
    text: "等待宿主握手",
    metaOverride: null
  },
  host: {
    surface,
    sessionId: null,
    buildName: null
  },
  permissions: [],
  caps: {
    canInsert: false,
    canReplace: false,
    canReadStorage: false,
    canWriteStorage: false,
    canReadContext: false
  },
  context: null,
  slots: storageKeys.map((key, index) => ({
    key,
    label: `槽位 ${index + 1}`,
    text: defaultPhrases[key] || ""
  })),
  draftText: "",
  bootstrapCompleted: false,
  openOptionsMode: false,

  get sessionMetaText() {
    const build = this.host.buildName ? ` · build=${this.host.buildName}` : "";
    return `surface=${this.host.surface} · session=${this.host.sessionId ?? "pending"}${build}`;
  },

  get statusMetaText() {
    return this.status.metaOverride || this.sessionMetaText;
  },

  get contextMessage() {
    if (!this.context) {
      return "等待宿主上下文";
    }
    return this.context.sourceMessage || "宿主没有返回可用文本";
  },

  get contextMeta() {
    if (!this.context) {
      return "尚未连接宿主";
    }
    const metaParts = [];
    if (this.context.selectedText) {
      metaParts.push(`选区：${this.context.selectedText}`);
    }
    if (this.context.sourcePackage) {
      metaParts.push(`来源：${this.context.sourcePackage}`);
    }
    return metaParts.join(" · ") || "宿主未提供额外元数据";
  },

  setView(viewName) {
    const resolved = String(viewName || "").trim();
    this.activeView = resolved || this.activeView || "phrases";
  },

  updateStatus(state, text, metaOverride) {
    this.status.state = state;
    this.status.text = text;
    this.status.metaOverride = metaOverride || null;
  },

  syncCapabilities() {
    this.permissions = Array.isArray(kit.state.permissions) ? kit.state.permissions : this.permissions;
    this.caps.canInsert = kit.hasPermission("input.insert");
    this.caps.canReplace = kit.hasPermission("input.replace");
    this.caps.canReadStorage = kit.hasPermission("storage.read");
    this.caps.canWriteStorage = kit.hasPermission("storage.write");
    this.caps.canReadContext = kit.hasPermission("context.read");
  },

  openSettings() {
    kit.settings.open({});
  },

  refreshContext() {
    if (!kit.hasPermission("context.read")) {
      this.updateStatus("error", "缺少 context.read 授权", "permissions=context.read");
      return;
    }

    this.updateStatus("busy", "正在请求宿主上下文");
    kit.context
      .refresh({ reason: "user-refresh" })
      .then((context) => {
        this.context = context ?? null;
        this.updateStatus("ready", "上下文已同步");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `同步上下文失败：${resolved.message}`);
      });
  },

  loadStoredPhrases() {
    if (!kit.hasPermission("storage.read")) {
      this.updateStatus("error", "缺少 storage.read 授权", "permissions=storage.read");
      return;
    }

    this.updateStatus("busy", "正在读取已保存短语");
    kit.storage
      .get(storageKeys)
      .then((values) => {
        applyStorageValuesToSlots(this.slots, values);
        this.updateStatus("ready", "短语槽位已同步");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `读取短语失败：${resolved.message}`);
      });
  },

  saveSlot(slot) {
    if (!kit.hasPermission("storage.write")) {
      this.updateStatus("error", "缺少 storage.write 授权", "permissions=storage.write");
      return;
    }

    const text = normalizeText(slot?.text);
    const label = slot?.label ? String(slot.label) : "短语";
    const storageKey = slot?.key ? String(slot.key) : "";
    if (!storageKey) {
      this.updateStatus("error", `${label}缺少 storageKey`);
      return;
    }

    this.updateStatus("busy", `正在保存${label}`);
    kit.storage
      .set({ [storageKey]: text })
      .then((values) => {
        applyStorageValuesToSlots(this.slots, values);
        this.updateStatus("ready", `${label}已保存`);
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `保存失败：${resolved.message}`);
      });
  },

  submitText(text, mode, label) {
    const normalized = normalizeText(text);
    const resolvedLabel = label ? String(label) : "短语";
    if (!normalized) {
      this.updateStatus("error", `${resolvedLabel}为空，无法提交`);
      return;
    }

    if (mode === "replace") {
      if (!kit.hasPermission("input.replace")) {
        this.updateStatus("error", "缺少 input.replace 授权", "permissions=input.replace");
        return;
      }

      kit.input.replace({ text: normalized, source: kitId, label: resolvedLabel });
      this.updateStatus("busy", `已提交${resolvedLabel}替换请求`);
      return;
    }

    if (!kit.hasPermission("input.insert")) {
      this.updateStatus("error", "缺少 input.insert 授权", "permissions=input.insert");
      return;
    }

    kit.input.insert({ text: normalized, source: kitId, label: resolvedLabel });
    this.updateStatus("busy", `已提交${resolvedLabel}插入请求`);
  },

  submitSlot(slot, mode) {
    this.submitText(slot?.text, mode, slot?.label);
  },

  submitDraft(mode) {
    this.submitText(this.draftText, mode, "临时草稿");
  }
});

globalThis.PetiteVue.createApp(app).mount("#app");

kit.on("ready", ({ sessionId, permissions, hostInfo }) => {
  app.host.sessionId = sessionId ?? null;
  app.host.buildName = hostInfo?.build?.displayName ?? null;
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
  app.updateStatus("ready", "宿主已连接");

  if (!app.bootstrapCompleted) {
    app.bootstrapCompleted = true;
    app.loadStoredPhrases();
    if (!app.openOptionsMode) {
      app.refreshContext();
    }
  }
});

kit.on("permissions", ({ permissions }) => {
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
});

kit.on("context", ({ context }) => {
  app.context = context ?? null;
});

kit.on("storage", ({ values }) => {
  if (!values || typeof values !== "object") {
    return;
  }
  applyStorageValuesToSlots(app.slots, values);
});

kit.on("host", ({ hostInfo }) => {
  app.host.buildName = hostInfo?.build?.displayName ?? app.host.buildName;
});

kit.on("host.update", ({ label, details }) => {
  const intent = details && typeof details === "object" ? details.intent : null;
  if (intent && typeof intent === "object" && intent.kind === "open_options") {
    app.openOptionsMode = true;
    app.setView("phrases");
  }
  if (label) {
    app.updateStatus("ready", label);
  }
});

kit.on("error", ({ error }) => {
  const resolved = resolveRuntimeError(error);
  app.updateStatus("error", resolved.message);
});

kit.connect()
  .then(() => {
    if (!app.bootstrapCompleted) {
      app.bootstrapCompleted = true;
      app.loadStoredPhrases();
      if (!app.openOptionsMode) {
        app.refreshContext();
      }
    }
  })
  .catch((error) => {
    const resolved = resolveRuntimeError(error);
    app.updateStatus("error", `宿主握手失败：${resolved.message}`);
  });
