/* global FunctionKitRuntimeSDK, PetiteVue */

(() => {
  const kitId = "wx-reply";
  const surface = "panel";
  const DEFAULT_PORT = 5678;
  const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
  const LOCAL_PROXY_ORIGIN = "https://function-kit.local";
  const EXTERNAL_RESOURCE_PROXY_BASE = `${LOCAL_PROXY_ORIGIN}/assets/__external__/`;
  const SETTINGS_KEY = "wxReply.settings.v2";
  const RECENT_CONTACTS_KEY = "wxReply.recentContacts.v2";
  const REPLY_COUNT = 2;
  const DEFAULT_CONTEXT_MESSAGE_COUNT = 20;
  const MIN_CONTEXT_MESSAGE_COUNT = 5;
  const MAX_CONTEXT_MESSAGE_COUNT = 50;
  const CONTEXT_MESSAGE_COUNT_STEP = 5;

  FunctionKitRuntimeSDK.preview.installIfMissing({
    kitId,
    surface,
    grantAll: true,
    executionMode: "local-demo",
    aiRequestHandler: ({ envelope }) => {
      const payload = envelope?.payload ?? {};
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const prompt = messages.map((item) => safeText(item?.content)).filter(Boolean).join("\n");
      const tonePreset = prompt.includes("高情商") ? "eq" : prompt.includes("日常闲聊") ? "daily" : "work";
      const personaMode = prompt.includes("融合我的画像") ? "merge-self" : "none";
      return {
        text: JSON.stringify({
          replies: buildFallbackReplies({
            latestMessage: "在吗？找你有点事。",
            tonePreset,
            personaMode,
            count: REPLY_COUNT
          })
        })
      };
    }
  });

  const kit = FunctionKitRuntimeSDK.createKit({
    kitId,
    surface,
    debug: false,
    connect: { timeoutMs: 20000, retries: 3 },
    preview: { grantAll: true, executionMode: "local-demo" }
  });

  const vm = {
    kit,
    screen: "picker",
    settingsReturnTo: "picker",
    toastTimer: null,
    autoGenerateTimer: null,
    avatarErrorMap: {},

    busy: {
      probing: false,
      searching: false,
      loadingPicker: false,
      loadingConversation: false,
      generating: false,
      saving: false
    },

    toast: {
      text: "",
      kind: "info"
    },

    service: {
      ok: null,
      lastError: "",
      state: {
        time: null,
        last_seq: null,
        contacts_loaded: null,
        self_username: "",
        write_auth_enabled: false
      }
    },

    settings: {
      baseUrl: DEFAULT_BASE_URL,
      apiToken: "",
      tonePreset: "work",
      personaMode: "merge-self",
      contextMessageCount: DEFAULT_CONTEXT_MESSAGE_COUNT
    },

    picker: {
      query: "",
      recentUsed: [],
      sessions: [],
      searchResults: []
    },

    compose: {
      contact: emptyContact(),
      message: "",
      history: [],
      replies: [],
      replyIntent: "",
      advancedOpen: false,
      lastInsertedReplyId: "",
      generationNonce: 0,
      profiles: {
        self: null,
        contact: null
      }
    },

    toneOptions: [
      { id: "work", label: "工作专业" },
      { id: "eq", label: "高情商" },
      { id: "daily", label: "日常闲聊" }
    ],

    get showRecentUsedSection() {
      return this.picker.recentUsed.length > 0;
    },

    get serviceStatusText() {
      const base = normalizeBaseUrl(this.settings.baseUrl);
      if (this.busy.probing) return `正在探活：${base}`;
      if (this.service.ok === true) return `已连接：${base} · last_seq=${this.service.state.last_seq ?? "-"}`;
      if (this.service.ok === false) return `${base} · ${this.service.lastError || "服务不可用"}`;
      return `尚未探活：${base}`;
    },

    get replyLeadText() {
      return this.settings.personaMode === "merge-self" ? "【懂你】" : "";
    },

    get contextMessageHint() {
      const configured = normalizeContextMessageCount(this.settings.contextMessageCount);
      const actual = Array.isArray(this.compose.history) ? Math.min(this.compose.history.length, configured) : 0;
      if (actual > 0) {
        return `当前会带上最近 ${actual} / ${configured} 条文本聊天记录，不只看最后一句。`;
      }
      return `默认会带上最近 ${configured} 条文本聊天记录，不只看最后一句。`;
    },

    async init() {
      try {
        await this.kit.connect();
      } catch (_) {
      }

      if (this.kit?.bindings?.onInvoke) {
        this.kit.bindings.onInvoke(({ invocation }) => {
          this.handleBindingInvoke(invocation);
        });
      }

      await this.loadStoredState();
      await this.probeService({ silent: true });
      if (this.service.ok) {
        await this.refreshPickerData({ silent: true });
      }
    },

    async loadStoredState() {
      if (!this.kit.hasPermission("storage.read")) return;
      try {
        const values = await this.kit.storage.get([SETTINGS_KEY, RECENT_CONTACTS_KEY]);
        const storedSettings = normalizeSettings(values?.[SETTINGS_KEY]);
        const storedRecentContacts = normalizeContactList(values?.[RECENT_CONTACTS_KEY]);

        this.settings = { ...this.settings, ...storedSettings };
        this.picker.recentUsed = storedRecentContacts.slice(0, 8);
      } catch (_) {
      }
    },

    async persistState({ withBusy = false, showToast = false } = {}) {
      if (!this.kit.hasPermission("storage.write")) return;

      if (withBusy) this.busy.saving = true;
      try {
        await this.kit.storage.set({
          [SETTINGS_KEY]: JSON.stringify(this.settings),
          [RECENT_CONTACTS_KEY]: JSON.stringify(this.picker.recentUsed.slice(0, 8))
        });
        if (showToast) {
          this.showToast("配置已保存", "success");
        }
      } catch (error) {
        this.showToast(`保存失败：${formatError(error)}`, "error");
      } finally {
        if (withBusy) this.busy.saving = false;
      }
    },

    handleBindingInvoke(invocation) {
      this.screen = "picker";
      this.compose.advancedOpen = false;
      this.clearReplies();

      const preferredView = safeText(invocation?.binding?.entry?.view);
      if (preferredView === "picker") {
        this.screen = "picker";
      }
    },

    openSettings(returnTo = "picker") {
      this.settingsReturnTo = returnTo;
      this.screen = "settings";
    },

    goBackFromSettings() {
      this.screen = this.settingsReturnTo || "picker";
    },

    goToPicker() {
      this.screen = "picker";
      this.compose.advancedOpen = false;
    },

    async attemptClose() {
      if (!this.kit.hasPermission("panel.state.write") || !this.kit.panel?.updateState) {
        this.showToast("当前宿主未开放面板关闭能力。", "error");
        return;
      }

      try {
        await this.kit.panel.updateState({ open: false, dismissed: true, visible: false });
      } catch (_) {
        this.showToast("当前宿主未实际处理关闭请求。", "error");
      }
    },

    onSearchInput(value) {
      this.picker.query = value;
      const trimmed = normalizeSearchQuery(value);
      if (!trimmed) {
        this.clearSearch({ syncInput: false });
        return;
      }

      this.picker.searchResults = this.searchLocalContacts(trimmed);
    },

    readLiveSearchQuery(query = undefined) {
      const direct = safeText(query);
      if (direct.trim()) {
        return direct;
      }

      if (typeof document !== "undefined") {
        const liveValue = safeText(document.querySelector(".search-box__input")?.value);
        if (liveValue.trim()) {
          return liveValue;
        }
      }

      return safeText(this.picker.query);
    },

    canTriggerSearch() {
      return !this.busy.searching && !!normalizeSearchQuery(this.readLiveSearchQuery());
    },

    clearSearch({ syncInput = true } = {}) {
      this.picker.query = "";
      this.picker.searchResults = [];
      this.busy.searching = false;

      if (syncInput && typeof document !== "undefined") {
        const input = document.querySelector(".search-box__input");
        if (input && input.value) {
          input.value = "";
        }
      }
    },

    async triggerSearch(query = undefined) {
      const liveQuery = this.readLiveSearchQuery(query);
      const trimmed = normalizeSearchQuery(liveQuery);
      if (!trimmed) {
        this.clearSearch();
        return;
      }

      this.picker.query = liveQuery;
      const localMatches = this.searchLocalContacts(trimmed);
      this.picker.searchResults = localMatches;
      this.busy.searching = true;
      try {
        const remote = await this.apiGet("/api/v1/contacts", { query: trimmed, limit: 24 }, { title: `搜索联系人：${trimmed}` });
        const remoteMatches = normalizeContactList(remote?.items);
        this.service.ok = true;
        this.service.lastError = "";
        this.picker.searchResults = mergeContacts(remoteMatches, localMatches).slice(0, 24);
      } catch (error) {
        this.service.ok = false;
        this.service.lastError = formatError(error);
        this.picker.searchResults = localMatches;
        if (!localMatches.length) {
          this.showToast(`搜索失败：${formatError(error)}`, "error");
        }
      } finally {
        this.busy.searching = false;
      }
    },

    searchLocalContacts(query) {
      const trimmed = normalizeSearchQuery(query);
      if (!trimmed) return [];
      return mergeContacts(this.picker.recentUsed, this.picker.sessions)
        .filter((contact) => matchesSearchQuery(contact, trimmed))
        .slice(0, 24);
    },

    async saveServiceSettings() {
      this.settings.baseUrl = normalizeBaseUrl(this.settings.baseUrl);
      await this.persistState({ withBusy: true });
      await this.probeService({ silent: false });
      if (this.service.ok) {
        await this.refreshPickerData({ silent: true });
        this.screen = this.settingsReturnTo || "picker";
      }
    },

    async probeService({ silent = false } = {}) {
      this.busy.probing = true;
      try {
        const state = await this.apiGet("/api/v1/state", {}, { title: "探测微信数据服务" });
        this.service.ok = true;
        this.service.lastError = "";
        this.service.state = {
          ...this.service.state,
          ...(state && typeof state === "object" ? state : {})
        };
        if (!silent) {
          this.showToast("服务连接成功", "success");
        }
      } catch (error) {
        this.service.ok = false;
        this.service.lastError = formatError(error);
        if (!silent) {
          this.showToast(`服务不可用：${this.service.lastError}`, "error");
        }
      } finally {
        this.busy.probing = false;
      }
    },

    async refreshPickerData({ silent = false } = {}) {
      if (!this.service.ok) return;
      this.busy.loadingPicker = true;

      try {
        const [recentResult, sessionResult] = await Promise.allSettled([this.loadRecentContacts(), this.loadSessions()]);

        if (!silent && recentResult.status === "fulfilled" && sessionResult.status === "fulfilled") {
          this.showToast("联系人与会话已刷新", "success");
        }
      } finally {
        this.busy.loadingPicker = false;
      }
    },

    async loadRecentContacts() {
      const remote = await this.apiGet("/api/v1/recent_contacts", { limit: 10, offset: 0 }, { title: "拉取最近联系人" });
      const merged = mergeContacts(normalizeContactList(remote?.items), this.picker.recentUsed);
      this.picker.recentUsed = merged.slice(0, 8);
      await this.persistState();
    },

    async loadSessions() {
      const remote = await this.apiGet("/api/v1/sessions", { limit: 30 }, { title: "拉取最近会话" });
      this.picker.sessions = normalizeContactList(remote?.items);
    },

    async searchContacts(query = this.picker.query) {
      await this.triggerSearch(query);
    },

    async selectContact(rawContact) {
      const contact = normalizeContact(rawContact);
      if (!contact.username) {
        this.showToast("联系人数据不完整。", "error");
        return;
      }

      this.screen = "reply";
      this.compose.contact = contact;
      this.compose.replyIntent = "";
      this.compose.advancedOpen = false;
      this.compose.lastInsertedReplyId = "";
      this.compose.generationNonce = 0;
      this.clearReplies();

      await this.rememberRecentContact(contact);
      await this.loadConversation(contact);
      if (this.compose.message) {
        await this.generateReplies({ reason: "initial" });
      }
    },

    async rememberRecentContact(contact) {
      this.picker.recentUsed = mergeContacts([contact], this.picker.recentUsed).slice(0, 8);
      await this.persistState();

      try {
        await this.apiPost("/api/v1/recent_contacts", { username: contact.username }, { title: `记录最近联系人：${contact.displayName}` });
      } catch (_) {
      }
    },

    async loadConversation(contact = this.compose.contact) {
      if (!contact?.username) return;

      this.busy.loadingConversation = true;
      try {
        const username = encodeURIComponent(contact.username);
        const historyLimit = computeHistoryFetchLimit(this.settings.contextMessageCount);
        const historyPromise = this.apiGet(`/api/v1/chats/${username}/history`, { limit: historyLimit, offset: 0 }, { title: `读取会话：${contact.displayName}` });
        const selfUsername = safeText(this.service.state.self_username);

        const profileRequests = [];
        profileRequests.push(this.loadProfile(contact.username));
        profileRequests.push(selfUsername ? this.loadProfile(selfUsername) : Promise.resolve(null));

        const [historyResult, contactProfileResult, selfProfileResult] = await Promise.allSettled([historyPromise, ...profileRequests]);

        if (historyResult.status === "fulfilled") {
          this.compose.history = normalizeHistory(historyResult.value?.items, selfUsername, historyLimit);
          this.compose.message = pickLatestIncomingMessage(this.compose.history) || safeText(contact.summary);
        } else {
          this.compose.history = [];
          this.compose.message = safeText(contact.summary);
        }

        this.compose.profiles.contact = contactProfileResult.status === "fulfilled" ? contactProfileResult.value : null;
        this.compose.profiles.self = selfProfileResult.status === "fulfilled" ? selfProfileResult.value : null;

        if (!this.compose.message) {
          this.showToast("没读到最近一句消息，暂时无法生成回复。", "error");
        }
      } finally {
        this.busy.loadingConversation = false;
      }
    },

    async loadProfile(username) {
      if (!username) return null;
      const encoded = encodeURIComponent(username);
      const payload = await this.apiGet(`/api/v1/people/${encoded}/profile`, {}, { title: `读取画像：${username}` });
      return normalizeProfile(payload);
    },

    async generateReplies({ reason = "manual" } = {}) {
      if (!this.compose.contact.username || !this.compose.message) {
        this.showToast("没有可生成的会话内容。", "error");
        return;
      }

      this.busy.generating = true;
      try {
        const request = buildAiRequest({
          contact: this.compose.contact,
          latestMessage: this.compose.message,
          history: this.compose.history,
          contextMessageCount: this.settings.contextMessageCount,
          replyIntent: this.compose.replyIntent,
          tonePreset: this.settings.tonePreset,
          personaMode: this.settings.personaMode,
          selfProfile: this.compose.profiles.self,
          contactProfile: this.compose.profiles.contact,
          nonce: this.compose.generationNonce,
          reason
        });

        const response = await this.kit.ai.request(request);
        const parsed = extractAiJson(response);
        const replies = normalizeReplyList(parsed?.replies ?? parsed?.candidates);

        if (!replies.length) {
          this.compose.replies = buildFallbackReplies({
            latestMessage: this.compose.message,
            tonePreset: this.settings.tonePreset,
            personaMode: this.settings.personaMode,
            count: REPLY_COUNT
          });
          this.showToast("AI 返回不可解析，已降级为本地候选。", "error");
          return;
        }

        this.compose.replies = replies.slice(0, REPLY_COUNT);
      } catch (error) {
        this.compose.replies = buildFallbackReplies({
          latestMessage: this.compose.message,
          tonePreset: this.settings.tonePreset,
          personaMode: this.settings.personaMode,
          count: REPLY_COUNT
        });
        this.showToast(`生成失败：${formatError(error)}`, "error");
      } finally {
        this.busy.generating = false;
      }
    },

    async changeBatch() {
      this.compose.generationNonce += 1;
      await this.generateReplies({ reason: "reroll" });
    },

    toggleAdvanced() {
      this.compose.advancedOpen = !this.compose.advancedOpen;
    },

    async selectTonePreset(nextPreset) {
      if (this.settings.tonePreset === nextPreset) return;
      this.settings.tonePreset = nextPreset;
      await this.persistState();
      this.queueAutoGenerate();
    },

    async selectPersonaMode(nextMode) {
      if (this.settings.personaMode === nextMode) return;
      this.settings.personaMode = nextMode;
      await this.persistState();
      this.queueAutoGenerate();
    },

    async increaseContextMessageCount() {
      await this.updateContextMessageCount(this.settings.contextMessageCount + CONTEXT_MESSAGE_COUNT_STEP);
    },

    async decreaseContextMessageCount() {
      await this.updateContextMessageCount(this.settings.contextMessageCount - CONTEXT_MESSAGE_COUNT_STEP);
    },

    async updateContextMessageCount(nextCount) {
      const normalized = normalizeContextMessageCount(nextCount);
      if (normalized === this.settings.contextMessageCount) return;
      this.settings.contextMessageCount = normalized;
      await this.persistState();

      if (!this.compose.contact.username) return;

      this.compose.replies = [];
      this.compose.lastInsertedReplyId = "";
      this.compose.generationNonce += 1;
      await this.loadConversation(this.compose.contact);
      if (this.compose.message) {
        await this.generateReplies({ reason: "history-window-change" });
      }
    },

    onReplyIntentInput(value) {
      this.compose.replyIntent = typeof value === "string" ? value : "";
    },

    async applyReplyIntent() {
      this.compose.replyIntent = safeText(this.compose.replyIntent);
      if (!this.compose.contact.username || !this.compose.message) return;
      this.compose.replies = [];
      this.compose.lastInsertedReplyId = "";
      this.compose.generationNonce += 1;
      await this.generateReplies({ reason: "reply-intent-change" });
    },

    queueAutoGenerate() {
      if (this.autoGenerateTimer) {
        clearTimeout(this.autoGenerateTimer);
      }

      if (!this.compose.contact.username || !this.compose.message) return;

      this.autoGenerateTimer = setTimeout(() => {
        this.compose.generationNonce += 1;
        this.generateReplies({ reason: "config-change" }).catch(() => {});
      }, 180);
    },

    clearReplies() {
      this.compose.replies = [];
      this.compose.message = "";
      this.compose.history = [];
      this.compose.profiles = { self: null, contact: null };
      this.compose.lastInsertedReplyId = "";
    },

    async applyReply(reply) {
      if (!this.kit.hasPermission("input.insert")) {
        this.showToast("缺少 input.insert 权限。", "error");
        return;
      }

      const text = safeText(reply?.text);
      if (!text) return;

      try {
        this.kit.input.insert(text, { candidateId: safeText(reply?.id) || undefined });
        this.compose.lastInsertedReplyId = reply.id;
        this.showToast("已写入输入框", "success");
      } catch (error) {
        this.showToast(`写入失败：${formatError(error)}`, "error");
      }
    },

    resolveAvatarSrc(contact) {
      const avatar = safeText(contact?.avatarUrl);
      if (!avatar) return "";
      try {
        const resolved = new URL(avatar, `${normalizeBaseUrl(this.settings.baseUrl)}/`).toString();
        return proxyExternalResourceUrl(resolved);
      } catch (_) {
        return "";
      }
    },

    avatarFallback(contact) {
      if (contact?.isGroup) return "群";
      const displayName = safeText(contact?.displayName);
      return displayName ? displayName.slice(0, 1) : "人";
    },

    isAvatarBroken(username) {
      return this.avatarErrorMap[safeText(username)] === true;
    },

    markAvatarBroken(username) {
      const key = safeText(username);
      if (!key) return;
      this.avatarErrorMap = {
        ...this.avatarErrorMap,
        [key]: true
      };
    },

    showToast(text, kind = "info") {
      this.toast.text = safeText(text);
      this.toast.kind = kind;
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
      if (this.toast.text) {
        this.toastTimer = setTimeout(() => {
          this.toast.text = "";
        }, 2200);
      }
    },

    async apiGet(path, query = {}, task = null) {
      const url = buildUrl(this.settings.baseUrl, path, query);
      const response = await this.kit.fetch(url, {
        method: "GET",
        headers: buildHeaders(this.settings.apiToken),
        task: task ? { title: safeText(task.title) } : undefined
      });
      return parseJsonResponse(response);
    },

    async apiPost(path, body = {}, task = null) {
      const url = buildUrl(this.settings.baseUrl, path);
      const response = await this.kit.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildHeaders(this.settings.apiToken)
        },
        body: JSON.stringify(body ?? {}),
        task: task ? { title: safeText(task.title) } : undefined
      });
      return parseJsonResponse(response);
    }
  };

  PetiteVue.createApp(vm).mount("#app");
  vm.init().catch(() => {});

  function buildAiRequest({
    contact,
    latestMessage,
    history,
    contextMessageCount,
    replyIntent,
    tonePreset,
    personaMode,
    selfProfile,
    contactProfile,
    nonce,
    reason
  }) {
    const toneLabel = tonePresetLabel(tonePreset);
    const historyWindow = normalizeContextMessageCount(contextMessageCount);
    const historyText = formatHistory(history, historyWindow);
    const replyIntentText = safeText(replyIntent);
    const selfProfileText = personaMode === "merge-self" ? summarizeProfile(selfProfile, "我的画像") : "";
    const contactProfileText = summarizeProfile(contactProfile, "对方画像");

    const systemPrompt = [
      "你是一个微信聊天回复助手，只负责生成可直接发送的中文回复。",
      "输出必须是 JSON，不要输出 Markdown，不要输出解释。",
      '{"replies":[{"text":"...","confidence":"high|medium|low"}]}',
      `固定生成 ${REPLY_COUNT} 条回复。`,
      `回复风格：${toneLabel}。`,
      `必须综合最近 ${historyWindow} 条聊天消息来判断语境，不要只盯着最后一句。`,
      replyIntentText ? "如果给了“本次回复方向”，优先满足该目标，再保证自然可直接发送。" : "",
      "- 每条回复 1~2 句，优先短句。",
      "- 语气自然，不要生硬，不要模板腔，不要过度客套。",
      "- 不要重复低质量口水词。",
      "- 如果对方消息信息不足，可给出一句自然的澄清回复。",
      "- 不要输出序号、前缀标签、括号解释。"
    ].join("\n");

    const userPayload = [
      `当前对象：${contact.displayName || contact.username}${contact.isGroup ? "（群聊）" : ""}`,
      `最近一句对方消息：${latestMessage}`,
      historyText ? `最近 ${historyWindow} 条聊天记录（越近越重要）：\n${historyText}` : "",
      replyIntentText ? `本次回复方向：${replyIntentText}` : "",
      contactProfileText,
      selfProfileText,
      personaMode === "merge-self" ? "要求：尽量融合我的表达习惯与稳定人设。" : "要求：不要依赖任何画像，只根据会话生成。",
      `换批次随机因子：${nonce || 0}`,
      `触发原因：${reason}`
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      task: { title: `给 ${contact.displayName || contact.username} 生成微信回复（近${historyWindow}条${replyIntentText ? ` / ${truncateLabel(replyIntentText, 10)}` : ""}）` },
      route: { kind: "host-shared" },
      temperature: 0.72,
      maxTokens: 320,
      systemPrompt,
      messages: [{ role: "user", content: userPayload }]
    };
  }

  function buildFallbackReplies({ latestMessage, tonePreset, count }) {
    const snippet = safeText(latestMessage).slice(0, 14) || "这件事";
    const templates = {
      work: [
        `收到，关于“${snippet}”，我先确认一下，稍后给您明确回复。`,
        `好的，这件事我马上处理，处理完第一时间同步您。`,
        `明白，我先核对下细节，尽快给您一个确定答复。`
      ],
      eq: [
        `收到啦，我已经看到“${snippet}”这件事了，我先处理一下，稍后认真回您。`,
        `好的，我明白您的意思，我这边马上跟进，有结果第一时间告诉您。`,
        `我先帮您确认一下，确认清楚后尽快给您答复。`
      ],
      daily: [
        `看到了，我先处理下“${snippet}”，等会儿回你。`,
        `好，我先看一下，弄清楚了马上跟你说。`,
        `行，我这边先确认一下，稍后给你回。`
      ]
    };

    const pool = templates[tonePreset] || templates.work;
    return pool.slice(0, Math.max(1, count)).map((text, index) => ({
      id: `fallback-${index + 1}`,
      text,
      confidence: "low"
    }));
  }

  function normalizeSettings(raw) {
    const parsed = parsePossibleJson(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl || DEFAULT_BASE_URL),
      apiToken: safeText(parsed.apiToken),
      tonePreset: ["work", "eq", "daily"].includes(parsed.tonePreset) ? parsed.tonePreset : "work",
      personaMode: ["merge-self", "none"].includes(parsed.personaMode) ? parsed.personaMode : "merge-self",
      contextMessageCount: normalizeContextMessageCount(parsed.contextMessageCount)
    };
  }

  function normalizeContactList(raw) {
    const parsed = parsePossibleJson(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(raw)
        ? raw
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
    return items.map(normalizeContact).filter((item) => item.username);
  }

  function normalizeContact(raw) {
    const username = safeText(raw?.username);
    const displayName =
      safeText(raw?.display_name) ||
      safeText(raw?.displayName) ||
      safeText(raw?.remark) ||
      safeText(raw?.nick_name) ||
      username;

    const unread = toInt(raw?.unread);
    return {
      username,
      displayName,
      remark: safeText(raw?.remark),
      summary: safeText(raw?.summary),
      avatarUrl: safeText(raw?.avatar_url) || safeText(raw?.avatarUrl),
      isGroup: raw?.is_group === true || raw?.isGroup === true,
      unread,
      unreadDisplay: unread > 99 ? "99+" : unread > 0 ? String(unread) : "",
      lastTimestamp: toInt(raw?.last_timestamp ?? raw?.lastTimestamp ?? raw?.last_access_ts ?? raw?.lastAccessTs),
      source: safeText(raw?.source)
    };
  }

  function mergeContacts(primary, secondary) {
    const map = new Map();
    for (const item of [...(primary || []), ...(secondary || [])]) {
      const contact = normalizeContact(item);
      if (!contact.username) continue;
      const existing = map.get(contact.username);
      if (!existing) {
        map.set(contact.username, contact);
        continue;
      }
      map.set(contact.username, {
        ...existing,
        displayName: existing.displayName || contact.displayName,
        remark: existing.remark || contact.remark,
        summary: existing.summary || contact.summary,
        avatarUrl: existing.avatarUrl || contact.avatarUrl,
        isGroup: existing.isGroup || contact.isGroup,
        unread: existing.unread || contact.unread,
        unreadDisplay: existing.unreadDisplay || contact.unreadDisplay,
        lastTimestamp: existing.lastTimestamp || contact.lastTimestamp,
        source: existing.source || contact.source
      });
    }
    return Array.from(map.values());
  }

  function normalizeHistory(items, selfUsername, limit = MAX_CONTEXT_MESSAGE_COUNT * 2) {
    const list = [];
    for (const item of Array.isArray(items) ? items : []) {
      const text = safeText(item?.text || item?.raw || item?.content);
      if (!text) continue;

      const isSend = item?.is_send === true || item?.is_send === 1 || safeText(item?.direction) === "out";
      const senderUsername = safeText(item?.sender_username);
      const role = isSend || (selfUsername && senderUsername === selfUsername) ? "me" : "them";

      list.push({
        key: safeText(item?.local_id) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        text
      });
    }
    return list.slice(-Math.max(1, toInt(limit)));
  }

  function pickLatestIncomingMessage(history) {
    const incoming = [...(Array.isArray(history) ? history : [])].reverse().find((item) => item.role === "them" && safeText(item.text));
    if (incoming) return safeText(incoming.text);
    const fallback = [...(Array.isArray(history) ? history : [])].reverse().find((item) => safeText(item.text));
    return fallback ? safeText(fallback.text) : "";
  }

  function formatHistory(history, limit = DEFAULT_CONTEXT_MESSAGE_COUNT) {
    if (!Array.isArray(history) || !history.length) return "";
    const normalizedLimit = normalizeContextMessageCount(limit);
    return history
      .slice(-normalizedLimit)
      .map((item) => `${item.role === "me" ? "我" : "对方"}：${safeText(item.text)}`)
      .join("\n");
  }

  function normalizeContextMessageCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_CONTEXT_MESSAGE_COUNT;
    }
    const rounded = Math.round(parsed / CONTEXT_MESSAGE_COUNT_STEP) * CONTEXT_MESSAGE_COUNT_STEP;
    return Math.min(MAX_CONTEXT_MESSAGE_COUNT, Math.max(MIN_CONTEXT_MESSAGE_COUNT, rounded));
  }

  function computeHistoryFetchLimit(value) {
    const target = normalizeContextMessageCount(value);
    return Math.min(80, Math.max(24, target * 2));
  }

  function normalizeSearchQuery(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function matchesSearchQuery(contact, query) {
    const needle = normalizeSearchQuery(query).toLowerCase();
    if (!needle) return false;
    const haystacks = [
      contact?.displayName,
      contact?.remark,
      contact?.username,
      contact?.summary
    ]
      .map((item) => safeText(item).toLowerCase())
      .filter(Boolean);
    return haystacks.some((item) => item.includes(needle));
  }

  function truncateLabel(value, maxChars = 10) {
    const text = safeText(value);
    if (!text || text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…`;
  }

  function normalizeProfile(raw) {
    const payload = parsePossibleJson(raw);
    if (!payload || typeof payload !== "object") return null;

    const profile = payload.profile && typeof payload.profile === "object" ? payload.profile : payload;
    const tags = Array.isArray(profile.tags) ? profile.tags.map(safeText).filter(Boolean) : [];
    const notes = Array.isArray(profile.notes)
      ? profile.notes.map(safeText).filter(Boolean)
      : safeText(profile.notes)
        ? [safeText(profile.notes)]
        : [];
    const policy = safeText(profile.auto_reply_policy);

    if (!tags.length && !notes.length && !policy) {
      return null;
    }

    return { tags, notes, policy };
  }

  function summarizeProfile(profile, title) {
    if (!profile) return "";
    const lines = [];
    if (profile.tags?.length) {
      lines.push(`标签：${profile.tags.join("、")}`);
    }
    if (profile.notes?.length) {
      lines.push(`备注：${profile.notes.slice(0, 3).join("；")}`);
    }
    if (profile.policy) {
      lines.push(`偏好：${profile.policy}`);
    }
    return lines.length ? `${title}：\n${lines.join("\n")}` : "";
  }

  function extractAiJson(response) {
    const output = response?.output ?? response ?? {};
    if (output?.json && typeof output.json === "object") return output.json;
    if (output?.structured && typeof output.structured === "object") return output.structured;
    return parsePossibleJson(output?.text);
  }

  function normalizeReplyList(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((item, index) => ({
        id: safeText(item?.id) || `reply-${index + 1}`,
        text: safeText(item?.text),
        confidence: safeText(item?.confidence) || "medium"
      }))
      .filter((item) => item.text);
  }

  function parseJsonResponse(raw) {
    if (isNetworkFetchResponse(raw)) {
      if (!raw.ok) {
        const snippet = safeText(raw.body).slice(0, 140);
        throw new Error(`HTTP ${raw.status}${snippet ? `: ${snippet}` : ""}`);
      }

      const parsed = parsePossibleJson(raw.body);
      if (parsed === null) {
        throw new Error("服务返回的不是 JSON。");
      }
      return parsed;
    }

    const parsed = parsePossibleJson(raw);
    return parsed === null ? raw : parsed;
  }

  function isNetworkFetchResponse(value) {
    return !!value && typeof value === "object" && typeof value.status === "number" && typeof value.ok === "boolean" && "body" in value;
  }

  function buildUrl(baseUrl, path, query = {}) {
    const normalizedBaseUrl = `${normalizeBaseUrl(baseUrl)}/`;
    const url = new URL(path.replace(/^\//, ""), normalizedBaseUrl);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || safeText(String(value)) === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  function buildHeaders(apiToken) {
    const token = safeText(apiToken);
    if (!token) return {};
    return {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`
    };
  }

  function normalizeBaseUrl(url) {
    const raw = safeText(url) || DEFAULT_BASE_URL;
    const trimmed = raw.replace(/\/+$/, "");
    if (!trimmed || trimmed.includes("<HOST")) {
      return DEFAULT_BASE_URL;
    }

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
      candidate = `http://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.port) {
        parsed.port = String(DEFAULT_PORT);
      }
      return parsed.origin;
    } catch (_) {
      return DEFAULT_BASE_URL;
    }
  }

  function proxyExternalResourceUrl(url) {
    const raw = safeText(url);
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:") {
        return parsed.toString();
      }
      const token = toBase64Url(parsed.toString());
      return token ? `${EXTERNAL_RESOURCE_PROXY_BASE}${token}` : parsed.toString();
    } catch (_) {
      return "";
    }
  }

  function toBase64Url(value) {
    const raw = safeText(value);
    if (!raw) return "";
    try {
      return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    } catch (_) {
      return "";
    }
  }

  function emptyContact() {
    return {
      username: "",
      displayName: "",
      remark: "",
      summary: "",
      avatarUrl: "",
      isGroup: false,
      unread: 0,
      unreadDisplay: "",
      lastTimestamp: 0,
      source: ""
    };
  }

  function tonePresetLabel(tonePreset) {
    if (tonePreset === "eq") return "高情商、会照顾对方感受";
    if (tonePreset === "daily") return "日常自然、轻松直接";
    return "工作专业、简洁稳妥";
  }

  function parsePossibleJson(value) {
    if (value && typeof value === "object") return value;
    const text = safeText(typeof value === "string" ? value : "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function safeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toInt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function formatError(error) {
    if (!error) return "未知错误";
    if (typeof error === "string") return error;
    return safeText(error.message) || String(error);
  }
})();

