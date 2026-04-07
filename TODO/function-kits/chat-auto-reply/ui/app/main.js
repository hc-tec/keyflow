const kitId = "chat-auto-reply";
const surface = "panel";

const storageKeys = ["preferredTone", "personaNote", "autoReplace", "lastActiveTab"];

const defaultSettings = {
  preferredTone: "balanced",
  personaNote: "",
  autoReplace: false,
  lastActiveTab: "candidates"
};

function clone(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
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

function parseModifierList(raw) {
  return (raw || "")
    .split(/\n|；|;|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildPreviewCandidates(seed, preferredTone, modifierText) {
  const variants = [
    [
      {
        id: "candidate-1",
        text: "收到，我先把第一版整理出来，今晚前发你过一遍。",
        tone: "稳妥",
        risk: "low",
        rationale: "确认动作与时间，但不过度承诺。"
      },
      {
        id: "candidate-2",
        text: "明白，我先把结构和关键点收一下，整理好后发你确认。",
        tone: "中性",
        risk: "low",
        rationale: "强调先收口方案，适合信息还不完整时使用。"
      },
      {
        id: "candidate-3",
        text: "行，我先出个第一版，你晚上看完我们再定下一步。",
        tone: "配合",
        risk: "medium",
        rationale: "语气更口语化，但时间边界略弱。"
      }
    ],
    [
      {
        id: "candidate-4",
        text: "可以，我先把第一版框架收敛一下，今晚发你看。",
        tone: "直接",
        risk: "low",
        rationale: "更短更直接，适合追求效率的工作沟通。"
      },
      {
        id: "candidate-5",
        text: "收到，我先整理到可 review 的程度，晚上同步给你。",
        tone: "平衡",
        risk: "low",
        rationale: "兼顾时间边界与可交付状态。"
      },
      {
        id: "candidate-6",
        text: "明白，我先把要点收口，晚点发你过一眼。",
        tone: "轻量",
        risk: "medium",
        rationale: "更轻一些，但时间节点没有完全钉死。"
      }
    ],
    [
      {
        id: "candidate-7",
        text: "好，我先整理第一版，今晚确认完细节就发你。",
        tone: "温和",
        risk: "low",
        rationale: "保留确认动作，避免过度承诺。"
      },
      {
        id: "candidate-8",
        text: "收到，我先把结构搭好，晚上发你看是否需要补充。",
        tone: "协作",
        risk: "low",
        rationale: "强调共同 review，适合同事协作。"
      },
      {
        id: "candidate-9",
        text: "可以，我先出一版，晚上你看完我们再决定下一步。",
        tone: "推进",
        risk: "medium",
        rationale: "更强调后续推进，但即时承诺较弱。"
      }
    ]
  ];

  const variant = variants[seed % variants.length].map((candidate) => ({ ...candidate }));
  const toneSuffix =
    preferredTone === "direct" ? "（偏直接）" : preferredTone === "warm" ? "（偏温和）" : "（平衡）";

  return variant.map((candidate) => ({
    ...candidate,
    tone: `${candidate.tone}${toneSuffix}`,
    rationale: modifierText ? `${candidate.rationale} 已附加指令：${modifierText}` : candidate.rationale,
    actions: [
      {
        type: "insert",
        label: "插入"
      },
      {
        type: "replace",
        label: "替换"
      }
    ]
  }));
}

function buildPreviewContext(settings) {
  const personaChips = ["工作沟通", "简洁", "不强承诺", "可直接发送"];
  if (settings.personaNote) {
    personaChips.push(`备注：${settings.personaNote}`);
  }

  return {
    sourceMessage: "对方刚刚说：这周先把第一版方案整理出来，晚上我再看。",
    personaChips,
    conversationSummary: "当前对话目标是把第一版方案收口并给出今晚同步的时间边界。"
  };
}

function normalizeAction(action) {
  if (typeof action === "string") {
    const type = action.trim();
    return type ? { type } : null;
  }
  if (!action || typeof action !== "object") {
    return null;
  }
  const type = safeText(action.type);
  if (!type) {
    return null;
  }
  const label = safeText(action.label);
  return label ? { type, label } : { type };
}

function normalizeCandidate(candidate, index) {
  const normalized = candidate && typeof candidate === "object" ? candidate : { text: String(candidate ?? "") };
  const id = safeText(normalized.id) || `candidate-${index + 1}`;
  const declaredActions = ensureArray(normalized.actions).map(normalizeAction).filter(Boolean);

  return {
    id,
    text: typeof normalized.text === "string" ? normalized.text : String(normalized.text ?? ""),
    tone: typeof normalized.tone === "string" && normalized.tone.trim() ? normalized.tone : "未知",
    risk: typeof normalized.risk === "string" && normalized.risk.trim() ? normalized.risk : "unknown",
    rationale: typeof normalized.rationale === "string" ? normalized.rationale : "",
    declaredActions
  };
}

function resolveActionLabel(action) {
  const actionType = safeText(action?.type);
  const actionLabel = safeText(action?.label);
  if (actionLabel) {
    return actionLabel;
  }
  if (actionType === "replace") {
    return "替换";
  }
  if (actionType === "regenerate") {
    return "换一批";
  }
  if (actionType === "insert") {
    return "插入";
  }
  return actionType || "执行";
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
    context: buildPreviewContext(defaultSettings)
  },
  candidatesGenerator({ seed, preferredTone, modifiers }) {
    const modifierText = ensureArray(modifiers).join("；");
    return buildPreviewCandidates(seed, preferredTone, modifierText);
  },
  aiCandidatesGenerator() {
    return buildPreviewCandidates(0, "balanced", "").map((candidate) => ({
      ...candidate,
      id: `preview-ai-${candidate.id}`,
      tone: "AI（预览）"
    }));
  }
});

const app = globalThis.PetiteVue.reactive({
  activeTab: defaultSettings.lastActiveTab,
  settings: { ...defaultSettings },
  permissions: [],
  hostInfo: null,
  context: null,
  lastRequestContext: null,
  candidates: [],
  candidatePanel: {
    mode: "notice",
    title: "等待候选",
    message: "宿主返回 `candidates.render` 后，这里会出现可插入或替换的候选卡片。",
    meta: null
  },
  modifierText: "",
  aiBusy: false,
  bootstrapCompleted: false,
  openOptionsMode: false,
  status: {
    state: "idle",
    text: "等待宿主握手"
  },
  caps: {
    canAiRequest: false,
    canRegenerate: false,
    canContext: false,
    canReadStorage: false,
    canWriteStorage: false,
    canOpenSettings: false
  },

  get metaText() {
    const host = this.hostInfo ? `${this.hostInfo.platform}/${this.hostInfo.runtime}` : "host=pending";
    const executionMode = this.hostInfo?.executionMode ? `mode=${this.hostInfo.executionMode}` : null;
    const build = this.hostInfo?.build?.displayName ? `build=${this.hostInfo.build.displayName}` : null;
    return [`surface=${surface}`, `tab=${this.activeTab}`, host, executionMode, build].filter(Boolean).join(" · ");
  },

  get personaChips() {
    const chips = ensureArray(this.context?.personaChips ?? []);
    return chips.filter((value) => typeof value === "string" && value.trim());
  },

  get hostModeNotice() {
    const hostInfo = this.hostInfo;
    if (!hostInfo) {
      return { visible: false, badge: "", text: "" };
    }

    const isPreview = hostInfo.build?.displayName === "preview";
    const executionMode = hostInfo.executionMode || "";
    const modeMessage = typeof hostInfo.modeMessage === "string" ? hostInfo.modeMessage.trim() : "";

    if (isPreview) {
      return {
        visible: true,
        badge: "本地示例模式",
        text: "当前在浏览器预览 mock-host 中运行，不连接真实宿主或网络推理。"
      };
    }

    if (executionMode === "local-demo") {
      return {
        visible: true,
        badge: "本地示例模式",
        text: modeMessage || "当前仅使用本地示例候选，不连接远程 Agent、主机服务或网络推理。"
      };
    }

    return { visible: false, badge: "", text: "" };
  },

  get hostCapabilitiesText() {
    const hostLine = this.hostInfo ? `宿主：${this.hostInfo.platform} / ${this.hostInfo.runtime}` : "宿主：等待握手";
    const modeLine = this.hostInfo?.executionMode ? `模式：${this.hostInfo.executionMode}` : "模式：等待握手";
    const permissionLine = `权限：${ensureArray(this.permissions).join(",") || "none"}`;
    return [hostLine, modeLine, permissionLine].join("；");
  },

  get renderedCandidates() {
    const autoReplace = Boolean(this.settings.autoReplace);
    const fallback = (autoReplace ? ["replace", "insert"] : ["insert", "replace"]).map((type) => ({ type }));

    return this.candidates.map((candidate) => ({
      ...candidate,
      actions: candidate.declaredActions.length ? candidate.declaredActions : fallback
    }));
  },

  updateStatus(state, text) {
    this.status.state = state;
    this.status.text = text;
  },

  setCandidatePanel(mode, title, message, meta) {
    this.candidatePanel.mode = mode;
    this.candidatePanel.title = title;
    this.candidatePanel.message = message;
    this.candidatePanel.meta = meta || null;
  },

  syncCapabilities() {
    this.caps.canAiRequest = kit.hasPermission("ai.request") && !this.aiBusy;
    this.caps.canRegenerate = kit.hasPermission("candidates.regenerate") && !this.aiBusy;
    this.caps.canContext = kit.hasPermission("context.read") && !this.aiBusy;
    this.caps.canReadStorage = kit.hasPermission("storage.read") && !this.aiBusy;
    this.caps.canWriteStorage = kit.hasPermission("storage.write") && !this.aiBusy;
    this.caps.canOpenSettings = kit.hasPermission("settings.open") && !this.aiBusy;
  },

  persistLastActiveTab(tab) {
    this.settings.lastActiveTab = tab;
    if (!kit.hasPermission("storage.write")) {
      return;
    }
    kit.storage.set({ lastActiveTab: tab }).catch(() => {});
  },

  setActiveTab(tabName, options = {}) {
    const nextTab = safeText(tabName);
    if (!nextTab) {
      return;
    }
    this.activeTab = nextTab;
    if (options.persist !== false) {
      this.persistLastActiveTab(nextTab);
    }
  },

  setPreferredTone(value) {
    this.settings.preferredTone = safeText(value) || defaultSettings.preferredTone;
  },

  onAutoReplaceChanged() {
    if (this.candidates.length > 0) {
      this.setCandidatePanel("list", "", "", null);
    }
  },

  openSettings() {
    kit.settings.open({});
  },

  requestContext() {
    this.refreshContext("manual", []);
  },

  refreshContext(reason, modifiers) {
    if (!kit.hasPermission("context.read")) {
      this.updateStatus("error", "缺少 context.read 授权");
      return Promise.resolve(null);
    }

    this.updateStatus("busy", "正在请求宿主上下文");
    return kit.context
      .refresh({
        reason: reason || "user-refresh",
        preferredTone: this.settings.preferredTone,
        modifiers: ensureArray(modifiers)
      })
      .then((context) => {
        this.context = clone(context);
        this.updateStatus("ready", "上下文已同步");
        return context;
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `同步上下文失败：${resolved.message}`);
        return null;
      });
  },

  regenerateCandidates(reason, modifiers) {
    if (!kit.hasPermission("candidates.regenerate")) {
      this.updateStatus("error", "缺少 candidates.regenerate 授权");
      return;
    }

    this.updateStatus("busy", "正在请求新一批候选");
    kit.candidates.regenerate({
      reason: reason || "user-refresh",
      modifiers: ensureArray(modifiers),
      preferredTone: this.settings.preferredTone
    });
  },

  refreshCandidates() {
    this.regenerateCandidates("user-refresh", []);
  },

  applyModifier() {
    this.regenerateCandidates("user-modifier", parseModifierList(this.modifierText));
  },

  isCandidateActionDisabled(actionType) {
    const type = safeText(actionType);
    if (!type) {
      return false;
    }
    if (this.aiBusy) {
      return true;
    }
    if (type === "replace") {
      return !kit.hasPermission("input.replace");
    }
    if (type === "regenerate") {
      return !kit.hasPermission("candidates.regenerate");
    }
    return !kit.hasPermission("input.insert");
  },

  resolveActionLabel(action) {
    return resolveActionLabel(action);
  },

  runCandidateAction(candidate, action) {
    const actionType = safeText(action?.type);
    if (!actionType) {
      return;
    }
    const candidateId = safeText(candidate?.id);
    const text = typeof candidate?.text === "string" ? candidate.text : String(candidate?.text ?? "");
    const label = resolveActionLabel(action);

    if (actionType === "replace") {
      kit.input.replace({
        candidateId,
        text,
        commitMode: "replace"
      });
      this.updateStatus("ready", `已发送${label}请求`);
      return;
    }

    if (actionType === "regenerate") {
      this.regenerateCandidates("candidate-action", []);
      return;
    }

    kit.input.insert({
      candidateId,
      text,
      commitMode: "insert"
    });
    this.updateStatus("ready", `已发送${label}请求`);
  },

  setCandidates(candidates, requestContext) {
    this.lastRequestContext = requestContext && typeof requestContext === "object" ? clone(requestContext) : null;
    this.candidates = ensureArray(candidates).map(normalizeCandidate);

    if (this.lastRequestContext) {
      this.context = clone(this.lastRequestContext);
    }

    if (this.candidates.length === 0) {
      this.setCandidatePanel("notice", "暂无候选", "宿主还没有返回可展示的候选结果。", null);
      return;
    }

    this.setCandidatePanel("list", "", "", null);
  },

  applySettings(nextSettings, options = {}) {
    const resolved = {
      ...defaultSettings,
      ...(nextSettings && typeof nextSettings === "object" ? nextSettings : {})
    };
    this.settings = { ...this.settings, ...resolved };

    if (!this.openOptionsMode && typeof resolved.lastActiveTab === "string" && resolved.lastActiveTab) {
      this.setActiveTab(resolved.lastActiveTab, { persist: false });
    }

    if (options.persist === true) {
      this.saveSettings().catch(() => {});
    }
  },

  async loadStoredSettings() {
    if (!kit.hasPermission("storage.read")) {
      this.updateStatus("error", "缺少 storage.read 授权");
      return;
    }

    this.updateStatus("busy", "正在读取已保存设置");
    try {
      const values = await kit.storage.get(storageKeys);
      this.applySettings(values, { persist: false });
      this.updateStatus("ready", "设置已同步");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `读取设置失败：${resolved.message}`);
    }
  },

  async saveSettings() {
    if (!kit.hasPermission("storage.write")) {
      this.updateStatus("error", "缺少 storage.write 授权");
      return;
    }

    this.updateStatus("busy", "正在保存设置");
    try {
      await kit.storage.set({
        preferredTone: this.settings.preferredTone,
        personaNote: this.settings.personaNote,
        autoReplace: Boolean(this.settings.autoReplace),
        lastActiveTab: this.activeTab
      });
      this.updateStatus("ready", "设置已保存");
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `保存设置失败：${resolved.message}`);
    }
  },

  async startAiChat() {
    const modifiers = parseModifierList(this.modifierText);
    if (this.aiBusy) {
      return;
    }

    if (!kit.hasPermission("ai.request")) {
      this.updateStatus("error", "缺少 ai.request 授权");
      if (this.activeTab === "candidates") {
        this.setCandidatePanel("notice", "AI 生成失败", "缺少 ai.request 授权", null);
      }
      return;
    }

    this.aiBusy = true;
    this.syncCapabilities();
    this.setCandidatePanel("notice", "AI 生成中", "等待宿主返回 `ai.response`。", null);
    this.updateStatus("busy", "正在调用 AI 生成候选");

    const context = this.context || (await this.refreshContext("ai-generate", modifiers)) || {};
    const systemPrompt =
      "你是 Android 输入法里的聊天自动回复引擎。只返回一个 JSON 对象，不要输出 Markdown，不要解释，不要代码围栏。" +
      "JSON 结构必须是：{\"candidates\":[{\"text\":\"...\",\"tone\":\"...\",\"risk\":\"low|medium|high\",\"rationale\":\"...\"}]}";

    try {
      const result = await kit.ai.request({
        task: { title: "生成候选回复" },
        route: { kind: "host-shared" },
        systemPrompt,
        prompt: "根据输入生成 3 条可直接发送的聊天自动回复候选。严格只输出 JSON。",
        response: { type: "json" },
        input: {
          ...(context && typeof context === "object" ? context : {}),
          preferredTone: this.settings.preferredTone,
          personaNote: this.settings.personaNote,
          modifiers: ensureArray(modifiers)
        },
        temperature: 0.6,
        maxTokens: 800
      });

      if (result?.status && result.status !== "succeeded") {
        const message =
          typeof result?.error?.message === "string" && result.error.message.trim()
            ? result.error.message.trim()
            : `AI 请求失败：${String(result.status)}`;
        throw new Error(message);
      }

      const output = result?.output ?? {};
      const structured =
        output && typeof output === "object" && output.type === "json" && output.json && typeof output.json === "object"
          ? output.json
          : null;
      const candidates = ensureArray(structured?.candidates);
      const requestContext =
        (result && typeof result.requestContext === "object" && result.requestContext) ||
        (context && typeof context === "object" ? context : {});

      this.setCandidates(candidates, requestContext);
      this.updateStatus("ready", `AI 已生成 ${candidates.length} 条候选`);
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.updateStatus("error", `AI 生成失败：${resolved.message}`);
      if (this.activeTab === "candidates") {
        const meta = resolved.meta ? String(resolved.meta) : null;
        this.setCandidatePanel("notice", "AI 生成失败", resolved.message, meta);
      }
    } finally {
      this.aiBusy = false;
      this.syncCapabilities();
    }
  }
});

globalThis.PetiteVue.createApp(app).mount("#app");
app.syncCapabilities();

kit.on("ready", ({ permissions, hostInfo }) => {
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.hostInfo = hostInfo ?? null;
  app.syncCapabilities();
  app.updateStatus("ready", "宿主握手完成");

  if (!app.bootstrapCompleted) {
    app.bootstrapCompleted = true;
    app.loadStoredSettings();
    if (!app.openOptionsMode) {
      app.refreshContext("boot", []);
    }
  }
});

kit.on("permissions", ({ permissions }) => {
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
});

kit.on("host", ({ hostInfo }) => {
  app.hostInfo = hostInfo ?? app.hostInfo;
});

kit.on("host.update", ({ label, details }) => {
  const intent = details && typeof details === "object" ? details.intent : null;
  if (intent && typeof intent === "object" && intent.kind === "open_options") {
    app.openOptionsMode = true;
    app.setActiveTab("settings", { persist: false });
  }
  if (!label) {
    return;
  }
  const nextStatus = app.aiBusy ? "busy" : "ready";
  app.updateStatus(nextStatus, label);
});

kit.raw.on("binding.invoke", (envelope) => {
  const payload = envelope?.payload ?? {};
  const binding = payload?.binding ?? {};
  const title = binding.title || binding.id || "Binding";
  const trigger = payload.trigger || "manual";
  const clipboardText = typeof payload.clipboardText === "string" ? payload.clipboardText.trim() : "";

  app.updateStatus("ready", `触发动作：${title}`);
  if (clipboardText) {
    app.setCandidatePanel(
      "notice",
      `绑定触发 · ${title}`,
      `来源：${trigger}\n剪贴板：${clipboardText.slice(0, 160)}`,
      null
    );
  } else {
    app.setCandidatePanel("notice", `绑定触发 · ${title}`, `来源：${trigger}`, null);
  }
});

kit.on("context", ({ context }) => {
  app.context = clone(context);
});

kit.on("candidates", ({ candidates, requestContext }) => {
  app.setCandidates(candidates, requestContext);
  const nextStatus = app.aiBusy ? "busy" : "ready";
  app.updateStatus(nextStatus, `已渲染 ${ensureArray(candidates).length} 条候选`);
});

kit.on("storage", ({ values }) => {
  if (!values || typeof values !== "object") {
    return;
  }
  app.applySettings(values, { persist: false });
});

kit.on("error", ({ error }) => {
  const resolved = resolveRuntimeError(error);
  app.updateStatus("error", resolved.message);
});

kit.connect().catch((error) => {
  const resolved = resolveRuntimeError(error);
  app.updateStatus("error", `宿主握手失败：${resolved.message}`);
});

