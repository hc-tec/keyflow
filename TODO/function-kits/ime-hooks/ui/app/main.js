const kitId = "ime-hooks";
const surface = "panel";

const storageKeys = ["observeThrottleMs", "observeMaxChars", "interceptTimeoutMs", "interceptMode", "interceptRegex"];

const defaultSettings = {
  observeThrottleMs: 120,
  observeMaxChars: 256,
  interceptTimeoutMs: 1200,
  interceptMode: "regex",
  interceptRegex: "(转账|验证码|密码|api\\s*key)"
};

const allowedInterceptModes = ["allow", "block", "regex", "prompt"];

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

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function truncate(value, maxChars) {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
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

let interceptListenerOff = null;
let promptHandle = null;

const app = globalThis.PetiteVue.reactive({
  activeView: "observe",
  connected: false,
  status: {
    state: "idle",
    text: "等待宿主握手"
  },
  host: {
    surface,
    sessionId: null,
    buildName: null
  },
  permissions: [],
  caps: {
    canReadContext: false,
    canObserve: false,
    canIntercept: false,
    canReadStorage: false,
    canWriteStorage: false
  },
  settings: {
    observeThrottleMs: String(defaultSettings.observeThrottleMs),
    observeMaxChars: String(defaultSettings.observeMaxChars),
    interceptTimeoutMs: String(defaultSettings.interceptTimeoutMs),
    interceptMode: defaultSettings.interceptMode,
    interceptRegex: defaultSettings.interceptRegex
  },
  observe: {
    running: false,
    stop: null
  },
  intercept: {
    registered: false
  },
  context: null,
  contextMeta: {
    text: "等待上下文",
    variant: ""
  },
  lastIntentJsonText: "null",
  lastDecision: {
    text: "暂无",
    variant: "badge--muted"
  },
  pending: {
    visible: false,
    countdownText: "倒计时",
    intentKind: "-",
    actionId: "-",
    actionLabel: "-",
    beforeCursor: "-"
  },
  logs: [],

  get sessionMetaText() {
    const build = this.host.buildName ? ` · build=${this.host.buildName}` : "";
    return `surface=${this.host.surface} · session=${this.host.sessionId ?? "pending"}${build}`;
  },

  get logsText() {
    return this.logs.length ? this.logs.join("\n") : "等待事件";
  },

  get observeHintText() {
    const missing = [];
    if (!this.caps.canReadContext) {
      missing.push("context.read");
    }
    if (!this.caps.canObserve) {
      missing.push("input.observe.best_effort");
    }
    if (!this.caps.canIntercept) {
      missing.push("send.intercept.ime_action");
    }
    if (missing.length > 0) {
      return `缺少授权：${missing.join(", ")}。请到宿主设置中开启权限。`;
    }
    return "说明：这是“快照同步”式监听，不保证每次输入都能触发事件；宿主会节流与去重。";
  },

  get canRefreshContext() {
    return this.connected && this.caps.canReadContext;
  },

  get canStartObserve() {
    return this.connected && this.caps.canObserve && !this.observe.running;
  },

  get canStopObserve() {
    return this.connected && this.observe.running;
  },

  get canRegisterIntercept() {
    return this.connected && this.caps.canIntercept && !this.intercept.registered;
  },

  get canUnregisterIntercept() {
    return this.connected && this.intercept.registered;
  },

  get interceptBadgeClass() {
    return this.intercept.registered ? "badge--warning" : "badge--muted";
  },

  get interceptBadgeText() {
    return this.intercept.registered ? "已注册" : "未注册";
  },

  get contextMetaBadgeText() {
    if (this.contextMeta && typeof this.contextMeta.text === "string" && this.contextMeta.text) {
      return this.contextMeta.text;
    }
    return this.context ? "已同步" : "等待上下文";
  },

  get contextMetaBadgeClass() {
    return this.contextMeta?.variant || "";
  },

  get contextPackageText() {
    const sourcePackage = this.context?.sourcePackage ?? this.context?.packageName ?? "-";
    return sourcePackage || "-";
  },

  get contextSelectionText() {
    const start = Number.isFinite(this.context?.selectionStart) ? this.context.selectionStart : null;
    const end = Number.isFinite(this.context?.selectionEnd) ? this.context.selectionEnd : null;
    return start != null && end != null ? `${start}-${end}` : "-";
  },

  get contextBeforeCursorText() {
    return truncate(this.context?.beforeCursor ?? "-", 160) || "-";
  },

  get contextSelectedText() {
    return truncate(this.context?.selectedText ?? "-", 160) || "-";
  },

  get contextAfterCursorText() {
    return truncate(this.context?.afterCursor ?? "-", 160) || "-";
  },

  get contextPreeditText() {
    return truncate(this.context?.preeditText ?? "-", 160) || "-";
  },

  get contextJsonText() {
    return safeJson(this.context ?? null);
  },

  get lastDecisionText() {
    return this.lastDecision?.text || "暂无";
  },

  get lastDecisionBadgeClass() {
    if (!this.lastDecision || typeof this.lastDecision.variant !== "string") {
      return "badge--muted";
    }
    return this.lastDecision.variant;
  },

  setView(viewName) {
    const resolved = safeText(viewName);
    this.activeView = resolved || this.activeView || "observe";
  },

  updateStatus(state, text) {
    this.status.state = state;
    this.status.text = text;
  },

  setLastDecision(text, variant = "") {
    this.lastDecision.text = text;
    this.lastDecision.variant = variant || "";
  },

  setContext(context, meta = null) {
    this.context = context && typeof context === "object" ? context : null;

    if (!meta) {
      this.contextMeta = {
        text: this.context ? "已同步" : "等待上下文",
        variant: ""
      };
      return;
    }

    const parts = [];
    if (meta.reason) {
      parts.push(`reason=${meta.reason}`);
    }
    if (meta.trigger) {
      parts.push(`trigger=${meta.trigger}`);
    }
    if (meta.observe?.bestEffort) {
      parts.push("observe=bestEffort");
    }

    this.contextMeta = {
      text: parts.join(" · ") || "已同步",
      variant: meta.reason === "input.observe.best_effort" ? "badge--warning" : ""
    };
  },

  logLine(message, data) {
    const line = data ? `${nowIso()} ${message} ${safeJson(data)}` : `${nowIso()} ${message}`;
    this.logs.push(line);
    if (this.logs.length > 160) {
      this.logs.splice(0, this.logs.length - 160);
    }
  },

  clearLogs() {
    this.logs = [];
  },

  isPermissionGranted(permission) {
    return kit.hasPermission(permission);
  },

  syncCaps() {
    this.caps.canReadContext = kit.hasPermission("context.read");
    this.caps.canObserve = kit.hasPermission("input.observe.best_effort");
    this.caps.canIntercept = kit.hasPermission("send.intercept.ime_action");
    this.caps.canReadStorage = kit.hasPermission("storage.read");
    this.caps.canWriteStorage = kit.hasPermission("storage.write");
  },

  normalizeObserveOptions() {
    const throttleMs = clampNumber(this.settings.observeThrottleMs, defaultSettings.observeThrottleMs, 16, 2000);
    const maxChars = clampNumber(this.settings.observeMaxChars, defaultSettings.observeMaxChars, 16, 1024);
    this.settings.observeThrottleMs = String(throttleMs);
    this.settings.observeMaxChars = String(maxChars);
    return { throttleMs, maxChars };
  },

  normalizeInterceptOptions() {
    const timeoutMs = clampNumber(this.settings.interceptTimeoutMs, defaultSettings.interceptTimeoutMs, 100, 5000);
    const mode = safeText(this.settings.interceptMode) || defaultSettings.interceptMode;
    const resolvedMode = allowedInterceptModes.includes(mode) ? mode : defaultSettings.interceptMode;
    const rawRegexText =
      typeof this.settings.interceptRegex === "string" ? this.settings.interceptRegex : String(this.settings.interceptRegex ?? "");
    const regexText = rawRegexText || defaultSettings.interceptRegex;

    this.settings.interceptTimeoutMs = String(timeoutMs);
    this.settings.interceptMode = resolvedMode;
    this.settings.interceptRegex = rawRegexText;

    return { timeoutMs, mode: resolvedMode, regexText };
  },

  currentObserveOptions() {
    const throttleMs = clampNumber(this.settings.observeThrottleMs, defaultSettings.observeThrottleMs, 16, 2000);
    const maxChars = clampNumber(this.settings.observeMaxChars, defaultSettings.observeMaxChars, 16, 1024);
    return { throttleMs, maxChars };
  },

  currentInterceptOptions() {
    const timeoutMs = clampNumber(this.settings.interceptTimeoutMs, defaultSettings.interceptTimeoutMs, 100, 5000);
    const mode = safeText(this.settings.interceptMode) || defaultSettings.interceptMode;
    const resolvedMode = allowedInterceptModes.includes(mode) ? mode : defaultSettings.interceptMode;
    const regexText = String(this.settings.interceptRegex || defaultSettings.interceptRegex);
    return { timeoutMs, mode: resolvedMode, regexText };
  },

  async loadSettings() {
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
  },

  applySettings(settings) {
    const throttleMs = clampNumber(settings.observeThrottleMs, defaultSettings.observeThrottleMs, 16, 2000);
    const maxChars = clampNumber(settings.observeMaxChars, defaultSettings.observeMaxChars, 16, 1024);
    const timeoutMs = clampNumber(settings.interceptTimeoutMs, defaultSettings.interceptTimeoutMs, 100, 5000);

    const mode = safeText(settings.interceptMode) || defaultSettings.interceptMode;
    const resolvedMode = allowedInterceptModes.includes(mode) ? mode : defaultSettings.interceptMode;

    this.settings.observeThrottleMs = String(throttleMs);
    this.settings.observeMaxChars = String(maxChars);
    this.settings.interceptTimeoutMs = String(timeoutMs);
    this.settings.interceptMode = resolvedMode;
    this.settings.interceptRegex = String(settings.interceptRegex || defaultSettings.interceptRegex);
  },

  async saveSettings() {
    if (!kit.hasPermission("storage.write")) {
      return;
    }

    const observe = this.currentObserveOptions();
    const intercept = this.currentInterceptOptions();
    const settings = {
      observeThrottleMs: observe.throttleMs,
      observeMaxChars: observe.maxChars,
      interceptTimeoutMs: intercept.timeoutMs,
      interceptMode: intercept.mode,
      interceptRegex: intercept.regexText
    };

    try {
      await kit.storage.set(settings);
      this.logLine("settings.save", settings);
    } catch (error) {
      this.logLine("settings.save.error", resolveRuntimeError(error));
    }
  },

  onObserveOptionsChange() {
    this.normalizeObserveOptions();
    this.saveSettings();
  },

  onInterceptTimeoutChange() {
    this.normalizeInterceptOptions();
    this.saveSettings();
  },

  onInterceptRegexChange() {
    this.settings.interceptRegex = String(this.settings.interceptRegex || "");
    this.saveSettings();
  },

  setInterceptMode(mode) {
    const resolved = safeText(mode);
    this.settings.interceptMode = allowedInterceptModes.includes(resolved) ? resolved : defaultSettings.interceptMode;
    this.saveSettings();
  },

  openSettings() {
    kit.settings.open({});
  },

  async refreshContext(reason = "user-refresh") {
    if (!kit.hasPermission("context.read")) {
      this.updateStatus("error", "缺少 context.read 授权");
      return;
    }

    this.updateStatus("busy", "正在请求宿主上下文");
    try {
      const context = await kit.context.refresh({ reason });
      this.setContext(context);
      this.updateStatus("ready", "上下文已同步");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `同步上下文失败：${resolved.message}`);
    }
  },

  async startObserve() {
    if (!kit.hasPermission("input.observe.best_effort")) {
      this.updateStatus("error", "缺少 input.observe.best_effort 授权");
      return;
    }

    const { throttleMs, maxChars } = this.normalizeObserveOptions();
    this.updateStatus("busy", "正在启用输入监听");
    try {
      if (this.observe.stop) {
        await this.observe.stop().catch(() => {});
        this.observe.stop = null;
      }
      this.observe.stop = await kit.input.observeBestEffort({ throttleMs, maxChars });
      this.observe.running = true;
      this.logLine("observe.start", { throttleMs, maxChars });
      this.updateStatus("ready", "已启用输入监听（best-effort）");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `启用输入监听失败：${resolved.message}`);
    }
  },

  async stopObserve() {
    if (!this.observe.stop) {
      this.observe.running = false;
      return;
    }

    this.updateStatus("busy", "正在关闭输入监听");
    try {
      await this.observe.stop();
      this.logLine("observe.stop");
      this.updateStatus("ready", "已关闭输入监听（best-effort）");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `关闭输入监听失败：${resolved.message}`);
    } finally {
      this.observe.stop = null;
      this.observe.running = false;
    }
  },

  async registerIntercept() {
    if (!kit.hasPermission("send.intercept.ime_action")) {
      this.updateStatus("error", "缺少 send.intercept.ime_action 授权");
      return;
    }

    const { timeoutMs } = this.normalizeInterceptOptions();
    this.updateStatus("busy", "正在注册发送拦截");
    try {
      await kit.send.registerImeActionInterceptor({ timeoutMs });
      ensureInterceptListener();
      this.intercept.registered = true;
      this.logLine("send.intercept.register", { timeoutMs });
      this.updateStatus("ready", "已注册发送拦截（IME action）");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `注册失败：${resolved.message}`);
    }
  },

  async unregisterIntercept() {
    this.updateStatus("busy", "正在取消发送拦截");
    try {
      await kit.send.unregisterImeActionInterceptor({});
      this.logLine("send.intercept.unregister");
      this.updateStatus("ready", "已取消发送拦截（IME action）");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `取消失败：${resolved.message}`);
    } finally {
      this.intercept.registered = false;
      if (interceptListenerOff) {
        interceptListenerOff();
        interceptListenerOff = null;
      }
      hidePrompt();
    }
  },

  decidePrompt(allow) {
    if (!promptHandle) {
      return;
    }

    if (allow) {
      this.logLine("send.intent.prompt -> allow");
      promptHandle.finish(true, "已放行");
      return;
    }

    this.logLine("send.intent.prompt -> block");
    promptHandle.finish(false, "已拦截");
  },

  async enableAll() {
    await this.registerIntercept();
    await this.startObserve();
  }
});

function hidePrompt() {
  if (!promptHandle) {
    app.pending.visible = false;
    return;
  }
  app.pending.visible = false;
  window.clearInterval(promptHandle.intervalId);
  window.clearTimeout(promptHandle.timeoutId);
  promptHandle = null;
}

function startPrompt(intent, context, timeoutMs) {
  hidePrompt();

  const budgetMs = Math.max(120, Math.min(timeoutMs - 120, timeoutMs));
  const deadlineAt = Date.now() + budgetMs;

  app.pending.intentKind = intent?.kind ?? "-";
  app.pending.actionId = intent?.actionId != null ? String(intent.actionId) : "-";
  app.pending.actionLabel = intent?.actionLabel ?? "-";
  app.pending.beforeCursor = truncate(context?.beforeCursor ?? "", 140) || "-";

  app.pending.visible = true;
  app.pending.countdownText = `${budgetMs}ms`;

  return new Promise((resolve) => {
    const finish = (allow, label) => {
      app.setLastDecision(label, allow ? "" : "badge--danger");
      hidePrompt();
      resolve(allow);
    };

    const intervalId = window.setInterval(() => {
      const remaining = deadlineAt - Date.now();
      app.pending.countdownText = `${Math.max(0, remaining)}ms`;
    }, 100);

    const timeoutId = window.setTimeout(() => {
      app.logLine("send.intent.timeout -> allow");
      finish(true, "超时放行");
    }, budgetMs);

    promptHandle = { intervalId, timeoutId, finish };
  });
}

function ensureInterceptListener() {
  if (interceptListenerOff) {
    return;
  }

  interceptListenerOff = kit.send.onImeActionIntent(async ({ intent, context, envelope }) => {
    const meta = {
      receivedAt: nowIso(),
      intent,
      context,
      kitId: envelope?.kitId ?? kitId
    };

    app.lastIntentJsonText = safeJson(meta);
    app.setLastDecision("等待决策", "badge--muted");
    app.logLine("send.intent", meta);

    const { mode, regexText, timeoutMs } = app.currentInterceptOptions();

    if (mode === "block") {
      app.setLastDecision("全部拦截", "badge--danger");
      return { allow: false };
    }

    if (mode === "regex") {
      let allow = true;
      try {
        const pattern = new RegExp(regexText, "i");
        const text = String(context?.beforeCursor ?? "");
        allow = !pattern.test(text);
      } catch (error) {
        app.logLine("send.intent.regex.error -> allow", { message: String(error?.message ?? error) });
        allow = true;
      }

      app.setLastDecision(allow ? "正则未命中，放行" : "正则命中，拦截", allow ? "" : "badge--danger");
      return { allow };
    }

    if (mode === "prompt") {
      const allow = await startPrompt(intent, context, timeoutMs);
      return { allow };
    }

    app.setLastDecision("全部放行");
    return { allow: true };
  });
}

globalThis.PetiteVue.createApp(app).mount("#app");

app.setContext(null);
app.syncCaps();

kit.on("ready", async ({ sessionId, permissions, hostInfo }) => {
  app.connected = true;
  app.host.sessionId = sessionId ?? null;
  app.host.buildName = hostInfo?.build?.displayName ?? null;
  app.permissions = ensureArray(permissions);
  app.syncCaps();

  app.updateStatus("ready", "宿主握手完成");

  const settings = await app.loadSettings();
  app.applySettings(settings);
  app.refreshContext("boot");
});

kit.on("permissions", ({ permissions }) => {
  app.permissions = ensureArray(permissions);
  app.syncCaps();
});

kit.on("host", ({ hostInfo }) => {
  app.host.buildName = hostInfo?.build?.displayName ?? app.host.buildName;
});

kit.on("host.update", ({ label, details }) => {
  if (label) {
    app.logLine("host.update", { label, details });
    app.updateStatus("ready", label);
  }
});

kit.on("context", ({ context, envelope }) => {
  const payload = envelope?.payload && typeof envelope.payload === "object" ? envelope.payload : {};
  const request = payload.request && typeof payload.request === "object" ? payload.request : {};
  const observe = payload.observe && typeof payload.observe === "object" ? payload.observe : null;

  const meta = {
    reason: safeText(request.reason),
    trigger: safeText(request.trigger),
    observe
  };

  app.setContext(context, meta);

  if (meta.reason || meta.trigger || observe) {
    app.logLine("context.sync", meta);
  }
});

kit.on("error", ({ error }) => {
  const resolved = resolveRuntimeError(error);
  app.logLine("error", resolved);
  app.updateStatus("error", resolved.message);
});

kit.connect().catch((error) => {
  const resolved = resolveRuntimeError(error);
  app.logLine("connect.error", resolved);
  app.updateStatus("error", `宿主握手失败：${resolved.message}`);
});
