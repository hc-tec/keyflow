const KIT_ID = "tone-rewrite";
const SURFACE = "panel";
const BUILD_ID = "0.2.0";
const DEBUG_LOGS = false;
const SUPPORTED_TONES = ["shorter", "longer", "polite", "casual", "emoji"];

function debugLog(message) {
  if (DEBUG_LOGS) {
    console.info(message);
  }
}

debugLog(`[tone-rewrite] boot ${BUILD_ID}`);

function safeText(value) {
  return typeof value === "string" ? value : "";
}

function toneMeta(tone) {
  switch (tone) {
    case "shorter":
      return {
        tone,
        label: "更短",
        hint: "压缩赘述，保留重点",
        detail: "压缩成更利落的短消息，不丢掉关键信息。",
        taskTitle: "语气改写：更短",
        instruction: "把原文压缩得更短、更干净，删掉重复和赘述，但不要丢失核心意思。",
        temperature: 0.2,
        maxTokens: 256
      };
    case "longer":
      return {
        tone,
        label: "更长",
        hint: "适度展开，补足表达",
        detail: "在不改变原意的前提下适度展开，让表达更完整。",
        taskTitle: "语气改写：更长",
        instruction: "在不改变原意的前提下适度展开，补足必要语气、解释或承接，但仍保持像真实聊天消息。",
        temperature: 0.4,
        maxTokens: 640
      };
    case "polite":
      return {
        tone,
        label: "更礼貌",
        hint: "更有分寸，更客气",
        detail: "提升礼貌和分寸感，但不要变成生硬模板腔。",
        taskTitle: "语气改写：更礼貌",
        instruction: "把语气改得更礼貌、更有分寸，但仍然自然，不能太官方或太生硬。",
        temperature: 0.28,
        maxTokens: 512
      };
    case "casual":
      return {
        tone,
        label: "更口语",
        hint: "更像真人聊天",
        detail: "改成更自然、更口语化的说法，减少书面感。",
        taskTitle: "语气改写：更口语",
        instruction: "改得更口语、更自然，像真人聊天会说的话，减少书面感和刻意修饰。",
        temperature: 0.38,
        maxTokens: 512
      };
    case "emoji":
      return {
        tone,
        label: "加个 emoji",
        hint: "点到为止，更有气氛",
        detail: "只补 1 到 2 个贴切 emoji，增强氛围，不要堆砌。",
        taskTitle: "语气改写：加个 emoji",
        instruction: "保持原意和整体语气，只在合适位置补 1 到 2 个贴切的 emoji，不要堆砌，也不要显得幼稚。",
        temperature: 0.32,
        maxTokens: 512
      };
    default:
      return toneMeta("shorter");
  }
}

function toneFromBindingId(bindingId) {
  const id = safeText(bindingId);
  const suffix = id.split(".")[1] || "";
  return SUPPORTED_TONES.includes(suffix) ? suffix : null;
}

function viewFromBindingId(bindingId) {
  const tone = toneFromBindingId(bindingId);
  return tone === "casual" ? "panel" : "preview";
}

function parseOpenInvocationHash() {
  const rawHash = safeText(window.location && window.location.hash);
  if (!rawHash || rawHash === "#") return null;
  const query = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const params = new URLSearchParams(query);
  const kind = safeText(params.get("fk_intent") || params.get("intent"));
  if (kind !== "open_invocation") return null;
  return {
    kind,
    invocationId: safeText(params.get("invocationId")),
    bindingId: safeText(params.get("bindingId")),
    bindingTitle: safeText(params.get("bindingTitle"))
  };
}

function buildPrompt(tone, sourceText) {
  const meta = toneMeta(tone);
  const systemPrompt =
    "你是中文聊天消息的语气改写器。要求：\\n" +
    "1) 保持原意，不编造事实，不添加无关内容。\\n" +
    "2) 尽量保留原有格式（换行/表情/标点）。\\n" +
    "3) 只输出改写后的消息正文，不要解释，不要加引号，不要列点。";

  const userPrompt =
    `请把下面这段聊天消息改写成「${meta.label}」：\\n\\n` +
    `原文：\\n${sourceText.trim()}\\n\\n` +
    `改写要求：${meta.instruction}`;

  return {
    systemPrompt,
    userPrompt,
    taskTitle: meta.taskTitle,
    temperature: meta.temperature,
    maxTokens: meta.maxTokens
  };
}

function cleanAiText(text) {
  let value = safeText(text).trim();
  if (!value) return "";
  // Common model artifacts: surrounding quotes or code fences.
  value = value.replace(/^```[a-zA-Z]*\\s*/g, "").replace(/```\\s*$/g, "").trim();
  value = value.replace(/^["“”']+/, "").replace(/["“”']+$/, "").trim();
  return value;
}

function extractContextText(ctx) {
  const safeContext = ctx && typeof ctx === "object" ? ctx : {};
  const before = safeText(safeContext.beforeCursor);
  const selected = safeText(safeContext.selectedText);
  const after = safeText(safeContext.afterCursor);
  const preedit = safeText(safeContext.preeditText);
  const selectedTrimmed = selected.trim();
  if (selectedTrimmed) return selectedTrimmed;
  if (preedit.trim()) return preedit.trim();
  const combinedTrimmed = `${before}${after}`.trim();
  if (combinedTrimmed) return combinedTrimmed;
  return "";
}

function extractSourceText(invocation) {
  const clipboardText = safeText(invocation && invocation.clipboardText);
  const contextText = extractContextText(invocation && invocation.context);
  const trigger = safeText(invocation && invocation.trigger).toLowerCase();
  if (trigger === "clipboard" && clipboardText.trim()) return clipboardText.trim();
  if (contextText) return contextText;
  if (clipboardText.trim()) return clipboardText.trim();
  return "";
}

function userFacingErrorMessage(error) {
  const code = safeText(error && error.code);
  if (code === "permission_denied") return "权限不足：请在功能件设置中允许所需能力。";
  if (code === "ai_request_not_ready") return "宿主 AI 未就绪：请先在输入法设置里配置 AI。";
  return "执行失败：请稍后重试。";
}

const kit = window.FunctionKitRuntimeSDK.createKit({ kitId: KIT_ID, surface: SURFACE });

function App() {
  let runSeq = 0;
  let lastHandledInvocationId = null;
  let lastOpenIntentInvocationId = null;
  let expectedInvocationId = null;
  let lastAcceptedInvocationAtEpochMs = 0;
  let connectPromise = null;
  let pendingOpenFallbackToken = 0;
  const autoInvocationStates = new Map();
  const AUTO_INVOCATION_STATE_LIMIT = 24;

  function pruneAutoInvocationStates() {
    while (autoInvocationStates.size > AUTO_INVOCATION_STATE_LIMIT) {
      const oldestKey = autoInvocationStates.keys().next().value;
      if (!oldestKey) break;
      autoInvocationStates.delete(oldestKey);
    }
  }

  function reserveAutoInvocation(invocationId) {
    const id = safeText(invocationId);
    if (!id) return true;
    const currentState = autoInvocationStates.get(id);
    if (currentState === "processing" || currentState === "done") {
      return false;
    }
    autoInvocationStates.set(id, "processing");
    pruneAutoInvocationStates();
    return true;
  }

  function completeAutoInvocation(invocationId) {
    const id = safeText(invocationId);
    if (!id) return;
    autoInvocationStates.set(id, "done");
    pruneAutoInvocationStates();
  }

  const state = {
    status: "idle", // idle | loading | ready | done | error
    statusText: "选效果 → 点生成",
    statusKind: "muted", // muted | success | error
    busy: false,
    presentation: "panel", // panel | preview
    tone: "shorter",
    actionTitle: "",
    actionBindingId: "",
    actionInvocationId: "",
    sourceText: "",
    resultText: "",
    lastTone: null,
    lastInvocation: null,
    bridgeReady: false,
    toneOptions: SUPPORTED_TONES.map((tone) => toneMeta(tone)),

    get toneLabel() {
      return toneMeta(this.tone).label;
    },

    get currentToneHint() {
      return toneMeta(this.tone).detail;
    },

    get actionSubtitle() {
      const title = safeText(this.actionTitle);
      if (title) return `动作：${title}`;
      const tone = safeText(this.toneLabel);
      return tone ? `效果：${tone}` : "";
    },

    get canApply() {
      return !this.busy && this.status === "ready" && this.resultText.trim().length > 0;
    },
    get canCopy() {
      return !this.busy && (this.status === "ready" || this.status === "done") && this.resultText.trim().length > 0;
    },
    get canRerun() {
      return !this.busy && this.sourceText.trim().length > 0 && (this.status === "ready" || this.status === "done");
    },
    get canGenerate() {
      return !this.busy && this.sourceText.trim().length > 0;
    },

    resolveView(invocation) {
      const binding = invocation && invocation.binding && typeof invocation.binding === "object" ? invocation.binding : {};
      const entry = binding.entry && typeof binding.entry === "object" ? binding.entry : {};
      const entryView = safeText(entry.view).toLowerCase();
      if (entryView === "apply" || entryView === "preview" || entryView === "panel") {
        return entryView;
      }
      const preferred = safeText(binding.preferredPresentation).toLowerCase();
      if (preferred.startsWith("apply")) return "apply";
      if (preferred.includes("preview")) return "preview";
      if (preferred.startsWith("panel")) return "panel";
      return "panel";
    },

    resolveTone(invocation) {
      const binding = invocation && invocation.binding && typeof invocation.binding === "object" ? invocation.binding : {};
      const entry = binding.entry && typeof binding.entry === "object" ? binding.entry : {};
      const entryTone = safeText(entry.tone);
      const inferred =
        entryTone ||
        safeText(binding.id).split(".")[1] ||
        safeText(invocation && invocation.bindingId).split(".")[1] ||
        "shorter";
      return SUPPORTED_TONES.includes(inferred) ? inferred : "shorter";
    },

    async ensureConnected() {
      if (this.bridgeReady) return true;
      if (!connectPromise) {
        connectPromise = kit
          .connect()
          .then(() => {
            this.bridgeReady = true;
            return true;
          })
          .catch(() => false)
          .finally(() => {
            if (!this.bridgeReady) {
              connectPromise = null;
            }
          });
      }
      return connectPromise;
    },

    async handleInvocation(invocation) {
      const inv = invocation && typeof invocation === "object" ? invocation : null;
      if (!inv) return;
      const invocationId = safeText(inv.invocationId);
      debugLog(`[tone-rewrite] handleInvocation id=${invocationId || "-"} expected=${expectedInvocationId || "-"}`);
      if (expectedInvocationId && invocationId && invocationId !== expectedInvocationId) {
        return;
      }
      const createdAtEpochMs = Number.isFinite(inv.createdAtEpochMs) ? inv.createdAtEpochMs : 0;
      if (
        !expectedInvocationId &&
        createdAtEpochMs > 0 &&
        createdAtEpochMs < lastAcceptedInvocationAtEpochMs &&
        invocationId !== this.actionInvocationId
      ) {
        return;
      }
      if (invocationId && !reserveAutoInvocation(invocationId)) {
        debugLog(`[tone-rewrite] skip duplicate invocation id=${invocationId}`);
        return;
      }
      try {
        if (invocationId) {
          lastHandledInvocationId = invocationId;
        }
        pendingOpenFallbackToken += 1;

        const ready = await this.ensureConnected();
        if (!ready) {
          this.status = "error";
          this.statusKind = "error";
          this.statusText = "功能件桥接未就绪";
          return;
        }

        if (createdAtEpochMs > 0) {
          lastAcceptedInvocationAtEpochMs = Math.max(lastAcceptedInvocationAtEpochMs, createdAtEpochMs);
        }
        if (!expectedInvocationId || !invocationId || expectedInvocationId === invocationId) {
          expectedInvocationId = null;
        }

        this.lastInvocation = inv;
        const binding = inv.binding && typeof inv.binding === "object" ? inv.binding : {};
        this.actionTitle = safeText(binding.title);
        this.actionBindingId = safeText(binding.id);
        this.actionInvocationId = invocationId;
        const tone = this.resolveTone(inv);
        const view = this.resolveView(inv);

        this.tone = tone;
        // Headless runs should still land on a lightweight preview when user taps "打开".
        this.presentation = view === "preview" || view === "apply" ? "preview" : "panel";
        this.sourceText = extractSourceText(inv);
        this.resultText = "";
        this.lastTone = null;
        this.status = "idle";
        this.statusKind = "muted";
        this.statusText = "准备生成…";

        if (!this.sourceText.trim()) {
          await this.useCurrentInput();
        }

        if (!this.sourceText.trim()) {
          this.status = "error";
          this.statusKind = "error";
          this.statusText = "没有可改写的文本";
          return;
        }

        if (view === "apply") {
          await this.runTone(this.tone);
          if (this.status === "ready") {
            this.statusText = `已生成（${this.toneLabel}）：点一下替换`;
          }
          return;
        }

        await this.runTone(this.tone);
        if (view === "preview" && this.status === "ready") {
          this.statusText = `已生成预览（${this.toneLabel}）：点一下替换`;
        }
      } finally {
        completeAutoInvocation(invocationId);
      }
    },

    async init() {
      kit.bindings.onInvoke(({ invocation }) => {
        this.handleInvocation(invocation);
      });
      this.scheduleOpenInvocationFallback = async ({ invocationId, tone }) => {
        const token = ++pendingOpenFallbackToken;
        debugLog(`[tone-rewrite] scheduleFallback id=${invocationId || "-"} tone=${tone} token=${token}`);
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        if (token !== pendingOpenFallbackToken) {
          debugLog(`[tone-rewrite] cancelFallback id=${invocationId || "-"} token=${token} current=${pendingOpenFallbackToken}`);
          return;
        }
        if (invocationId && lastHandledInvocationId === invocationId) {
          debugLog(`[tone-rewrite] fallbackAlreadyHandled id=${invocationId}`);
          return;
        }
        if (invocationId && expectedInvocationId && expectedInvocationId !== invocationId) {
          debugLog(`[tone-rewrite] fallbackMismatched id=${invocationId} expected=${expectedInvocationId}`);
          return;
        }
        if (!this.sourceText.trim()) {
          await this.useCurrentInput();
        }
        if (this.sourceText.trim()) {
          debugLog(`[tone-rewrite] fallbackRun id=${invocationId || "-"} tone=${tone} sourceLen=${this.sourceText.trim().length}`);
          await this.runTone(tone);
        }
      };
      this.handleOpenInvocationIntent = async (intent) => {
        const kind = safeText(intent && intent.kind);
        if (kind !== "open_invocation") return;
        const ready = await this.ensureConnected();
        if (!ready) {
          this.status = "error";
          this.statusKind = "error";
          this.statusText = "功能件桥接未就绪";
          return;
        }

        const id = safeText(intent && intent.invocationId);
        const bindingId = safeText(intent && intent.bindingId);
        debugLog(`[tone-rewrite] handleOpenInvocationIntent id=${id || "-"} binding=${bindingId || "-"} lastHandled=${lastHandledInvocationId || "-"} lastOpen=${lastOpenIntentInvocationId || "-"}`);
        if (id && id === lastHandledInvocationId) {
          return;
        }
        if (id && id === lastOpenIntentInvocationId) {
          return;
        }
        if (id) {
          lastOpenIntentInvocationId = id;
        }
        if (id) {
          expectedInvocationId = id;
        }

        const bindingTitle = safeText(intent && intent.bindingTitle);
        const isNewInvocation = id && id !== this.actionInvocationId;
        if (isNewInvocation) {
          this.lastInvocation = null;
          this.sourceText = "";
          this.resultText = "";
          this.lastTone = null;
          this.status = "idle";
          this.statusKind = "muted";
          this.statusText = "准备生成…";
        }
        if (bindingId) {
          this.actionBindingId = bindingId;
        }
        this.actionTitle = bindingTitle || this.actionTitle || "";
        this.actionInvocationId = id || this.actionInvocationId || "";

        const last = kit.state && kit.state.lastInvocation ? kit.state.lastInvocation : null;
        const matchingLast = last && id && safeText(last.invocationId) === id ? last : null;

        if (matchingLast) {
          debugLog(`[tone-rewrite] openIntentMatchedLast id=${id}`);
          await this.handleInvocation(matchingLast);
          return;
        }

        const tone = toneFromBindingId(bindingId) || this.tone;
        if (tone !== this.tone) {
          this.tone = tone;
        }

        const view = viewFromBindingId(bindingId);
        this.presentation = view === "panel" ? "panel" : "preview";

        if (id) {
          this.scheduleOpenInvocationFallback({ invocationId: id, tone: this.tone });
          return;
        }
        if (!this.sourceText.trim()) {
          await this.useCurrentInput();
        }
        if (this.sourceText.trim()) {
          await this.runTone(this.tone);
        }
      };

      kit.runtime.onIntent(async ({ intent }) => {
        this.handleOpenInvocationIntent(intent);
      });

      const handleHashIntent = async () => {
        const intent = parseOpenInvocationHash();
        if (intent) {
          await this.handleOpenInvocationIntent(intent);
        }
      };
      window.addEventListener("hashchange", () => {
        handleHashIntent();
      });

      await this.ensureConnected();

      await handleHashIntent();

      const bootInvocation = kit.state && kit.state.lastInvocation ? kit.state.lastInvocation : null;
      const bootInvocationId = safeText(bootInvocation && bootInvocation.invocationId);
      if (
        bootInvocation &&
        bootInvocationId !== lastHandledInvocationId &&
        (!expectedInvocationId || !bootInvocationId || bootInvocationId === expectedInvocationId)
      ) {
        debugLog(`[tone-rewrite] bootInvocation id=${bootInvocationId || "-"}`);
        await this.handleInvocation(bootInvocation);
      }
    },

    setTone(tone) {
      if (this.busy) return;
      if (!SUPPORTED_TONES.includes(tone)) return;
      if (this.tone === tone) return;
      this.tone = tone;
      this.lastTone = null;
      this.resultText = "";
      this.status = "idle";
      this.statusKind = "muted";
      this.statusText = this.sourceText.trim() ? `已选择${toneMeta(tone).label}：点生成` : "请输入或读取原文";
    },

    generate() {
      this.runTone(this.tone);
    },

    async useCurrentInput() {
      if (this.busy) return;
      const ready = await this.ensureConnected();
      if (!ready) {
        this.status = "error";
        this.statusKind = "error";
        this.statusText = "读取失败";
        return;
      }
      try {
        const ctx = await kit.context.refresh();
        const before = safeText(ctx && ctx.beforeCursor);
        const after = safeText(ctx && ctx.afterCursor);
        const selected = safeText(ctx && ctx.selectedText);
        const preedit = safeText(ctx && ctx.preeditText);
        const selectedTrimmed = selected.trim();
        const combinedTrimmed = `${before}${after}`.trim();
        const text = selectedTrimmed || preedit.trim() || combinedTrimmed;
        if (!text.trim()) {
          this.status = "error";
          this.statusKind = "error";
          this.statusText = "当前输入为空";
          return;
        }
        this.sourceText = text;
        this.status = "idle";
        this.statusKind = "muted";
        this.statusText = "已读取当前输入";
      } catch (_error) {
        this.status = "error";
        this.statusKind = "error";
        this.statusText = "读取失败";
      }
    },

    clearAll() {
      if (this.busy) return;
      this.sourceText = "";
      this.resultText = "";
      this.status = "idle";
      this.statusKind = "muted";
      this.statusText = "选效果 → 点生成";
    },

    async runTone(tone) {
      this.tone = tone;
      const text = this.sourceText.trim();
      debugLog(`[tone-rewrite] runTone tone=${tone} actionId=${this.actionInvocationId || "-"} sourceLen=${text.length}`);
      if (!text) {
        this.status = "error";
        this.statusKind = "error";
        this.statusText = "请输入或读取原文";
        return;
      }
      const ready = await this.ensureConnected();
      if (!ready) {
        this.status = "error";
        this.statusKind = "error";
        this.statusText = "宿主连接失败";
        return;
      }

      const seq = ++runSeq;
      this.busy = true;
      this.status = "loading";
      this.statusKind = "muted";
      this.statusText = "生成中…";
      this.resultText = "";

      try {
        const { systemPrompt, userPrompt, taskTitle, temperature, maxTokens } = buildPrompt(tone, text);
        const resp = await kit.ai.request({
          task: { title: taskTitle },
          systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature,
          maxTokens
        });

        if (seq !== runSeq) return;
        const out = cleanAiText(resp && resp.output && resp.output.text);
        if (!out) {
          this.status = "error";
          this.statusKind = "error";
          this.statusText = "未生成结果";
          return;
        }
        this.resultText = out;
        this.lastTone = tone;
        this.status = "ready";
        this.statusKind = "success";
        this.statusText = `已生成${toneMeta(tone).label}版本：点一下替换`;
      } catch (error) {
        if (seq !== runSeq) return;
        this.status = "error";
        this.statusKind = "error";
        this.statusText = userFacingErrorMessage(error);
      } finally {
        if (seq === runSeq) {
          this.busy = false;
        }
      }
    },

    applyReplace() {
      if (!this.canApply) return;
      kit.input.replace(this.resultText.trim());
      this.status = "done";
      this.statusKind = "success";
      this.statusText = "已替换到输入框";
    },

    async copyResult() {
      if (!this.canCopy) return;
      try {
        await navigator.clipboard.writeText(this.resultText.trim());
        this.statusKind = "success";
        this.statusText = "已复制";
      } catch (_error) {
        this.statusKind = "error";
        this.statusText = "复制失败";
      }
    },

    rerun() {
      const tone = this.lastTone || this.tone;
      this.runTone(tone);
    }
  };
  return state;
}

const appState = window.PetiteVue.reactive(App());
window.PetiteVue.createApp(appState).mount("#app");
appState.init();
