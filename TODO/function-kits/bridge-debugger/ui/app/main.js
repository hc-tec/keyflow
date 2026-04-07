const kitId = "bridge-debugger";
const surface = "panel";

const storageKeys = {
  observeThrottleMs: "observeThrottleMs",
  observeMaxChars: "observeMaxChars",
  interceptTimeoutMs: "interceptTimeoutMs",
  interceptPolicy: "interceptPolicy",
  interceptRegex: "interceptRegex"
};

const defaults = {
  observeThrottleMs: 120,
  observeMaxChars: 256,
  interceptTimeoutMs: 800,
  interceptPolicy: "allow",
  interceptRegex: ""
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
    storage: {
      [storageKeys.observeThrottleMs]: defaults.observeThrottleMs,
      [storageKeys.observeMaxChars]: defaults.observeMaxChars,
      [storageKeys.interceptTimeoutMs]: defaults.interceptTimeoutMs,
      [storageKeys.interceptPolicy]: defaults.interceptPolicy,
      [storageKeys.interceptRegex]: defaults.interceptRegex
    },
    context: {
      sourceMessage: "预览模式：在真实宿主连接后，这里会显示输入框上下文。",
      sourcePackage: "preview.mock.host",
      selectionStart: 0,
      selectionEnd: 0,
      selectedText: "预览选区",
      beforeCursor: "hello ",
      afterCursor: "world"
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
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function safeString(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function previewText(value, maxChars = 60) {
  const text = safeString(value).trim();
  if (!text) {
    return "-";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatClock(date) {
  const pad = (num, size = 2) => String(num).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function resolveEnvelopeType(envelope) {
  return safeString(envelope?.type || envelope?.kind || envelope?.t || "").trim() || "unknown";
}

function summarizeEnvelope(type, envelope) {
  const payload = envelope?.payload ?? {};

  if (type === "debug.envelope") {
    const direction = safeString(payload?.direction).trim();
    const arrow = direction === "ui->host" ? "⇢" : direction === "host->ui" ? "⇠" : "";
    const inner = payload?.envelope ?? {};
    const innerType = safeString(inner?.type).trim();
    const messageId = safeString(inner?.messageId).trim();
    const replyTo = safeString(inner?.replyTo).trim();
    const parts = [];
    if (innerType) parts.push(`${arrow}${innerType}`);
    if (messageId) parts.push(messageId);
    if (replyTo) parts.push(`replyTo=${replyTo}`);
    return parts.join(" · ");
  }

  if (type === "debug.request") {
    const phase = safeString(payload?.phase).trim();
    const requestType = safeString(payload?.requestType).trim();
    const messageId = safeString(payload?.messageId).trim();
    const durationMs = Number.isFinite(payload?.durationMs) ? `${payload.durationMs}ms` : "";
    const timeoutMs = Number.isFinite(payload?.timeoutMs) ? `${payload.timeoutMs}ms` : "";
    const errorKind = safeString(payload?.error?.kind).trim();
    const errorMessage = safeString(payload?.error?.message).trim();
    const parts = [];
    if (phase) parts.push(`phase=${phase}`);
    if (requestType) parts.push(requestType);
    if (messageId) parts.push(messageId);
    if (durationMs) parts.push(`rtt=${durationMs}`);
    if (timeoutMs && phase === "pending") parts.push(`timeout=${timeoutMs}`);
    if (errorKind) parts.push(`error=${errorKind}`);
    if (errorMessage && phase === "rejected") parts.push(`msg=${previewText(errorMessage, 60)}`);
    return parts.join(" · ");
  }

  if (type === "debug.drop") {
    const reason = safeString(payload?.reason).trim();
    const droppedType = safeString(payload?.envelope?.type).trim();
    const messageId = safeString(payload?.envelope?.messageId ?? payload?.messageId).trim();
    const parts = [];
    if (reason) parts.push(`reason=${reason}`);
    if (droppedType) parts.push(droppedType);
    if (messageId) parts.push(messageId);
    return parts.join(" · ");
  }

  if (type === "bridge.ready.ack") {
    const sessionId = payload?.sessionId ?? payload?.session?.id ?? payload?.session?.sessionId;
    return sessionId ? `session=${sessionId}` : "";
  }

  if (type === "permissions.sync") {
    const permissions = payload?.permissions;
    return Array.isArray(permissions) ? `count=${permissions.length}` : "";
  }

  if (type === "context.sync") {
    const reason = safeString(payload?.request?.reason ?? payload?.reason ?? "").trim();
    const pkg = safeString(payload?.context?.sourcePackage ?? payload?.context?.sourcePackageName ?? payload?.sourcePackage ?? "").trim();
    const selectedText = payload?.context?.selectedText;
    const selectionPreview =
      typeof selectedText === "string" && selectedText.trim().length > 0 ? `selected="${previewText(selectedText, 18)}"` : "";
    const parts = [];
    if (reason) parts.push(`reason=${reason}`);
    if (pkg) parts.push(`pkg=${pkg}`);
    if (selectionPreview) parts.push(selectionPreview);
    return parts.join(" · ");
  }

  if (type === "binding.invoke") {
    const trigger = safeString(payload?.trigger).trim();
    const bindingTitle = safeString(payload?.binding?.title ?? payload?.binding?.id).trim();
    return [trigger, bindingTitle].filter(Boolean).join(" · ");
  }

  if (type === "send.intercept.ime_action.intent") {
    const kind = safeString(payload?.intent?.kind ?? payload?.kind).trim();
    const actionId = safeString(payload?.intent?.actionId ?? payload?.actionId).trim();
    const pkg = safeString(payload?.context?.sourcePackage ?? "").trim();
    return [kind ? `intent=${kind}` : "", actionId ? `actionId=${actionId}` : "", pkg ? `pkg=${pkg}` : ""].filter(Boolean).join(" · ");
  }

  if (type === "bridge.error") {
    const message = safeString(payload?.message ?? payload?.error ?? payload?.reason ?? "").trim();
    return message ? previewText(message, 80) : "";
  }

  if (payload && typeof payload === "object") {
    const keys = Object.keys(payload);
    if (keys.length > 0) {
      const shown = keys.slice(0, 5).join(",");
      return `keys=${shown}${keys.length > 5 ? ",…" : ""}`;
    }
  }

  return "";
}

function copyText(text) {
  const payload = safeString(text);
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    clipboard.writeText(payload).catch(() => {
      window.prompt("复制下面的内容：", payload);
    });
  } else {
    window.prompt("复制下面的内容：", payload);
  }
}

function regexMatches(value, pattern) {
  const candidate = safeString(value);
  const rawPattern = safeString(pattern).trim();
  if (!rawPattern) {
    return false;
  }
  try {
    const re = new RegExp(rawPattern);
    return re.test(candidate);
  } catch {
    return false;
  }
}

const app = globalThis.PetiteVue.reactive({
  activeView: "binding",
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
    canReadContext: false,
    canObserve: false,
    canIntercept: false
  },
  binding: {
    envelope: null,
    highlight: false
  },
  bindingTrigger: "-",
  bindingName: "-",
  bindingClipboardText: "-",
  bindingSelectedText: "-",
  bindingSourcePackage: "-",
  bindingPayloadText: "暂无（通过「剪贴板动作」或「功能件动作」触发一个 binding 进入这里）",
  commitText: "",
  context: null,
  lastContextEnvelope: null,
  contextPayloadText: "等待宿主上下文",
  contextMetaText: "尚未连接宿主",
  observe: {
    throttleMs: defaults.observeThrottleMs,
    maxChars: defaults.observeMaxChars,
    running: false,
    contextSyncCount: 0,
    stop: null
  },
  intercept: {
    timeoutMs: defaults.interceptTimeoutMs,
    regex: defaults.interceptRegex,
    policy: defaults.interceptPolicy,
    registered: false,
    pendingDecision: null,
    logLines: [],
    detach: null
  },
  trace: {
    maxEntries: 200,
    entries: []
  },
  traceText: "暂无（连接宿主后会自动记录所有 raw envelope）",

  get sessionMetaText() {
    const build = this.host.buildName ? ` · build=${this.host.buildName}` : "";
    return `surface=${this.host.surface} · session=${this.host.sessionId ?? "pending"}${build}`;
  },

  get statusMetaText() {
    return this.status.metaOverride || this.sessionMetaText;
  },

  get interceptLogText() {
    return this.intercept.logLines.length ? this.intercept.logLines.join("\n") : "暂无";
  },

  setView(viewName) {
    const resolved = safeString(viewName).trim();
    this.activeView = resolved || this.activeView || "binding";
  },

  updateStatus(state, text, metaOverride) {
    this.status.state = state;
    this.status.text = text;
    this.status.metaOverride = metaOverride || null;
  },

  syncCapabilities() {
    this.caps.canInsert = kit.hasPermission("input.insert");
    this.caps.canReplace = kit.hasPermission("input.replace");
    this.caps.canReadStorage = kit.hasPermission("storage.read");
    this.caps.canWriteStorage = kit.hasPermission("storage.write");
    this.caps.canReadContext = kit.hasPermission("context.read");
    this.caps.canObserve = kit.hasPermission("input.observe.best_effort");
    this.caps.canIntercept = kit.hasPermission("send.intercept.ime_action");
  },

  openSettings() {
    kit.settings.open({});
  },

  refreshContext() {
    if (!kit.hasPermission("context.read")) {
      this.updateStatus("error", "缺少 context.read 授权", "permissions=context.read");
      return;
    }

    this.updateStatus("busy", "正在请求上下文");
    kit.context
      .refresh({ reason: "manual-debug-refresh" })
      .then((context) => {
        this.context = context ?? null;
        this.lastContextEnvelope = null;
        this.contextPayloadText = this.context ? safeJson(this.context) : "等待宿主上下文";
        this.contextMetaText = this.context ? "已同步" : "尚未连接宿主";
        this.updateStatus("ready", "上下文已同步");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `同步上下文失败：${resolved.message}`);
      });
  },

  clearBinding() {
    this.binding.envelope = null;
    this.binding.highlight = false;
    this.bindingTrigger = "-";
    this.bindingName = "-";
    this.bindingClipboardText = "-";
    this.bindingSelectedText = "-";
    this.bindingSourcePackage = "-";
    this.bindingPayloadText = "暂无（通过「剪贴板动作」或「功能件动作」触发一个 binding 进入这里）";
  },

  copyClipboardText() {
    const text = this.binding.envelope?.payload?.clipboardText;
    if (typeof text !== "string" || text.trim().length === 0) {
      this.updateStatus("error", "当前没有 clipboardText 可复制");
      return;
    }
    copyText(text);
    this.updateStatus("ready", "已复制 clipboardText");
  },

  copyBindingEnvelope() {
    const raw = safeString(this.bindingPayloadText);
    if (!raw.trim()) {
      this.updateStatus("error", "当前没有 raw envelope 可复制");
      return;
    }
    copyText(raw);
    this.updateStatus("ready", "已复制 raw envelope");
  },

  copyContextEnvelope() {
    copyText(this.contextPayloadText || "");
    this.updateStatus("ready", "已复制 context JSON");
  },

  copyTrace() {
    if (this.trace.entries.length === 0) {
      this.updateStatus("error", "当前没有 trace 可复制");
      return;
    }
    copyText(safeJson(this.trace.entries));
    this.updateStatus("ready", "已复制 trace JSON");
  },

  clearTrace() {
    this.trace.entries = [];
    this.traceText = "暂无（连接宿主后会自动记录所有 raw envelope）";
    this.updateStatus("ready", "Trace 已清空");
  },

  pushTrace(envelope) {
    const type = resolveEnvelopeType(envelope);
    const ts = formatClock(new Date());
    const summary = summarizeEnvelope(type, envelope);

    const last = this.trace.entries[this.trace.entries.length - 1];
    if (last && last.type === type && last.summary === summary) {
      last.repeat += 1;
      last.ts = ts;
      last.envelope = envelope;
    } else {
      this.trace.entries.push({ ts, type, summary, repeat: 1, envelope });
      if (this.trace.entries.length > this.trace.maxEntries) {
        this.trace.entries.splice(0, this.trace.entries.length - this.trace.maxEntries);
      }
    }

    const lines = this.trace.entries.map((entry) => {
      const repeat = entry.repeat > 1 ? ` x${entry.repeat}` : "";
      const suffix = entry.summary ? ` · ${entry.summary}` : "";
      return `[${entry.ts}] ${entry.type}${repeat}${suffix}`;
    });
    this.traceText = lines.join("\n") || "暂无（连接宿主后会自动记录所有 raw envelope）";
  },

  applySettings(values) {
    const v = values && typeof values === "object" ? values : {};

    this.observe.throttleMs = clampInt(v[storageKeys.observeThrottleMs], 16, 2000, defaults.observeThrottleMs);
    this.observe.maxChars = clampInt(v[storageKeys.observeMaxChars], 16, 1024, defaults.observeMaxChars);
    this.intercept.timeoutMs = clampInt(v[storageKeys.interceptTimeoutMs], 100, 5000, defaults.interceptTimeoutMs);
    this.intercept.policy = safeString(v[storageKeys.interceptPolicy] || defaults.interceptPolicy).trim() || defaults.interceptPolicy;
    this.intercept.regex = safeString(v[storageKeys.interceptRegex] || "");
  },

  loadSettings() {
    if (!kit.hasPermission("storage.read")) {
      this.updateStatus("error", "缺少 storage.read 授权", "permissions=storage.read");
      return;
    }

    this.updateStatus("busy", "正在读取设置");
    kit.storage
      .get(Object.values(storageKeys))
      .then((values) => {
        this.applySettings(values);
        this.updateStatus("ready", "设置已读取");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `读取失败：${resolved.message}`);
      });
  },

  saveSettings() {
    if (!kit.hasPermission("storage.write")) {
      this.updateStatus("error", "缺少 storage.write 授权", "permissions=storage.write");
      return;
    }

    const payload = {
      [storageKeys.observeThrottleMs]: clampInt(this.observe.throttleMs, 16, 2000, defaults.observeThrottleMs),
      [storageKeys.observeMaxChars]: clampInt(this.observe.maxChars, 16, 1024, defaults.observeMaxChars),
      [storageKeys.interceptTimeoutMs]: clampInt(this.intercept.timeoutMs, 100, 5000, defaults.interceptTimeoutMs),
      [storageKeys.interceptPolicy]: safeString(this.intercept.policy),
      [storageKeys.interceptRegex]: safeString(this.intercept.regex || "")
    };

    this.updateStatus("busy", "正在保存设置");
    kit.storage
      .set(payload)
      .then(() => {
        this.updateStatus("ready", "设置已保存");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `保存失败：${resolved.message}`);
      });
  },

  insertCommitText() {
    if (!kit.hasPermission("input.insert")) {
      this.updateStatus("error", "缺少 input.insert 授权", "permissions=input.insert");
      return;
    }
    kit.input.insert({ text: safeString(this.commitText) });
    this.updateStatus("busy", "已提交插入请求");
  },

  replaceCommitText() {
    if (!kit.hasPermission("input.replace")) {
      this.updateStatus("error", "缺少 input.replace 授权", "permissions=input.replace");
      return;
    }
    kit.input.replace({ text: safeString(this.commitText) });
    this.updateStatus("busy", "已提交替换请求");
  },

  startObserve() {
    if (!kit.hasPermission("input.observe.best_effort")) {
      this.updateStatus("error", "缺少 input.observe.best_effort 授权", "permissions=input.observe.best_effort");
      return;
    }

    const throttleMs = clampInt(this.observe.throttleMs, 16, 2000, defaults.observeThrottleMs);
    const maxChars = clampInt(this.observe.maxChars, 16, 1024, defaults.observeMaxChars);
    this.observe.throttleMs = throttleMs;
    this.observe.maxChars = maxChars;

    this.updateStatus("busy", "正在启动 best-effort 观察");
    kit.input
      .observeBestEffort({ throttleMs, maxChars })
      .then((stop) => {
        this.observe.stop = stop;
        this.observe.running = true;
        this.updateStatus("ready", "best-effort 观察已启动");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `启动失败：${resolved.message}`);
      });
  },

  stopObserve() {
    if (!this.observe.stop) {
      this.observe.running = false;
      return;
    }

    const stop = this.observe.stop;
    this.updateStatus("busy", "正在停止 best-effort 观察");
    Promise.resolve()
      .then(() => stop())
      .then(() => {
        this.observe.stop = null;
        this.observe.running = false;
        this.updateStatus("ready", "best-effort 观察已停止");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `停止失败：${resolved.message}`);
      });
  },

  pushInterceptLog(line) {
    const ts = new Date().toLocaleTimeString();
    this.intercept.logLines.unshift(`[${ts}] ${line}`);
    this.intercept.logLines = this.intercept.logLines.slice(0, 60);
  },

  clearPendingDecision() {
    const pending = this.intercept.pendingDecision;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutId);
    this.intercept.pendingDecision = null;
  },

  resolvePendingDecision(allow) {
    const pending = this.intercept.pendingDecision;
    if (!pending) {
      return;
    }
    this.clearPendingDecision();
    pending.resolve(Boolean(allow));
  },

  waitManualDecision(timeoutMs) {
    this.clearPendingDecision();

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pushInterceptLog("Manual decision timeout → allow");
        this.clearPendingDecision();
        resolve(true);
      }, Math.max(100, timeoutMs - 50));

      this.intercept.pendingDecision = { resolve, timeoutId };
    });
  },

  registerSendIntercept() {
    if (!kit.hasPermission("send.intercept.ime_action")) {
      this.updateStatus("error", "缺少 send.intercept.ime_action 授权", "permissions=send.intercept.ime_action");
      return;
    }

    const timeoutMs = clampInt(this.intercept.timeoutMs, 100, 5000, defaults.interceptTimeoutMs);
    this.intercept.timeoutMs = timeoutMs;

    this.updateStatus("busy", "正在注册发送拦截");
    kit.send
      .registerImeActionInterceptor({ timeoutMs })
      .then(() => {
        this.intercept.registered = true;
        this.updateStatus("ready", "发送拦截已注册");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `注册失败：${resolved.message}`);
      });
  },

  unregisterSendIntercept() {
    this.updateStatus("busy", "正在取消发送拦截");
    kit.send
      .unregisterImeActionInterceptor({})
      .then(() => {
        this.intercept.registered = false;
        this.clearPendingDecision();
        this.updateStatus("ready", "发送拦截已取消");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `取消失败：${resolved.message}`);
      });
  },

  setInterceptPolicy(policy) {
    const resolved = safeString(policy).trim();
    if (!resolved) {
      return;
    }
    this.intercept.policy = resolved;
  }
});

globalThis.PetiteVue.createApp(app).mount("#app");

app.applySettings(defaults);
app.syncCapabilities();

kit.on("ready", ({ sessionId, permissions, hostInfo }) => {
  app.host.sessionId = sessionId ?? null;
  app.host.buildName = hostInfo?.build?.displayName ?? null;
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
  app.updateStatus("ready", "宿主已连接");

  app.loadSettings();
  app.refreshContext();
});

kit.on("permissions", ({ permissions }) => {
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
});

kit.on("context", ({ context, envelope }) => {
  app.context = context ?? null;
  app.lastContextEnvelope = envelope ?? null;
  app.observe.contextSyncCount += 1;

  if (!app.context) {
    app.contextPayloadText = "等待宿主上下文";
    app.contextMetaText = "尚未连接宿主";
    return;
  }

  const reason = envelope?.payload?.request?.reason ?? envelope?.payload?.reason ?? "";
  const observeMeta = envelope?.payload?.observe && typeof envelope.payload.observe === "object" ? envelope.payload.observe : null;
  const observeBadge = observeMeta?.enabled ? ` · observe=on(throttleMs=${observeMeta.throttleMs ?? "?"})` : "";

  app.contextPayloadText = safeJson(app.context);
  const metaParts = [];
  if (reason) {
    metaParts.push(`reason=${reason}`);
  }
  if (app.context.sourcePackage) {
    metaParts.push(`pkg=${app.context.sourcePackage}`);
  }
  if (typeof app.context.selectionStart === "number" && typeof app.context.selectionEnd === "number") {
    metaParts.push(`sel=${app.context.selectionStart}-${app.context.selectionEnd}`);
  }
  app.contextMetaText = `${metaParts.join(" · ")}${observeBadge}`.trim() || "宿主未提供额外元数据";
});

kit.on("host", ({ hostInfo }) => {
  app.host.buildName = hostInfo?.build?.displayName ?? app.host.buildName;
});

kit.on("host.update", ({ label }) => {
  if (label) {
    app.updateStatus("ready", label);
  }
});

kit.on("error", ({ error }) => {
  const resolved = resolveRuntimeError(error);
  app.updateStatus("error", resolved.message);
});

kit.raw.on("*", (envelope) => {
  app.pushTrace(envelope);
});

kit.raw.on("binding.invoke", (envelope) => {
  app.binding.envelope = envelope ?? null;
  app.setView("binding");
  app.binding.highlight = true;

  if (!envelope) {
    app.clearBinding();
    return;
  }

  const payload = envelope?.payload ?? {};
  const binding = payload?.binding ?? {};
  const context = payload?.context ?? {};

  const trigger = safeString(payload?.trigger) || "-";
  const bindingId = safeString(binding?.id) || "-";
  const bindingTitle = safeString(binding?.title).trim();
  app.bindingTrigger = trigger;
  app.bindingName = bindingTitle ? `${bindingTitle} · ${bindingId}` : bindingId;
  app.bindingClipboardText = previewText(payload?.clipboardText, 72);
  app.bindingSelectedText = previewText(context?.selectedText, 72);
  app.bindingSourcePackage = safeString(context?.sourcePackage) || "-";
  app.bindingPayloadText = safeJson(envelope);

  const title = bindingTitle || bindingId || "binding.invoke";
  app.updateStatus("ready", `触发：${title}`);

  const clipboardText = payload?.clipboardText;
  const selectedText = context?.selectedText;
  const suggested =
    typeof clipboardText === "string" && clipboardText.trim().length > 0
      ? clipboardText
      : typeof selectedText === "string" && selectedText.trim().length > 0
        ? selectedText
        : "";
  if (suggested) {
    app.commitText = suggested;
  }

  const bindingDetails = document.getElementById("bindingDetails");
  if (bindingDetails) {
    bindingDetails.open = true;
  }

  const bindingCard = document.getElementById("bindingCard");
  if (bindingCard) {
    bindingCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.setTimeout(() => {
    app.binding.highlight = false;
  }, 1200);
});

app.intercept.detach = kit.send.onImeActionIntent(async ({ intent, context }) => {
  const policy = safeString(app.intercept.policy || defaults.interceptPolicy);
  const timeoutMs = clampInt(app.intercept.timeoutMs, 100, 5000, defaults.interceptTimeoutMs);
  const beforeCursor = context?.beforeCursor ?? context?.sourceMessage ?? "";

  let allow = true;
  if (policy === "block") {
    allow = false;
  } else if (policy === "regex") {
    allow = !regexMatches(beforeCursor, app.intercept.regex);
    if (!safeString(app.intercept.regex).trim()) {
      app.pushInterceptLog("regex policy enabled but regex is empty");
    }
  } else if (policy === "manual") {
    app.pushInterceptLog(`intent arrived (${intent?.kind ?? "unknown"}) → waiting manual decision`);
    allow = await app.waitManualDecision(timeoutMs);
  }

  app.pushInterceptLog(
    `intent=${intent?.kind ?? "unknown"} actionId=${intent?.actionId ?? "-"} allow=${allow} pkg=${context?.sourcePackage ?? "-"}`
  );
  return { allow };
});

window.addEventListener("beforeunload", () => {
  try {
    app.clearPendingDecision();
    app.intercept.detach?.();
  } catch {
    // ignore
  }
});

kit.connect().catch((error) => {
  const resolved = resolveRuntimeError(error);
  app.updateStatus("error", `宿主握手失败：${resolved.message}`);
});

