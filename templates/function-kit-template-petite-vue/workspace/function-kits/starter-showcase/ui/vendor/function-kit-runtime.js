(function (globalObject) {
  const DEFAULT_SEPARATOR_PATTERN = /[\s()[\]{}"'`.,!?;:<>|\\]/;
  const DEFAULT_COMMAND_CHAR_PATTERN = /^[a-z0-9_-]$/i;
  
  const DEFAULT_DISCOVERY_RANKING = Object.freeze({
    baseWeight: 1,
    recentBoost: 0.4,
    pinnedBoost: 0.2,
    contextBoost: 0.3,
    blockedPenalty: 0.6
  });
  
  const SUPPORTED_DISCOVERY_LAUNCH_MODES = Object.freeze([
    "quick-action",
    "panel-first",
    "hybrid"
  ]);
  
  const MATCH_SCORES = Object.freeze({
    "command-exact": 100,
    "alias-exact": 96,
    "command-prefix": 82,
    "alias-prefix": 78,
    "tag-exact": 64,
    "tag-prefix": 58,
    regex: 52,
    "name-substring": 42,
    "description-substring": 24,
    browse: 0
  });
  
  function clampCaretIndex(text, caretIndex) {
    if (!Number.isInteger(caretIndex)) {
      return text.length;
    }
  
    return Math.min(Math.max(caretIndex, 0), text.length);
  }
  
  function isSeparator(character) {
    return character == null || character === "" || DEFAULT_SEPARATOR_PATTERN.test(character);
  }
  
  function isCommandCharacter(character) {
    return DEFAULT_COMMAND_CHAR_PATTERN.test(character);
  }
  
  function uniqueNormalizedStrings(values) {
    if (!Array.isArray(values)) {
      return [];
    }
  
    const seen = new Set();
    const normalized = [];
    for (const value of values) {
      const token = normalizeSlashQuery(value);
      if (!token || seen.has(token)) {
        continue;
      }
      seen.add(token);
      normalized.push(token);
    }
  
    return normalized;
  }
  
  function uniqueTrimmedStrings(values) {
    if (!Array.isArray(values)) {
      return [];
    }
  
    const seen = new Set();
    const normalized = [];
    for (const value of values) {
      const token = typeof value === "string" ? value.trim() : "";
      if (!token || seen.has(token)) {
        continue;
      }
      seen.add(token);
      normalized.push(token);
    }
  
    return normalized;
  }
  
  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }
  
  function toNonNegativeInteger(value, fallback) {
    if (!Number.isInteger(value) || value < 0) {
      return fallback;
    }
  
    return value;
  }
  
  function normalizeLaunchMode(value) {
    return SUPPORTED_DISCOVERY_LAUNCH_MODES.includes(value) ? value : "panel-first";
  }
  
  function normalizeSlashMatchers(matchers) {
    if (!Array.isArray(matchers)) {
      return [];
    }
  
    return matchers.flatMap((matcher) => {
      if (!matcher || matcher.type !== "regex" || typeof matcher.pattern !== "string") {
        return [];
      }
  
      const pattern = matcher.pattern.trim();
      if (!pattern) {
        return [];
      }
  
      return [
        {
          type: "regex",
          pattern,
          weight: toFiniteNumber(matcher.weight, 0.7)
        }
      ];
    });
  }
  
  function normalizeContextTypes(value) {
    return uniqueNormalizedStrings(value);
  }
  
  function createBrowseMatch() {
    return {
      kind: "browse",
      score: MATCH_SCORES.browse,
      matchedValue: ""
    };
  }
  
  function createMatch(kind, matchedValue, score) {
    return {
      kind,
      matchedValue,
      score
    };
  }
  
  function evaluateRegexMatchers(matchers, query) {
    for (const matcher of matchers) {
      try {
        const regularExpression = new RegExp(matcher.pattern, "i");
        if (!regularExpression.test(query)) {
          continue;
        }
  
        return createMatch(
          "regex",
          matcher.pattern,
          MATCH_SCORES.regex + matcher.weight * 10
        );
      } catch {
        continue;
      }
    }
  
    return null;
  }
  
  function evaluateTextMatches(candidates, query, exactKind, prefixKind, exactScore, prefixScore) {
    for (const candidate of candidates) {
      if (candidate === query) {
        return createMatch(exactKind, candidate, exactScore);
      }
    }
  
    for (const candidate of candidates) {
      if (candidate.startsWith(query)) {
        return createMatch(prefixKind, candidate, prefixScore);
      }
    }
  
    return null;
  }
  
  function normalizePermissionSet(permissions) {
    return new Set(uniqueTrimmedStrings(permissions));
  }
  
  function normalizeIdSet(ids) {
    return new Set(uniqueTrimmedStrings(ids));
  }
  
  function normalizeContextInput(options) {
    if (Array.isArray(options?.contextTypes)) {
      return normalizeContextTypes(options.contextTypes);
    }
  
    if (typeof options?.contextType === "string") {
      return normalizeContextTypes([options.contextType]);
    }
  
    return [];
  }
  
  function computeContextBoost(entry, options) {
    const entryContextTypes = entry.triggers.contextTypes;
    const activeContextTypes = normalizeContextInput(options);
    if (entryContextTypes.length === 0 || activeContextTypes.length === 0) {
      return 0;
    }
  
    return activeContextTypes.some((value) => entryContextTypes.includes(value))
      ? entry.discovery.ranking.contextBoost * 10
      : 0;
  }
  
  function computeRecentBoost(entry, options) {
    const recentKitIds = Array.isArray(options?.recentKitIds) ? options.recentKitIds : [];
    const recentIndex = recentKitIds.indexOf(entry.id);
    if (recentIndex === -1 || recentKitIds.length === 0) {
      return 0;
    }
  
    return entry.discovery.ranking.recentBoost * 10 * ((recentKitIds.length - recentIndex) / recentKitIds.length);
  }
  
  function computePinnedBoost(entry, options) {
    const pinnedKitIds = normalizeIdSet(options?.pinnedKitIds);
    return pinnedKitIds.has(entry.id) ? entry.discovery.ranking.pinnedBoost * 10 : 0;
  }
  
  function computeBlockedPermissions(entry, options) {
    const availablePermissions = normalizePermissionSet(options?.availablePermissions);
    if (availablePermissions.size === 0) {
      return [];
    }
  
    return entry.runtimePermissions.filter((permission) => !availablePermissions.has(permission));
  }
  
  function computeAvailabilityPenalty(entry, blockedPermissions) {
    if (blockedPermissions.length === 0) {
      return 0;
    }
  
    return entry.discovery.ranking.blockedPenalty * 10 * blockedPermissions.length;
  }
  
  function compareMatches(left, right) {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
  
    if (left.match.score !== right.match.score) {
      return right.match.score - left.match.score;
    }
  
    if (left.order !== right.order) {
      return left.order - right.order;
    }
  
    return left.id.localeCompare(right.id);
  }
  
  function normalizeSlashQuery(value) {
    if (typeof value !== "string") {
      return "";
    }
  
    return value.trim().replace(/^\/+/, "").toLowerCase();
  }
  
  function parseSlashTrigger(text, options = {}) {
    if (typeof text !== "string") {
      return null;
    }
  
    const caretIndex = clampCaretIndex(text, options.caretIndex);
    let tokenStart = caretIndex;
    while (tokenStart > 0 && !isSeparator(text[tokenStart - 1])) {
      tokenStart -= 1;
    }
  
    let tokenEnd = caretIndex;
    while (tokenEnd < text.length && !isSeparator(text[tokenEnd])) {
      tokenEnd += 1;
    }
  
    const rawToken = text.slice(tokenStart, tokenEnd);
    if (!rawToken.startsWith("/")) {
      return null;
    }
  
    if (!isSeparator(text[tokenStart - 1])) {
      return null;
    }
  
    const rawQuery = rawToken.slice(1);
    if (rawToken.startsWith("//") || rawQuery.includes("/")) {
      return null;
    }
  
    if (rawQuery.length > 0 && [...rawQuery].some((character) => !isCommandCharacter(character))) {
      return null;
    }
  
    return {
      active: true,
      mode: rawQuery.length === 0 ? "slash-detecting" : "slash-searching",
      raw: rawToken,
      query: normalizeSlashQuery(rawQuery),
      tokenStart,
      tokenEnd,
      replacementRange: {
        start: tokenStart,
        end: tokenEnd
      }
    };
  }
  
  function normalizeDiscoveryManifest(manifest = {}) {
    const discovery = manifest.discovery ?? {};
    const slash = discovery.slash ?? {};
    const ranking = discovery.ranking ?? {};
    const triggers = manifest.triggers ?? {};
  
    return {
      id: typeof manifest.id === "string" ? manifest.id.trim() : "",
      name: typeof manifest.name === "string" ? manifest.name.trim() : "",
      description: typeof manifest.description === "string" ? manifest.description.trim() : "",
      runtimePermissions: uniqueTrimmedStrings(manifest.runtimePermissions),
      triggers: {
        manual: triggers.manual !== false,
        selectionRequired: triggers.selectionRequired === true,
        contextTypes: normalizeContextTypes(triggers.contextTypes)
      },
      discovery: {
        pinnable: discovery.pinnable !== false,
        recentEnabled: discovery.recentEnabled !== false,
        launchMode: normalizeLaunchMode(discovery.launchMode),
        slash: {
          enabled: slash.enabled !== false,
          commands: uniqueNormalizedStrings(slash.commands),
          aliases: uniqueNormalizedStrings(slash.aliases),
          tags: uniqueNormalizedStrings(slash.tags),
          minQueryLength: toNonNegativeInteger(slash.minQueryLength, 1),
          matchers: normalizeSlashMatchers(slash.matchers)
        },
        ranking: {
          baseWeight: toFiniteNumber(ranking.baseWeight, DEFAULT_DISCOVERY_RANKING.baseWeight),
          recentBoost: toFiniteNumber(ranking.recentBoost, DEFAULT_DISCOVERY_RANKING.recentBoost),
          pinnedBoost: toFiniteNumber(ranking.pinnedBoost, DEFAULT_DISCOVERY_RANKING.pinnedBoost),
          contextBoost: toFiniteNumber(ranking.contextBoost, DEFAULT_DISCOVERY_RANKING.contextBoost),
          blockedPenalty: toFiniteNumber(ranking.blockedPenalty, DEFAULT_DISCOVERY_RANKING.blockedPenalty)
        }
      }
    };
  }
  
  function buildDiscoveryIndex(manifests = []) {
    return manifests
      .map((manifest, order) => ({
        ...normalizeDiscoveryManifest(manifest),
        order
      }))
      .filter((entry) => entry.id && entry.name);
  }
  
  function rankDiscoveryMatches(matches = []) {
    return [...matches].sort(compareMatches);
  }
  
  function matchDiscoveryEntries(entries = [], queryOrToken = "", options = {}) {
    const normalizedQuery =
      typeof queryOrToken === "string"
        ? normalizeSlashQuery(queryOrToken)
        : normalizeSlashQuery(queryOrToken?.query ?? "");
  
    const index = entries.map((entry, order) => ({
      ...entry,
      order: Number.isInteger(entry.order) ? entry.order : order
    }));
  
    const matches = [];
  
    for (const entry of index) {
      if (!entry.discovery?.slash?.enabled) {
        continue;
      }
  
      const minQueryLength = toNonNegativeInteger(entry.discovery.slash.minQueryLength, 1);
      if (normalizedQuery.length > 0 && normalizedQuery.length < minQueryLength) {
        continue;
      }
  
      let match = null;
      if (normalizedQuery.length === 0) {
        match = createBrowseMatch();
      } else {
        match =
          evaluateTextMatches(
            entry.discovery.slash.commands,
            normalizedQuery,
            "command-exact",
            "command-prefix",
            MATCH_SCORES["command-exact"],
            MATCH_SCORES["command-prefix"]
          ) ??
          evaluateTextMatches(
            entry.discovery.slash.aliases,
            normalizedQuery,
            "alias-exact",
            "alias-prefix",
            MATCH_SCORES["alias-exact"],
            MATCH_SCORES["alias-prefix"]
          ) ??
          evaluateTextMatches(
            entry.discovery.slash.tags,
            normalizedQuery,
            "tag-exact",
            "tag-prefix",
            MATCH_SCORES["tag-exact"],
            MATCH_SCORES["tag-prefix"]
          );
  
        if (!match && entry.name.toLowerCase().includes(normalizedQuery)) {
          match = createMatch("name-substring", entry.name, MATCH_SCORES["name-substring"]);
        }
  
        if (!match && entry.description.toLowerCase().includes(normalizedQuery)) {
          match = createMatch(
            "description-substring",
            entry.description,
            MATCH_SCORES["description-substring"]
          );
        }
  
        if (!match) {
          match = evaluateRegexMatchers(entry.discovery.slash.matchers, normalizedQuery);
        }
      }
  
      if (!match) {
        continue;
      }
  
      const blockedPermissions = computeBlockedPermissions(entry, options);
      const score =
        match.score +
        entry.discovery.ranking.baseWeight * 10 +
        computeRecentBoost(entry, options) +
        computePinnedBoost(entry, options) +
        computeContextBoost(entry, options) -
        computeAvailabilityPenalty(entry, blockedPermissions);
  
      matches.push({
        ...entry,
        blockedPermissions,
        available: blockedPermissions.length === 0,
        match,
        query: normalizedQuery,
        score
      });
    }
  
    return rankDiscoveryMatches(matches);
  }
  
  function resolveDiscoveryQuery(manifests = [], text, options = {}) {
    const parsedToken = typeof text === "string" ? parseSlashTrigger(text, options) : text;
    const index = buildDiscoveryIndex(manifests);
  
    return {
      token: parsedToken,
      matches: matchDiscoveryEntries(index, parsedToken, options)
    };
  }

  const PROTOCOL_VERSION = "1.0.0";
  const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
  const DEFAULT_REQUEST_TIMEOUTS_MS = {
    // Long-running operations: keep a generous default so users don't hit timeouts while selecting
    // files or waiting for real network/AI work to finish.
    "files.pick": 5 * 60 * 1000,
    "files.download": 5 * 60 * 1000,
    "files.getUrl": 15 * 1000,
    "kits.install": 5 * 60 * 1000,
    "kits.open": 15 * 1000,
    "kits.sync.request": 30 * 1000,
    "kits.uninstall": 60 * 1000,
    "kits.settings.update": 60 * 1000,
    "catalog.refresh": 60 * 1000,
    "catalog.sources.get": 15 * 1000,
    "catalog.sources.set": 15 * 1000,
    "runtime.message.send": 8000,
    "network.fetch": 60 * 1000,
    "ai.request": 60 * 1000,
    "ai.agent.list": 60 * 1000,
    "ai.agent.run": 5 * 60 * 1000
  };
  const RECENT_MESSAGE_ID_LIMIT = 256;
  
  const DEFAULT_REPLY_TYPES = {
    "bridge.ready": ["bridge.ready.ack"],
    "context.request": ["context.sync"],
    "storage.get": ["storage.sync"],
    "storage.set": ["storage.sync"],
    "panel.state.update": ["panel.state.ack"],
    "tasks.sync.request": ["tasks.sync"],
    "task.cancel": ["task.cancel.ack"],
    "input.observe.best_effort.start": ["input.observe.best_effort.ack"],
    "input.observe.best_effort.stop": ["input.observe.best_effort.ack"],
    "send.intercept.ime_action.register": ["send.intercept.ime_action.ack"],
    "send.intercept.ime_action.unregister": ["send.intercept.ime_action.ack"],
    "network.fetch": ["network.fetch.result"],
    "files.pick": ["files.pick.result"],
    "files.download": ["files.download.result"],
    "files.getUrl": ["files.getUrl.result"],
    "kits.sync.request": ["kits.sync"],
    "kits.open": ["kits.open.result"],
    "kits.install": ["kits.install.result"],
    "kits.uninstall": ["kits.uninstall.result"],
    "kits.settings.update": ["kits.settings.update.result"],
    "catalog.sources.get": ["catalog.sources.sync"],
    "catalog.sources.set": ["catalog.sources.sync"],
    "catalog.refresh": ["catalog.sync"],
    "runtime.message.send": ["runtime.message.send.ack"],
    "ai.request": ["ai.response"],
    "ai.agent.list": ["ai.agent.list.result"],
    "ai.agent.run": ["ai.agent.run.result"]
  };
  
  const PREVIEW_GRANT_ALL_PERMISSIONS = [
    "context.read",
    "input.insert",
    "input.replace",
    "input.commitImage",
    "input.observe.best_effort",
    "candidates.regenerate",
    "settings.open",
    "storage.read",
    "storage.write",
    "files.pick",
    "files.download",
    "panel.state.write",
    "runtime.message.send",
    "runtime.message.receive",
    "network.fetch",
    "ai.request",
    "kits.manage",
    "send.intercept.ime_action",
    "ai.agent.list",
    "ai.agent.run"
  ];
  
  function safeParse(raw) {
    if (typeof raw !== "string") {
      return raw;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  
  function createEmitter() {
    const listeners = new Map();
  
    function on(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
      return () => listeners.get(type)?.delete(handler);
    }
  
    function emit(type, message) {
      listeners.get(type)?.forEach((handler) => handler(message));
      listeners.get("*")?.forEach((handler) => handler(message));
    }
  
    return { on, emit };
  }
  
  function nextMessageId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
  
  function isAbortSignal(value) {
    return (
      value &&
      typeof value === "object" &&
      typeof value.aborted === "boolean" &&
      typeof value.addEventListener === "function" &&
      typeof value.removeEventListener === "function"
    );
  }
  
  function createAbortError(message = "The operation was aborted.") {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
  
  function normalizeUrl(value) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  
    if (typeof URL !== "undefined" && value instanceof URL) {
      return value.toString();
    }
  
    throw new TypeError("FunctionKitRuntimeSDK.fetch(url, init) requires a non-empty URL.");
  }
  
  function normalizeHeaders(headers) {
    if (headers == null) {
      return undefined;
    }
  
    if (typeof headers.entries === "function") {
      return Array.from(headers.entries()).map(([key, value]) => [String(key), String(value)]);
    }
  
    if (Array.isArray(headers)) {
      return headers.map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new TypeError("Fetch headers entries must be [name, value] tuples.");
        }
        return [String(entry[0]), String(entry[1])];
      });
    }
  
    if (typeof headers === "object") {
      return Object.entries(headers).map(([key, value]) => [String(key), String(value)]);
    }
  
    throw new TypeError("Unsupported fetch headers shape for FunctionKitRuntimeSDK.fetch().");
  }
  
  function normalizeTransportValue(value, seen = new WeakSet()) {
    if (value === undefined || value === null) {
      return value;
    }
  
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
  
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
      throw new TypeError("Function Kit runtime payloads must be JSON-serializable.");
    }
  
    if (typeof URL !== "undefined" && value instanceof URL) {
      return value.toString();
    }
  
    if (isAbortSignal(value)) {
      return undefined;
    }
  
    if (typeof ArrayBuffer !== "undefined") {
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        throw new TypeError("Binary payloads are not supported by the minimal Function Kit runtime surface.");
      }
    }
  
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      throw new TypeError("Blob payloads are not supported by the minimal Function Kit runtime surface.");
    }
  
    if (typeof FormData !== "undefined" && value instanceof FormData) {
      throw new TypeError("FormData payloads are not supported by the minimal Function Kit runtime surface.");
    }
  
    if (Array.isArray(value)) {
      return value.map((item) => normalizeTransportValue(item, seen));
    }
  
    if (typeof value.toJSON === "function") {
      return normalizeTransportValue(value.toJSON(), seen);
    }
  
    if (typeof value === "object") {
      if (seen.has(value)) {
        throw new TypeError("Function Kit runtime payloads cannot contain circular references.");
      }
  
      seen.add(value);
      const normalized = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        const nextValue = normalizeTransportValue(nestedValue, seen);
        if (nextValue !== undefined) {
          normalized[key] = nextValue;
        }
      }
      seen.delete(value);
      return normalized;
    }
  
    throw new TypeError("Unsupported payload value for Function Kit runtime transport.");
  }
  
  function extractRequestOptions(value) {
    const source = value && typeof value === "object" ? { ...value } : {};
    const requestOptions = {};
  
    if (typeof source.replyTo === "string" && source.replyTo) {
      requestOptions.replyTo = source.replyTo;
    }
    delete source.replyTo;
  
    if (Number.isFinite(source.timeoutMs) && source.timeoutMs > 0) {
      requestOptions.timeoutMs = source.timeoutMs;
    }
    delete source.timeoutMs;
  
    if (isAbortSignal(source.signal)) {
      requestOptions.signal = source.signal;
    }
    delete source.signal;
  
    return {
      payload: source,
      requestOptions
    };
  }
  
  function normalizeFetchInit(init = {}) {
    const { payload, requestOptions } = extractRequestOptions(init);
    const normalized = {};
  
    for (const [key, value] of Object.entries(payload)) {
      if (key === "headers") {
        const headers = normalizeHeaders(value);
        if (headers !== undefined) {
          normalized.headers = headers;
        }
        continue;
      }
  
      const nextValue = normalizeTransportValue(value);
      if (nextValue !== undefined) {
        normalized[key] = nextValue;
      }
    }
  
    return {
      init: normalized,
      requestOptions
    };
  }
  
  const TEXT_INPUT_TYPES = new Set(["", "email", "number", "search", "tel", "text", "url"]);
  const COMPOSER_BRIDGE_DISABLED_VALUES = new Set(["0", "disable", "disabled", "false", "off"]);
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  
  function getTagName(element) {
    return typeof element?.tagName === "string" ? element.tagName.toUpperCase() : "";
  }
  
  function getInputType(element) {
    return typeof element?.type === "string" ? element.type.toLowerCase() : "";
  }
  
  function readComposerBridgeFlag(element, name, { preserveCase = false } = {}) {
    if (!element || typeof element !== "object") {
      return "";
    }
  
    const datasetValue = typeof element.dataset?.[name] === "string" ? element.dataset[name] : "";
    if (datasetValue) {
      const normalizedDatasetValue = datasetValue.trim();
      return preserveCase ? normalizedDatasetValue : normalizedDatasetValue.toLowerCase();
    }
  
    const attributeName = name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    const attributeValue =
      typeof element.getAttribute === "function" ? element.getAttribute(`data-${attributeName}`) : null;
    if (typeof attributeValue !== "string") {
      return "";
    }
  
    const normalizedAttributeValue = attributeValue.trim();
    return preserveCase ? normalizedAttributeValue : normalizedAttributeValue.toLowerCase();
  }
  
  function isComposerBridgeDisabled(element) {
    const composerFlag = readComposerBridgeFlag(element, "functionKitComposer");
    return composerFlag ? COMPOSER_BRIDGE_DISABLED_VALUES.has(composerFlag) : false;
  }
  
  function isContentEditableElement(element) {
    if (!element || typeof element !== "object") {
      return false;
    }
  
    if (element.isContentEditable === true) {
      return true;
    }
  
    const attributeValue = typeof element.getAttribute === "function" ? element.getAttribute("contenteditable") : null;
    if (attributeValue === null) {
      return false;
    }
  
    const normalizedValue = String(attributeValue).trim().toLowerCase();
    return normalizedValue !== "false";
  }
  
  function isTextInputElement(element) {
    return getTagName(element) === "INPUT" && TEXT_INPUT_TYPES.has(getInputType(element));
  }
  
  function supportsComposerBridge(element) {
    if (!element || typeof element !== "object") {
      return false;
    }
  
    if (element.disabled === true) {
      return false;
    }
  
    if (isComposerBridgeDisabled(element)) {
      return false;
    }
  
    const tagName = getTagName(element);
    if (tagName === "TEXTAREA") {
      return true;
    }
  
    if (isTextInputElement(element)) {
      return true;
    }
  
    return isContentEditableElement(element);
  }
  
  function findComposerBridgeTarget(startNode) {
    let currentNode = startNode;
    while (currentNode && typeof currentNode === "object") {
      if (currentNode.nodeType === ELEMENT_NODE || currentNode.nodeType === undefined) {
        if (supportsComposerBridge(currentNode)) {
          return currentNode;
        }
        currentNode = currentNode.parentElement ?? currentNode.parentNode ?? null;
        continue;
      }
      currentNode = currentNode.parentNode ?? null;
    }
    return null;
  }
  
  function readEditableText(element) {
    if (!element || typeof element !== "object") {
      return "";
    }
  
    const tagName = getTagName(element);
    if (tagName === "INPUT" || tagName === "TEXTAREA") {
      return String(element.value ?? "");
    }
  
    return String(element.textContent ?? element.innerText ?? "");
  }
  
  function clampSelectionOffset(value, textLength) {
    if (!Number.isFinite(value)) {
      return textLength;
    }
    const nextValue = Math.trunc(value);
    if (nextValue < 0) {
      return 0;
    }
    if (nextValue > textLength) {
      return textLength;
    }
    return nextValue;
  }
  
  function createSnapshot(text, selectionStart, selectionEnd) {
    const normalizedText = typeof text === "string" ? text : String(text ?? "");
    const textLength = normalizedText.length;
    const start = clampSelectionOffset(selectionStart, textLength);
    const end = clampSelectionOffset(selectionEnd, textLength);
  
    return {
      text: normalizedText,
      selectionStart: Math.min(start, end),
      selectionEnd: Math.max(start, end)
    };
  }
  
  function readInputSelection(element) {
    if (!element || typeof element !== "object") {
      return null;
    }
  
    if (Number.isFinite(element.selectionStart) || Number.isFinite(element.selectionEnd)) {
      return {
        selectionStart: Number.isFinite(element.selectionStart) ? element.selectionStart : element.selectionEnd,
        selectionEnd: Number.isFinite(element.selectionEnd) ? element.selectionEnd : element.selectionStart
      };
    }
  
    return null;
  }
  
  function readContentEditableSelection(element, documentObject, globalObject) {
    const propertySelection = readInputSelection(element);
    if (propertySelection) {
      return propertySelection;
    }
  
    if (
      !documentObject ||
      typeof documentObject.createRange !== "function" ||
      typeof globalObject?.getSelection !== "function" ||
      typeof element?.contains !== "function"
    ) {
      return null;
    }
  
    const selection = globalObject.getSelection();
    if (!selection || typeof selection.rangeCount !== "number" || selection.rangeCount < 1) {
      return null;
    }
  
    const range = selection.getRangeAt(0);
    if (!range || !element.contains(range.startContainer) || !element.contains(range.endContainer)) {
      return null;
    }
  
    const startRange = documentObject.createRange();
    startRange.selectNodeContents(element);
    startRange.setEnd(range.startContainer, range.startOffset);
  
    const endRange = documentObject.createRange();
    endRange.selectNodeContents(element);
    endRange.setEnd(range.endContainer, range.endOffset);
  
    return {
      selectionStart: startRange.toString().length,
      selectionEnd: endRange.toString().length
    };
  }
  
  function readEditableSelection(element, documentObject, globalObject) {
    const inputSelection = readInputSelection(element);
    if (inputSelection) {
      return inputSelection;
    }
  
    if (isContentEditableElement(element)) {
      return readContentEditableSelection(element, documentObject, globalObject);
    }
  
    return null;
  }
  
  function buildEditableSnapshot(element, documentObject, globalObject) {
    const text = readEditableText(element);
    const selection = readEditableSelection(element, documentObject, globalObject);
    const fallbackOffset = text.length;
  
    return createSnapshot(
      text,
      selection?.selectionStart ?? fallbackOffset,
      selection?.selectionEnd ?? selection?.selectionStart ?? fallbackOffset
    );
  }
  
  function snapshotEquals(left, right) {
    return (
      !!left &&
      !!right &&
      left.text === right.text &&
      left.selectionStart === right.selectionStart &&
      left.selectionEnd === right.selectionEnd
    );
  }
  
  function setEditableText(element, text) {
    const normalizedText = typeof text === "string" ? text : String(text ?? "");
    if (getTagName(element) === "INPUT" || getTagName(element) === "TEXTAREA") {
      element.value = normalizedText;
      return;
    }
  
    element.textContent = normalizedText;
  }
  
  function locateTextPosition(rootNode, offset) {
    const normalizedOffset = Math.max(0, Math.trunc(offset));
  
    function walk(node, remainingOffset) {
      if (!node || typeof node !== "object") {
        return {
          node: rootNode,
          offset: 0,
          remainingOffset
        };
      }
  
      if (node.nodeType === TEXT_NODE) {
        const textLength = String(node.textContent ?? "").length;
        if (remainingOffset <= textLength) {
          return {
            node,
            offset: remainingOffset,
            remainingOffset: 0
          };
        }
        return {
          node,
          offset: textLength,
          remainingOffset: remainingOffset - textLength
        };
      }
  
      let nextRemainingOffset = remainingOffset;
      const childNodes =
        typeof node.childNodes?.length === "number" ? Array.from(node.childNodes) : [];
  
      for (const childNode of childNodes) {
        const result = walk(childNode, nextRemainingOffset);
        if (result.remainingOffset === 0) {
          return result;
        }
        nextRemainingOffset = result.remainingOffset;
      }
  
      return {
        node,
        offset: childNodes.length,
        remainingOffset: nextRemainingOffset
      };
    }
  
    const result = walk(rootNode, normalizedOffset);
    return {
      node: result.node ?? rootNode,
      offset: result.offset ?? 0
    };
  }
  
  function applyEditableSelection(element, snapshot, documentObject, globalObject) {
    if (!element || typeof element !== "object" || !snapshot) {
      return;
    }
  
    const normalizedSnapshot = createSnapshot(snapshot.text, snapshot.selectionStart, snapshot.selectionEnd);
  
    if (typeof element.setSelectionRange === "function") {
      try {
        element.setSelectionRange(normalizedSnapshot.selectionStart, normalizedSnapshot.selectionEnd);
        return;
      } catch {
        // Fall through to property assignment when the control does not support setSelectionRange.
      }
    }
  
    if ("selectionStart" in element || "selectionEnd" in element) {
      try {
        element.selectionStart = normalizedSnapshot.selectionStart;
        element.selectionEnd = normalizedSnapshot.selectionEnd;
        return;
      } catch {
        // Continue to contenteditable selection handling.
      }
    }
  
    if (
      !isContentEditableElement(element) ||
      !documentObject ||
      typeof documentObject.createRange !== "function" ||
      typeof globalObject?.getSelection !== "function"
    ) {
      return;
    }
  
    const selection = globalObject.getSelection();
    if (!selection || typeof selection.removeAllRanges !== "function" || typeof selection.addRange !== "function") {
      return;
    }
  
    const range = documentObject.createRange();
    const startPosition = locateTextPosition(element, normalizedSnapshot.selectionStart);
    const endPosition = locateTextPosition(element, normalizedSnapshot.selectionEnd);
  
    try {
      range.setStart(startPosition.node, startPosition.offset);
      range.setEnd(endPosition.node, endPosition.offset);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // Ignore selection updates when the browser cannot map offsets back to DOM positions.
    }
  }
  
  function createComposerDescriptor(element) {
    const tagName = getTagName(element);
    return normalizeTransportValue({
      tagName: tagName.toLowerCase(),
      inputType: tagName === "INPUT" ? getInputType(element) : undefined,
      multiline: tagName === "TEXTAREA",
      contentEditable: isContentEditableElement(element),
      id: typeof element.id === "string" && element.id ? element.id : undefined,
      name: typeof element.name === "string" && element.name ? element.name : undefined
    });
  }
  
  function normalizeComposerPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
  
    const nestedComposer = payload.composer && typeof payload.composer === "object" ? payload.composer : {};
    return {
      ...payload,
      ...nestedComposer
    };
  }
  
  function createAutoComposerBridge({ globalObject, emitter, send, options }) {
    const bridgeOptions = options?.inputBridge && typeof options.inputBridge === "object" ? options.inputBridge : null;
    const legacyComposerOptions =
      options?.composer && typeof options.composer === "object" ? options.composer : null;
    if ((bridgeOptions?.autoBind ?? legacyComposerOptions?.autoBind) === false) {
      return;
    }
  
    const documentObject = globalObject.document;
    if (!documentObject || typeof documentObject.addEventListener !== "function") {
      return;
    }
  
    const composerIds = new WeakMap();
    let composerSequence = 0;
    let activeBinding = null;
    let pendingBlurCloseHandle = null;
  
    function clearPendingBlurClose() {
      if (pendingBlurCloseHandle) {
        (globalObject.clearTimeout ?? clearTimeout)(pendingBlurCloseHandle);
        pendingBlurCloseHandle = null;
      }
    }
  
    function canSendComposerMessage(type) {
      // The composer bridge is an internal UI affordance: when users focus an input inside the kit,
      // the IME needs a way to route keystrokes back into the WebView. Do not gate it on runtime
      // permissions, otherwise simple editable fields would become fragile.
      return true;
    }
  
    function resolveComposerId(element) {
      const explicitComposerId = readComposerBridgeFlag(element, "functionKitComposerId", {
        preserveCase: true
      });
      if (explicitComposerId) {
        return explicitComposerId;
      }
  
      if (!composerIds.has(element)) {
        composerSequence += 1;
        const tagName = getTagName(element).toLowerCase() || "editable";
        const identity = element.id || element.name || `${tagName}-${composerSequence}`;
        composerIds.set(element, `auto-${identity}`);
      }
  
      return composerIds.get(element);
    }
  
    function buildComposerPayload(element, reason, overrides = {}) {
      const snapshot = buildEditableSnapshot(element, documentObject, globalObject);
      return {
        payload: normalizeTransportValue({
          composerId: resolveComposerId(element),
          reason,
          text: snapshot.text,
          selectionStart: snapshot.selectionStart,
          selectionEnd: snapshot.selectionEnd,
          focused: documentObject.activeElement === element,
          target: createComposerDescriptor(element),
          ...overrides
        }),
        snapshot
      };
    }
  
    function rememberBindingSnapshot(element, snapshot) {
      if (activeBinding?.element === element) {
        activeBinding.lastSnapshot = snapshot;
      }
    }
  
    function sendComposerMessage(type, element, reason, overrides = {}) {
      if (!element || !canSendComposerMessage(type)) {
        return false;
      }
  
      const { payload, snapshot } = buildComposerPayload(element, reason, overrides);
      send(type, payload);
      rememberBindingSnapshot(element, snapshot);
      return true;
    }
  
    function activateElement(element, reason) {
      const target = findComposerBridgeTarget(element);
      if (!target) {
        return;
      }
  
      clearPendingBlurClose();
  
      if (!activeBinding || activeBinding.element !== target) {
        activeBinding = {
          element: target,
          composerId: resolveComposerId(target),
          lastSnapshot: null
        };
        if (!sendComposerMessage("composer.open", target, reason)) {
          activeBinding = null;
        }
        return;
      }
  
      const nextSnapshot = buildEditableSnapshot(target, documentObject, globalObject);
      if (!snapshotEquals(nextSnapshot, activeBinding.lastSnapshot)) {
        sendComposerMessage("composer.update", target, reason);
        return;
      }
  
      sendComposerMessage("composer.focus", target, reason);
    }
  
    function syncActiveBinding(reason) {
      if (!activeBinding) {
        return;
      }
  
      const activeElement = findComposerBridgeTarget(documentObject.activeElement);
      if (!activeElement) {
        return;
      }
  
      if (activeBinding.element !== activeElement) {
        activateElement(activeElement, reason);
        return;
      }
  
      const nextSnapshot = buildEditableSnapshot(activeElement, documentObject, globalObject);
      if (!snapshotEquals(nextSnapshot, activeBinding.lastSnapshot)) {
        sendComposerMessage("composer.update", activeElement, reason);
      }
    }
  
    function scheduleBindingClose(previousTarget) {
      clearPendingBlurClose();
  
      pendingBlurCloseHandle = (globalObject.setTimeout ?? setTimeout)(() => {
        pendingBlurCloseHandle = null;
  
        if (!activeBinding || activeBinding.element !== previousTarget) {
          return;
        }
  
        const nextActiveTarget = findComposerBridgeTarget(documentObject.activeElement);
        if (nextActiveTarget) {
          activateElement(nextActiveTarget, "focus-transfer");
          return;
        }
  
        sendComposerMessage("composer.close", previousTarget, "blur", {
          open: false,
          focused: false
        });
        activeBinding = null;
      }, 0);
    }
  
    function applyHostComposerState(envelope) {
      if (!activeBinding) {
        return;
      }
  
      const composerPayload = normalizeComposerPayload(envelope?.payload);
      if (!composerPayload) {
        return;
      }
  
      if (composerPayload.composerId && composerPayload.composerId !== activeBinding.composerId) {
        return;
      }
  
      if (composerPayload.open === false) {
        const element = activeBinding.element;
        activeBinding = null;
        clearPendingBlurClose();
        try {
          if (element && typeof element.blur === "function") {
            element.blur();
          }
        } catch {
          // Ignore blur failures.
        }
        return;
      }
  
      const currentSnapshot = buildEditableSnapshot(activeBinding.element, documentObject, globalObject);
      const hasText = Object.prototype.hasOwnProperty.call(composerPayload, "text");
      const hasSelection =
        Number.isFinite(composerPayload.selectionStart) || Number.isFinite(composerPayload.selectionEnd);
  
      if (!hasText && !hasSelection) {
        return;
      }
  
      const nextSnapshot = createSnapshot(
        hasText ? composerPayload.text : currentSnapshot.text,
        Number.isFinite(composerPayload.selectionStart)
          ? composerPayload.selectionStart
          : hasSelection
            ? composerPayload.selectionEnd
            : currentSnapshot.selectionStart,
        Number.isFinite(composerPayload.selectionEnd)
          ? composerPayload.selectionEnd
          : hasSelection
            ? composerPayload.selectionStart
            : currentSnapshot.selectionEnd
      );
  
      if (hasText && currentSnapshot.text !== nextSnapshot.text) {
        setEditableText(activeBinding.element, nextSnapshot.text);
      }
  
      applyEditableSelection(activeBinding.element, nextSnapshot, documentObject, globalObject);
      activeBinding.lastSnapshot = buildEditableSnapshot(activeBinding.element, documentObject, globalObject);
    }
  
    emitter.on("composer.state.sync", applyHostComposerState);
  
    documentObject.addEventListener("focusin", (event) => {
      const target = findComposerBridgeTarget(event?.target);
      if (!target) {
        return;
      }
      activateElement(target, "focusin");
    });
  
    documentObject.addEventListener(
      "click",
      (event) => {
        const target = findComposerBridgeTarget(event?.target);
        if (!target) {
          return;
        }
  
        (globalObject.setTimeout ?? setTimeout)(() => {
          const refreshedTarget = findComposerBridgeTarget(target);
          if (refreshedTarget) {
            activateElement(refreshedTarget, "click");
          }
        }, 0);
      },
      true
    );
  
    documentObject.addEventListener(
      "pointerdown",
      (event) => {
        if (!activeBinding) {
          return;
        }
        const target = findComposerBridgeTarget(event?.target);
        if (target) {
          return;
        }
        const element = activeBinding.element;
        sendComposerMessage("composer.close", element, "pointerdown-outside", {
          open: false,
          focused: false
        });
        activeBinding = null;
        try {
          if (element && typeof element.blur === "function") {
            element.blur();
          }
        } catch {
          // Ignore blur failures.
        }
      },
      true
    );
  
    documentObject.addEventListener("input", (event) => {
      const target = findComposerBridgeTarget(event?.target);
      if (!target) {
        return;
      }
  
      if (!activeBinding) {
        return;
      }
      if (activeBinding.element !== target) {
        activateElement(target, "input");
        return;
      }
  
      syncActiveBinding("input");
    });
  
    documentObject.addEventListener("selectionchange", () => {
      syncActiveBinding("selectionchange");
    });
  
    documentObject.addEventListener("focusout", (event) => {
      const target = findComposerBridgeTarget(event?.target);
      if (target && activeBinding?.element === target) {
        scheduleBindingClose(target);
      }
    });
  }
  
  function createTransport(globalObject, debug) {
    let pendingFlushHandle = null;
  
    function ensurePendingOutboundEnvelopes() {
      if (!Array.isArray(globalObject.__FUNCTION_KIT_PENDING_UI_ENVELOPES__)) {
        globalObject.__FUNCTION_KIT_PENDING_UI_ENVELOPES__ = [];
      }
      return globalObject.__FUNCTION_KIT_PENDING_UI_ENVELOPES__;
    }
  
    function resolveOutboundDispatcher() {
      if (globalObject.chrome?.webview?.postMessage) {
        return (envelope) => {
          globalObject.chrome.webview.postMessage(envelope);
        };
      }
  
      if (globalObject.FunctionKitHost?.postMessage) {
        return (envelope) => {
          globalObject.FunctionKitHost.postMessage(envelope);
        };
      }
  
      if (globalObject.AndroidFunctionKitHost?.postMessage) {
        return (envelope) => {
          globalObject.AndroidFunctionKitHost.postMessage(JSON.stringify(envelope));
        };
      }
  
      if (globalObject.AndroidFunctionKitLegacyHost?.postMessage) {
        return (envelope) => {
          globalObject.AndroidFunctionKitLegacyHost.postMessage(JSON.stringify(envelope));
        };
      }
  
      return null;
    }
  
    function clearPendingFlush() {
      if (pendingFlushHandle === null) {
        return;
      }
      (globalObject.clearTimeout ?? clearTimeout)(pendingFlushHandle);
      pendingFlushHandle = null;
    }
  
    function flushPendingOutbound() {
      const dispatcher = resolveOutboundDispatcher();
      if (!dispatcher) {
        return false;
      }
  
      clearPendingFlush();
      const pendingEnvelopes = ensurePendingOutboundEnvelopes();
      while (pendingEnvelopes.length > 0) {
        dispatcher(pendingEnvelopes.shift());
      }
      return true;
    }
  
    function schedulePendingFlush() {
      if (pendingFlushHandle !== null) {
        return;
      }
  
      pendingFlushHandle = (globalObject.setTimeout ?? setTimeout)(function retryFlush() {
        pendingFlushHandle = null;
        if (flushPendingOutbound()) {
          return;
        }
  
        if (ensurePendingOutboundEnvelopes().length > 0) {
          schedulePendingFlush();
        }
      }, 50);
    }
  
    function post(envelope) {
      const pendingEnvelopes = ensurePendingOutboundEnvelopes();
      pendingEnvelopes.push(envelope);
  
      if (flushPendingOutbound()) {
        return;
      }
  
      if (debug) {
        console.debug("[FunctionKitRuntimeSDK:queued-outbound]", envelope);
      }
      schedulePendingFlush();
    }
  
    function attach(onEnvelope) {
      if (globalObject.chrome?.webview?.addEventListener) {
        globalObject.chrome.webview.addEventListener("message", (event) => onEnvelope(event.data));
      }
  
      if (globalObject.FunctionKitHost?.addEventListener) {
        globalObject.FunctionKitHost.addEventListener("message", onEnvelope);
      } else if (typeof globalObject.addEventListener === "function") {
        globalObject.addEventListener("message", (event) => onEnvelope(event.data));
      }
  
      globalObject.__FUNCTION_KIT_HOST_BRIDGE__ = globalObject.__FUNCTION_KIT_HOST_BRIDGE__ || {};
      globalObject.__FUNCTION_KIT_HOST_BRIDGE__.dispatchEnvelope = onEnvelope;
      if (Array.isArray(globalObject.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__)) {
        const pendingEnvelopes = globalObject.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__.splice(0);
        pendingEnvelopes.forEach(onEnvelope);
      }
      flushPendingOutbound();
    }
  
    return { post, attach };
  }
  
  function createClient(options = {}) {
    const globalObject = globalThis;
    const emitter = createEmitter();
    const transport = createTransport(globalObject, options.debug === true);
    const expectedKitId = options.kitId;
    const expectedSurface = options.surface ?? "panel";
    let lastHostMessageId = null;
    let grantedPermissions = new Set();
    let permissionsKnown = false;
    const pendingRequests = new Map();
    const seenMessageIds = new Set();
    const seenMessageIdQueue = [];
  
    function rememberMessageId(messageId) {
      if (!messageId || seenMessageIds.has(messageId)) {
        return false;
      }
  
      seenMessageIds.add(messageId);
      seenMessageIdQueue.push(messageId);
      if (seenMessageIdQueue.length > RECENT_MESSAGE_ID_LIMIT) {
        const expiredMessageId = seenMessageIdQueue.shift();
        if (expiredMessageId) {
          seenMessageIds.delete(expiredMessageId);
        }
      }
      return true;
    }
  
    function buildEnvelope(type, payload = {}, extra = {}) {
      const envelope = {
        version: PROTOCOL_VERSION,
        messageId: nextMessageId("ui"),
        timestamp: new Date().toISOString(),
        kitId: options.kitId,
        surface: options.surface ?? "panel",
        source: "function-kit-ui",
        target: "host-adapter",
        type,
        payload
      };
  
      if (extra.replyTo) {
        envelope.replyTo = extra.replyTo;
      }
  
      return envelope;
    }
  
    function buildDebugEnvelope(type, payload = {}) {
      const normalizedPayload = payload && typeof payload === "object" ? payload : { value: payload };
      return {
        version: PROTOCOL_VERSION,
        messageId: nextMessageId("debug"),
        timestamp: new Date().toISOString(),
        kitId: options.kitId,
        surface: options.surface ?? "panel",
        source: "function-kit-ui",
        target: "function-kit-ui",
        type,
        payload: normalizedPayload
      };
    }
  
    function emitDebug(type, payload = {}) {
      if (options.debug !== true) {
        return;
      }
      try {
        emitter.emit(type, buildDebugEnvelope(type, payload));
      } catch (_error) {
        // Ignore debug telemetry failures.
      }
    }
  
    function safeDebugText(value) {
      return typeof value === "string" ? value.trim() : "";
    }
  
    function cleanupPendingRequest(pending) {
      if (!pending) {
        return;
      }
  
      pendingRequests.delete(pending.messageId);
      if (pending.timeoutHandle) {
        clearTimeout(pending.timeoutHandle);
      }
      if (pending.abortSignal && pending.abortHandler) {
        pending.abortSignal.removeEventListener("abort", pending.abortHandler);
      }
    }
  
    function resolvePendingRequest(envelope) {
      let pending = null;
  
      if (envelope.replyTo) {
        pending = pendingRequests.get(envelope.replyTo) ?? null;
      }
  
      if (!pending) {
        pending =
          [...pendingRequests.values()].find((item) => item.expectedReplyTypes.includes(envelope.type)) ?? null;
      }
  
      if (!pending) {
        return false;
      }
  
      cleanupPendingRequest(pending);
  
      const durationMs = Number.isFinite(pending.startedAt) ? Date.now() - pending.startedAt : null;
      const requestDebugBase = {
        phase: "",
        messageId: pending.messageId,
        requestType: pending.requestType,
        replyTo: envelope.replyTo ?? null,
        expectedReplyTypes: pending.expectedReplyTypes ?? [],
        timeoutMs: pending.timeoutMs ?? null,
        durationMs
      };
  
      if (envelope.type === "bridge.error" || envelope.type === "permission.denied") {
        const message = safeDebugText(
          envelope.error?.message ?? envelope.payload?.message ?? envelope.payload?.error ?? ""
        );
        emitDebug("debug.request", {
          ...requestDebugBase,
          phase: "rejected",
          error: { kind: envelope.type, message: message || envelope.type },
          resultEnvelope: envelope
        });
        pending.reject(envelope);
        return true;
      }
  
      emitDebug("debug.request", {
        ...requestDebugBase,
        phase: "resolved",
        resultEnvelope: envelope
      });
      pending.resolve(envelope);
      return true;
    }
  
    function handleEnvelope(rawEnvelope) {
      const envelope = safeParse(rawEnvelope);
      if (!envelope || typeof envelope !== "object") {
        emitDebug("debug.drop", { reason: "invalid-envelope" });
        return;
      }
      if (envelope.version !== PROTOCOL_VERSION) {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-version]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-version", envelope });
        return;
      }
      if (envelope.source !== "host-adapter") {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-source]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-source", envelope });
        return;
      }
      if (envelope.target && envelope.target !== "function-kit-ui") {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-target]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-target", envelope });
        return;
      }
      if (expectedKitId && envelope.kitId && envelope.kitId !== expectedKitId) {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-kit]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-kit", envelope, expectedKitId });
        return;
      }
      if (expectedSurface && envelope.surface && envelope.surface !== expectedSurface) {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-surface]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-surface", envelope, expectedSurface });
        return;
      }
      if (!envelope.type || typeof envelope.type !== "string") {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-type]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-type", envelope });
        return;
      }
      if (!("payload" in envelope) || envelope.payload === null || typeof envelope.payload !== "object") {
        if (options.debug === true) {
          console.warn("[FunctionKitRuntimeSDK:invalid-payload]", envelope);
        }
        emitDebug("debug.drop", { reason: "invalid-payload", envelope });
        return;
      }
      if (!rememberMessageId(envelope.messageId)) {
        if (options.debug === true) {
          console.debug("[FunctionKitRuntimeSDK:duplicate-message]", envelope.messageId);
        }
        emitDebug("debug.drop", { reason: "duplicate-message", envelope });
        return;
      }
  
      lastHostMessageId = envelope.messageId ?? lastHostMessageId;
      if (envelope.type === "bridge.ready.ack" || envelope.type === "permissions.sync") {
        permissionsKnown = true;
        const normalized = normalizeGrantedPermissions(envelope.payload?.grantedPermissions);
        // Ensure UI handlers see a stable array even if the host serialized permissions as a string.
        envelope.payload.grantedPermissions = normalized;
        grantedPermissions = new Set(normalized);
        if (options.debug === true) {
          console.debug("[FunctionKitRuntimeSDK:permissions]", envelope.type, normalized);
        }
      }
      if (options.debug === true) {
        console.debug("[FunctionKitRuntimeSDK:host-envelope]", envelope.type, envelope.messageId, envelope.replyTo ?? "");
      }
  
      resolvePendingRequest(envelope);
      emitter.emit(envelope.type, envelope);
    }
  
    function normalizeGrantedPermissions(value) {
      if (Array.isArray(value)) {
        return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
      }
      if (value instanceof Set) {
        return Array.from(value).map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
          return [];
        }
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return parsed
                .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                .filter(Boolean);
            }
          } catch (_error) {
            // Fall back to splitting below.
          }
        }
        return trimmed
          .replace(/^\[/, "")
          .replace(/\]$/, "")
          .split(/[,\s]+/g)
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      return [];
    }
  
    function send(type, payload = {}, extra = {}) {
      const envelope = buildEnvelope(type, payload, extra);
      transport.post(envelope);
      emitDebug("debug.envelope", { direction: "ui->host", kind: "send", envelope });
      return envelope;
    }
  
    function request(type, payload = {}, extra = {}) {
      return new Promise((resolve, reject) => {
        const envelope = buildEnvelope(type, payload, extra);
        const timeoutMs =
          extra.timeoutMs ??
          options.requestTimeoutMs ??
          DEFAULT_REQUEST_TIMEOUTS_MS[type] ??
          DEFAULT_REQUEST_TIMEOUT_MS;
        const pending = {
          messageId: envelope.messageId,
          requestType: type,
          expectedReplyTypes: extra.expectedReplyTypes ?? DEFAULT_REPLY_TYPES[type] ?? [],
          timeoutMs,
          startedAt: Date.now(),
          resolve,
          reject,
          timeoutHandle: null,
          abortSignal: null,
          abortHandler: null
        };
  
        if (isAbortSignal(extra.signal)) {
          if (extra.signal.aborted) {
            emitDebug("debug.request", {
              phase: "rejected",
              messageId: pending.messageId,
              requestType: pending.requestType,
              replyTo: envelope.replyTo ?? null,
              expectedReplyTypes: pending.expectedReplyTypes,
              timeoutMs,
              durationMs: 0,
              error: { kind: "abort", message: `aborted-before-send: ${type}` }
            });
            reject(createAbortError(`FunctionKitRuntimeSDK request aborted before send: ${type}`));
            return;
          }
          pending.abortSignal = extra.signal;
          pending.abortHandler = () => {
            emitDebug("debug.request", {
              phase: "rejected",
              messageId: pending.messageId,
              requestType: pending.requestType,
              replyTo: envelope.replyTo ?? null,
              expectedReplyTypes: pending.expectedReplyTypes,
              timeoutMs,
              durationMs: Number.isFinite(pending.startedAt) ? Date.now() - pending.startedAt : null,
              error: { kind: "abort", message: `aborted: ${type}` }
            });
            cleanupPendingRequest(pending);
            reject(createAbortError(`FunctionKitRuntimeSDK request aborted: ${type}`));
          };
          extra.signal.addEventListener("abort", pending.abortHandler, { once: true });
        }
  
        if (timeoutMs > 0) {
          pending.timeoutHandle = setTimeout(() => {
            emitDebug("debug.request", {
              phase: "rejected",
              messageId: pending.messageId,
              requestType: pending.requestType,
              replyTo: envelope.replyTo ?? null,
              expectedReplyTypes: pending.expectedReplyTypes,
              timeoutMs,
              durationMs: Number.isFinite(pending.startedAt) ? Date.now() - pending.startedAt : null,
              error: { kind: "timeout", message: `timeout: ${type}` }
            });
            cleanupPendingRequest(pending);
            reject(
              new Error(`FunctionKitRuntimeSDK request timeout: ${type} (${options.kitId ?? "unknown-kit"})`)
            );
          }, timeoutMs);
        }
  
        pendingRequests.set(envelope.messageId, pending);
        emitDebug("debug.request", {
          phase: "pending",
          messageId: pending.messageId,
          requestType: pending.requestType,
          replyTo: envelope.replyTo ?? null,
          expectedReplyTypes: pending.expectedReplyTypes,
          timeoutMs
        });
  
        try {
          transport.post(envelope);
          emitDebug("debug.envelope", { direction: "ui->host", kind: "request", envelope });
        } catch (error) {
          emitDebug("debug.request", {
            phase: "rejected",
            messageId: pending.messageId,
            requestType: pending.requestType,
            replyTo: envelope.replyTo ?? null,
            expectedReplyTypes: pending.expectedReplyTypes,
            timeoutMs,
            durationMs: Number.isFinite(pending.startedAt) ? Date.now() - pending.startedAt : null,
            error: { kind: "transport", message: safeDebugText(error?.message) || "transport.post failed" }
          });
          cleanupPendingRequest(pending);
          reject(error);
        }
      });
    }
  
    function requestEnvelope(type, payload = {}, extra = {}) {
      return request(type, payload, extra);
    }
  
    createAutoComposerBridge({
      globalObject,
      emitter,
      send,
      options
    });
  
    transport.attach(handleEnvelope);
  
    return {
      protocolVersion: PROTOCOL_VERSION,
      on: emitter.on,
      send,
      fetch(url, init = {}) {
        const { init: normalizedInit, requestOptions } = normalizeFetchInit(init);
        return requestEnvelope(
          "network.fetch",
          {
            url: normalizeUrl(url),
            init: normalizedInit
          },
          requestOptions
        );
      },
      getLastHostMessageId() {
        return lastHostMessageId;
      },
      hasPermission(permission) {
        return grantedPermissions.has(permission);
      },
      runtime: {
        connect(payload = {}) {
          const { payload: nextPayload, requestOptions } = extractRequestOptions(payload);
          return requestEnvelope("bridge.ready", normalizeTransportValue(nextPayload), requestOptions);
        },
        sendMessage(payload = {}) {
          const { payload: nextPayload, requestOptions } = extractRequestOptions(payload);
          return requestEnvelope("runtime.message.send", normalizeTransportValue(nextPayload), requestOptions);
        }
      },
      context: {
        requestSnapshot(payload = {}, extra = {}) {
          return requestEnvelope("context.request", normalizeTransportValue(payload), extra);
        }
      },
      input: {
        insertText(payload = {}, extra = {}) {
          return send("candidate.insert", normalizeTransportValue(payload), extra);
        },
        replaceText(payload = {}, extra = {}) {
          return send("candidate.replace", normalizeTransportValue(payload), extra);
        },
        commitImage(payload = {}, extra = {}) {
          return send("input.commitImage", normalizeTransportValue(payload), extra);
        },
        observeBestEffortStart(payload = {}, extra = {}) {
          return requestEnvelope("input.observe.best_effort.start", normalizeTransportValue(payload), extra);
        },
        observeBestEffortStop(payload = {}, extra = {}) {
          return requestEnvelope("input.observe.best_effort.stop", normalizeTransportValue(payload), extra);
        }
      },
      sendIntercept: {
        registerImeAction(payload = {}, extra = {}) {
          return requestEnvelope("send.intercept.ime_action.register", normalizeTransportValue(payload), extra);
        },
        unregisterImeAction(payload = {}, extra = {}) {
          return requestEnvelope("send.intercept.ime_action.unregister", normalizeTransportValue(payload), extra);
        }
      },
      candidates: {
        regenerate(payload = {}, extra = {}) {
          return send("candidates.regenerate", normalizeTransportValue(payload), extra);
        }
      },
      ai: {
        request(payload = {}) {
          const { payload: nextPayload, requestOptions } = extractRequestOptions(payload);
          return requestEnvelope("ai.request", normalizeTransportValue(nextPayload), requestOptions);
        },
        listAgents(filter = {}) {
          const { payload: nextPayload, requestOptions } = extractRequestOptions(filter);
          return requestEnvelope("ai.agent.list", normalizeTransportValue(nextPayload), requestOptions);
        },
        runAgent(payload = {}) {
          const { payload: nextPayload, requestOptions } = extractRequestOptions(payload);
          return requestEnvelope("ai.agent.run", normalizeTransportValue(nextPayload), requestOptions);
        }
      },
      settings: {
        open(payload = {}, extra = {}) {
          return send("settings.open", normalizeTransportValue(payload), extra);
        }
      },
      storage: {
        get(keys = [], extra = {}) {
          return requestEnvelope("storage.get", { keys: normalizeTransportValue(keys) }, extra);
        },
        set(values = {}, extra = {}) {
          return requestEnvelope("storage.set", { values: normalizeTransportValue(values) }, extra);
        }
      },
      files: {
        pick(payload = {}, extra = {}) {
          return requestEnvelope("files.pick", normalizeTransportValue(payload), extra);
        },
        download(payload = {}, extra = {}) {
          return requestEnvelope("files.download", normalizeTransportValue(payload), extra);
        },
        getUrl(payload = {}, extra = {}) {
          return requestEnvelope("files.getUrl", normalizeTransportValue(payload), extra);
        }
      },
      kits: {
        sync(payload = {}, extra = {}) {
          return requestEnvelope("kits.sync.request", normalizeTransportValue(payload), extra);
        },
        open(payload = {}, extra = {}) {
          return requestEnvelope("kits.open", normalizeTransportValue(payload), extra);
        },
        install(payload = {}, extra = {}) {
          return requestEnvelope("kits.install", normalizeTransportValue(payload), extra);
        },
        uninstall(payload = {}, extra = {}) {
          return requestEnvelope("kits.uninstall", normalizeTransportValue(payload), extra);
        },
        updateSettings(payload = {}, extra = {}) {
          return requestEnvelope("kits.settings.update", normalizeTransportValue(payload), extra);
        }
      },
      catalog: {
        getSources(payload = {}, extra = {}) {
          return requestEnvelope("catalog.sources.get", normalizeTransportValue(payload), extra);
        },
        setSources(payload = {}, extra = {}) {
          return requestEnvelope("catalog.sources.set", normalizeTransportValue(payload), extra);
        },
        refresh(payload = {}, extra = {}) {
          return requestEnvelope("catalog.refresh", normalizeTransportValue(payload), extra);
        }
      },
      panel: {
        updateState(patch = {}, extra = {}) {
          return requestEnvelope("panel.state.update", { patch: normalizeTransportValue(patch) }, extra);
        }
      },
      tasks: {
        sync(payload = {}, extra = {}) {
          return requestEnvelope("tasks.sync.request", normalizeTransportValue(payload), extra);
        },
        cancel(payload = {}, extra = {}) {
          return requestEnvelope("task.cancel", normalizeTransportValue(payload), extra);
        }
      }
    };
  }
  
  function normalizeHostError(value, fallbackMessage = "Host returned an error.") {
    if (!value) {
      return Object.assign(new Error(fallbackMessage), {
        name: "FunctionKitHostError",
        code: "unknown_error",
        retryable: false,
        details: null,
        envelope: null
      });
    }
  
    if (value instanceof Error) {
      return value;
    }
  
    // createClient rejects with the raw envelope for bridge.error / permission.denied.
    if (typeof value === "object" && typeof value.type === "string") {
      const envelope = value;
      if (envelope.type === "bridge.error" || envelope.type === "permission.denied") {
        const errorPayload = envelope.error && typeof envelope.error === "object" ? envelope.error : {};
        const message =
          typeof errorPayload.message === "string" && errorPayload.message.trim()
            ? errorPayload.message.trim()
            : fallbackMessage;
        const hostError = new Error(message);
        hostError.name = "FunctionKitHostError";
        hostError.code =
          typeof errorPayload.code === "string" && errorPayload.code.trim()
            ? errorPayload.code.trim()
            : envelope.type === "permission.denied"
              ? "permission_denied"
              : "bridge_error";
        hostError.retryable = errorPayload.retryable === true;
        hostError.details = "details" in errorPayload ? errorPayload.details : null;
        hostError.envelope = envelope;
        return hostError;
      }
    }
  
    const error = new Error(typeof value === "string" && value.trim() ? value.trim() : fallbackMessage);
    error.name = "FunctionKitHostError";
    error.code = "unknown_error";
    error.retryable = false;
    error.details = value;
    error.envelope = null;
    return error;
  }
  
  function normalizePermissionsList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
  }
  
  const preview = {
    installIfMissing(options = {}) {
      const globalObject = globalThis;
      if (
        globalObject.chrome?.webview?.postMessage ||
        globalObject.FunctionKitHost?.postMessage ||
        globalObject.AndroidFunctionKitHost?.postMessage ||
        globalObject.AndroidFunctionKitLegacyHost?.postMessage
      ) {
        return { installed: false, host: null };
      }
  
      const listeners = new Set();
      const kitId = options.kitId ?? "preview-kit";
      const surface = options.surface ?? "panel";
      const nowIso = () => new Date().toISOString();
      const grantedPermissions =
        normalizePermissionsList(options.grantedPermissions ?? options.runtimePermissions ?? options.permissions)
          .concat(
            options.grantAll === true
              ? PREVIEW_GRANT_ALL_PERMISSIONS
              : []
          )
          .filter(Boolean);
  
      const state = {
        renderSeed: 0,
        storage: { ...(options.storage && typeof options.storage === "object" ? options.storage : {}) },
        context:
          options.context && typeof options.context === "object"
            ? { ...options.context }
            : {
                sourceMessage: "当前输入框内容：你好呀",
                sourcePackage: "preview.mock.host",
                selectedText: ""
              },
        kits: Array.isArray(options.kits) ? options.kits : [],
        catalogSources: Array.isArray(options.catalogSources) ? options.catalogSources : [],
        catalogPackages: Array.isArray(options.catalogPackages) ? options.catalogPackages : [],
        downloadedFiles: new Map(),
        composer: {
          open: false,
          focused: false,
          composerId: "",
          text: "",
          selectionStart: 0,
          selectionEnd: 0
        }
      };
  
      function buildEnvelope(type, payload = {}, extra = {}) {
        const envelope = {
          version: PROTOCOL_VERSION,
          messageId: extra.messageId ?? nextMessageId("host"),
          timestamp: nowIso(),
          kitId,
          surface,
          source: "host-adapter",
          target: "function-kit-ui",
          type,
          payload
        };
        if (extra.replyTo) {
          envelope.replyTo = extra.replyTo;
        }
        if (extra.error) {
          envelope.error = extra.error;
        }
        return envelope;
      }
  
      function emit(envelope) {
        listeners.forEach((handler) => handler(envelope));
      }
  
      function emitContext(replyTo) {
        emit(buildEnvelope("context.sync", { context: { ...state.context } }, { replyTo }));
      }
  
      function emitStorage(replyTo, keys) {
        const values = {};
        const resolvedKeys = Array.isArray(keys) && keys.length > 0 ? keys : Object.keys(state.storage);
        resolvedKeys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(state.storage, key)) {
            values[key] = state.storage[key];
          }
        });
        emit(buildEnvelope("storage.sync", { values }, { replyTo }));
      }
  
      function emitComposerState(replyTo, reason = "mock-sync") {
        emit(
          buildEnvelope(
            "composer.state.sync",
            {
              reason,
              composer: { ...state.composer },
              capabilities: {
                canInsert: true,
                canReplace: true,
                targetAvailable: true
              }
            },
            { replyTo }
          )
        );
      }
  
      function emitCandidates(replyTo, requestPayload) {
        const generator =
          typeof options.candidatesGenerator === "function"
            ? options.candidatesGenerator
            : () => [
                { id: "preview-1", text: "收到，我先整理一下，稍后回复你。", tone: "预览", risk: "low", rationale: "本地预览候选" },
                { id: "preview-2", text: "明白，我先看下，晚点同步进展。", tone: "预览", risk: "low", rationale: "本地预览候选" },
                { id: "preview-3", text: "可以，我先处理手头上的，整理好后发你。", tone: "预览", risk: "medium", rationale: "本地预览候选" }
              ];
  
        const modifiers = Array.isArray(requestPayload?.modifiers) ? requestPayload.modifiers : [];
        const preferredTone = typeof requestPayload?.preferredTone === "string" ? requestPayload.preferredTone : "balanced";
        const candidates = generator({
          seed: state.renderSeed++,
          preferredTone,
          modifiers,
          context: { ...state.context }
        });
  
        emit(
          buildEnvelope(
            "candidates.render",
            {
              requestContext: { ...state.context, preferredTone, modifiers },
              result: { candidates: Array.isArray(candidates) ? candidates : [], missing_context: [] },
              uiHints: { allowRegenerate: true }
            },
            { replyTo }
          )
        );
      }
  
      function emitError(replyTo, code, message, details) {
        emit(
          buildEnvelope(
            "bridge.error",
            {},
            {
              replyTo,
              error: {
                code,
                message,
                retryable: false,
                details
              }
            }
          )
        );
      }
  
      function route(rawEnvelope) {
        const envelope = typeof rawEnvelope === "string" ? safeParse(rawEnvelope) : rawEnvelope;
        if (!envelope || envelope.target !== "host-adapter") {
          return;
        }
  
        switch (envelope.type) {
          case "bridge.ready": {
            const requested = normalizePermissionsList(envelope.payload?.requestedPermissions);
            const resolvedPermissions = requested.length > 0 ? requested : grantedPermissions;
            emit(
              buildEnvelope(
                "bridge.ready.ack",
                {
                  sessionId: `session-${kitId}-preview`,
                  grantedPermissions: resolvedPermissions,
                  hostInfo: {
                    platform: "preview",
                    runtime: "mock-host",
                    executionMode: options.executionMode ?? "local-demo",
                    build: {
                      displayName: "preview"
                    }
                  }
                },
                { replyTo: envelope.messageId }
              )
            );
            emit(buildEnvelope("permissions.sync", { grantedPermissions: resolvedPermissions }));
            emitContext(null);
            emitStorage(null);
            break;
          }
          case "context.request":
            emitContext(envelope.messageId);
            break;
          case "storage.get":
            emitStorage(envelope.messageId, envelope.payload?.keys);
            break;
          case "storage.set":
            Object.assign(state.storage, envelope.payload?.values ?? {});
            emitStorage(envelope.messageId);
            break;
          case "candidates.regenerate":
            emitCandidates(envelope.messageId, envelope.payload ?? {});
            break;
          case "ai.request": {
            const payload = envelope.payload ?? {};
            const requestId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
            const handler = typeof options.aiRequestHandler === "function" ? options.aiRequestHandler : null;
            const result = handler?.({ envelope, context: { ...state.context } }) ?? {};
            const text = typeof result.text === "string" ? result.text : "由 preview mock-host 生成。";
            const structured = result.structured && typeof result.structured === "object" ? result.structured : null;
            const output =
              structured && Object.keys(structured).length > 0
                ? { type: "json", text, json: structured }
                : { type: "text", text };
            emit(
              buildEnvelope(
                "ai.response",
                {
                  requestId,
                  status: "succeeded",
                  output,
                  usage: result.usage && typeof result.usage === "object" ? result.usage : undefined
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "tasks.sync.request": {
            emit(
              buildEnvelope(
                "tasks.sync",
                {
                  running: [],
                  history: []
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "kits.sync.request": {
            emit(
              buildEnvelope(
                "kits.sync",
                {
                  kits: Array.isArray(state.kits) ? state.kits : []
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "kits.open": {
            const kitId = typeof envelope.payload?.kitId === "string" ? envelope.payload.kitId.trim() : "";
            emit(
              buildEnvelope(
                "kits.open.result",
                {
                  ok: true,
                  kitId: kitId || null
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "kits.install": {
            const kitId =
              typeof envelope.payload?.kitId === "string"
                ? envelope.payload.kitId.trim()
                : typeof envelope.payload?.source?.kitId === "string"
                  ? envelope.payload.source.kitId.trim()
                  : "";
            if (kitId) {
              const existing = (Array.isArray(state.kits) ? state.kits : []).find((kit) => kit?.kitId === kitId);
              if (!existing) {
                state.kits.push({ kitId, name: kitId, version: "0.0.0-preview", enabled: true, source: "preview" });
              }
            }
            emit(
              buildEnvelope(
                "kits.install.result",
                {
                  ok: true,
                  kitId: kitId || null
                },
                { replyTo: envelope.messageId }
              )
            );
            emit(buildEnvelope("kits.sync", { kits: Array.isArray(state.kits) ? state.kits : [] }));
            break;
          }
          case "kits.uninstall": {
            const kitId = typeof envelope.payload?.kitId === "string" ? envelope.payload.kitId.trim() : "";
            if (kitId) {
              state.kits = (Array.isArray(state.kits) ? state.kits : []).filter((kit) => kit?.kitId !== kitId);
            }
            emit(
              buildEnvelope(
                "kits.uninstall.result",
                {
                  ok: true,
                  kitId: kitId || null
                },
                { replyTo: envelope.messageId }
              )
            );
            emit(buildEnvelope("kits.sync", { kits: Array.isArray(state.kits) ? state.kits : [] }));
            break;
          }
          case "kits.settings.update": {
            const kitId = typeof envelope.payload?.kitId === "string" ? envelope.payload.kitId.trim() : "";
            const patch = envelope.payload?.patch && typeof envelope.payload.patch === "object" ? envelope.payload.patch : null;
            if (kitId && patch) {
              state.kits = (Array.isArray(state.kits) ? state.kits : []).map((kit) => {
                if (!kit || kit.kitId !== kitId) {
                  return kit;
                }
                return { ...kit, ...patch };
              });
            }
            emit(
              buildEnvelope(
                "kits.settings.update.result",
                {
                  ok: true,
                  kitId: kitId || null
                },
                { replyTo: envelope.messageId }
              )
            );
            emit(buildEnvelope("kits.sync", { kits: Array.isArray(state.kits) ? state.kits : [] }));
            break;
          }
          case "catalog.sources.get": {
            emit(
              buildEnvelope(
                "catalog.sources.sync",
                {
                  sources: Array.isArray(state.catalogSources) ? state.catalogSources : []
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "catalog.sources.set": {
            state.catalogSources = Array.isArray(envelope.payload?.sources) ? envelope.payload.sources : [];
            emit(
              buildEnvelope(
                "catalog.sources.sync",
                {
                  sources: Array.isArray(state.catalogSources) ? state.catalogSources : []
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "catalog.refresh": {
            emit(
              buildEnvelope(
                "catalog.sync",
                {
                  packages: Array.isArray(state.catalogPackages) ? state.catalogPackages : []
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "files.download": {
            const fileId = `preview-file-${Math.random().toString(16).slice(2, 10)}`;
            const url = typeof envelope.payload?.url === "string" ? envelope.payload.url.trim() : "";
            state.downloadedFiles.set(fileId, url);
            emit(
              buildEnvelope(
                "files.download.result",
                {
                  ok: true,
                  fileId,
                  url
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "files.getUrl": {
            const fileId = typeof envelope.payload?.fileId === "string" ? envelope.payload.fileId.trim() : "";
            const originalUrl = fileId ? state.downloadedFiles.get(fileId) : "";
            emit(
              buildEnvelope(
                "files.getUrl.result",
                {
                  ok: true,
                  fileId: fileId || null,
                  url: fileId ? `https://function-kit.local/assets/files/${encodeURIComponent(fileId)}` : null,
                  originalUrl: originalUrl || null
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "task.cancel": {
            const taskId = typeof envelope.payload?.taskId === "string" ? envelope.payload.taskId : "";
            emit(
              buildEnvelope(
                "task.cancel.ack",
                {
                  taskId,
                  ok: true
                },
                { replyTo: envelope.messageId }
              )
            );
            break;
          }
          case "composer.open":
          case "composer.focus":
          case "composer.update":
          case "composer.close": {
            const payload = envelope.payload ?? {};
            if (envelope.type === "composer.close") {
              state.composer.open = payload.open ?? false;
              state.composer.focused = false;
            } else {
              state.composer.open = true;
              state.composer.focused = payload.focused ?? true;
            }
            if (typeof payload.composerId === "string" && payload.composerId) {
              state.composer.composerId = payload.composerId;
            }
            if (typeof payload.text === "string") {
              state.composer.text = payload.text;
            }
            if (Number.isFinite(payload.selectionStart)) {
              state.composer.selectionStart = payload.selectionStart;
            }
            if (Number.isFinite(payload.selectionEnd)) {
              state.composer.selectionEnd = payload.selectionEnd;
            }
            emitComposerState(envelope.messageId, envelope.type);
            break;
          }
          case "candidate.insert":
          case "candidate.replace":
            emit(
              buildEnvelope("host.state.update", {
                label: envelope.type === "candidate.replace" ? "已替换到目标输入框" : "已插入到目标输入框"
              })
            );
            break;
          case "settings.open":
            emit(buildEnvelope("host.state.update", { label: "Mock host 已收到设置请求" }));
            break;
          case "panel.state.update":
            emit(buildEnvelope("panel.state.ack", { ok: true }, { replyTo: envelope.messageId }));
            break;
          default:
            emitError(envelope.messageId, "unsupported_message_type", `Unsupported message type: ${envelope.type}`, {
              type: envelope.type
            });
        }
      }
  
      const host = {
        messages: [],
        addEventListener(type, handler) {
          if (type === "message" && typeof handler === "function") {
            listeners.add(handler);
          }
        },
        postMessage(envelope) {
          host.messages.push(envelope);
          queueMicrotask(() => route(envelope));
        }
      };
  
      globalObject.FunctionKitHost = host;
      return { installed: true, host };
    }
  };
  
  function createKit(options = {}) {
    if (options.preview && typeof options.preview === "object") {
      preview.installIfMissing({
        kitId: options.kitId,
        surface: options.surface ?? "panel",
        ...options.preview
      });
    }
  
    const raw = createClient(options);
    const emitter = createEmitter();
    const subscribers = new Set();
    const storageWatchers = new Set();
    const connectOptions = options.connect && typeof options.connect === "object" ? options.connect : {};
    let state = {
      kitId: options.kitId,
      surface: options.surface ?? "panel",
      sessionId: null,
      connected: false,
      permissions: [],
      permissionsKnown: false,
      hostInfo: null,
      context: null,
      candidates: null,
      storage: null,
      ai: null,
      tasks: {
        byId: {},
        runningIds: [],
        historyIds: [],
        lastSyncAt: null
      },
      kits: {
        byId: {},
        ids: [],
        lastSyncAt: null
      },
      catalog: {
        sources: [],
        packages: [],
        lastSyncAt: null
      },
      lastHostMessageId: null,
      lastInvocation: null,
      lastIntent: null,
      lastMessage: null,
      lastError: null
    };
  
    function setState(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((handler) => handler(state));
    }
  
    function withDefaultReplyTo(extra) {
      const requestOptions = extra && typeof extra === "object" ? { ...extra } : {};
      if (!requestOptions.replyTo) {
        const last = raw.getLastHostMessageId();
        if (last) {
          requestOptions.replyTo = last;
        }
      }
      return requestOptions;
    }
  
    function emit(type, payload) {
      emitter.emit(type, payload);
    }
  
    const TASK_RUNNING_STATUSES = new Set(["queued", "running", "canceling"]);
    const TASK_TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);
    const MAX_TASK_HISTORY = 50;
  
    function safeText(value) {
      return typeof value === "string" ? value.trim() : "";
    }
  
    function normalizeHostIntent(value) {
      if (!value || typeof value !== "object") {
        return null;
      }
      const kind = safeText(value.kind);
      if (!kind) {
        return null;
      }
      return { ...value, kind };
    }
  
    function normalizeBindingInvocation(value) {
      if (!value || typeof value !== "object") {
        return null;
      }
  
      const binding = value.binding && typeof value.binding === "object" ? value.binding : {};
      const bindingPreferredPresentation = safeText(binding.preferredPresentation) || null;
      const bindingCategories = Array.isArray(binding.categories)
        ? binding.categories.map((entry) => safeText(entry)).filter(Boolean)
        : null;
      const bindingEntry = binding.entry && typeof binding.entry === "object" ? binding.entry : null;
      const requestedPayloads = Array.isArray(value.requestedPayloads)
        ? value.requestedPayloads.map((entry) => safeText(entry)).filter(Boolean)
        : null;
      const providedPayloads = Array.isArray(value.providedPayloads)
        ? value.providedPayloads.map((entry) => safeText(entry)).filter(Boolean)
        : null;
      const missingPermissions = Array.isArray(value.missingPermissions)
        ? value.missingPermissions.map((entry) => safeText(entry)).filter(Boolean)
        : null;
      const payloadLimitsSource = value.payloadLimits && typeof value.payloadLimits === "object" ? value.payloadLimits : null;
      const payloadLimits =
        payloadLimitsSource
          ? {
              cursorContextChars: Number.isFinite(payloadLimitsSource.cursorContextChars)
                ? payloadLimitsSource.cursorContextChars
                : null,
              selectionTextMaxChars: Number.isFinite(payloadLimitsSource.selectionTextMaxChars)
                ? payloadLimitsSource.selectionTextMaxChars
                : null,
              clipboardTextMaxChars: Number.isFinite(payloadLimitsSource.clipboardTextMaxChars)
                ? payloadLimitsSource.clipboardTextMaxChars
                : null
            }
          : null;
      const payloadTruncated = typeof value.payloadTruncated === "boolean" ? value.payloadTruncated : null;
  
      return {
        invocationId: safeText(value.invocationId) || null,
        trigger: safeText(value.trigger) || null,
        binding: {
          id: safeText(binding.id) || null,
          title: safeText(binding.title) || null,
          preferredPresentation: bindingPreferredPresentation,
          categories: bindingCategories,
          entry: bindingEntry
        },
        context: value.context ?? null,
        clipboardText: typeof value.clipboardText === "string" ? value.clipboardText : null,
        createdAtEpochMs: Number.isFinite(value.createdAtEpochMs) ? value.createdAtEpochMs : null,
        requestedPayloads,
        providedPayloads,
        payloadLimits,
        payloadTruncated,
        missingPermissions
      };
    }
  
    function normalizeRuntimeMessage(value) {
      if (!value || typeof value !== "object") {
        return null;
      }
  
      const fromKitId = safeText(value.fromKitId);
      if (!fromKitId) {
        return null;
      }
  
      const channel = safeText(value.channel);
      const fromSurface = safeText(value.fromSurface) || null;
      const sentAtEpochMs = Number.isFinite(value.sentAtEpochMs) ? value.sentAtEpochMs : null;
  
      return {
        fromKitId,
        fromSurface,
        channel: channel || null,
        data: value.data ?? null,
        sentAtEpochMs
      };
    }
  
    function pickStorageValues(storageSnapshot, keys) {
      const result = {};
      keys.forEach((key) => {
        if (!key) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(storageSnapshot, key)) {
          result[key] = storageSnapshot[key];
        }
      });
      return result;
    }
  
    function notifyStorageWatchers(changedKeys, envelope) {
      if (!storageWatchers.size) {
        return;
      }
  
      const storageSnapshot =
        state.storage && typeof state.storage === "object" ? state.storage : {};
      const normalizedChangedKeys = Array.isArray(changedKeys)
        ? changedKeys.map((entry) => safeText(entry)).filter(Boolean)
        : [];
  
      storageWatchers.forEach((watcher) => {
        const keys = watcher?.keys;
        if (keys instanceof Set && normalizedChangedKeys.length > 0) {
          let matches = false;
          for (const key of normalizedChangedKeys) {
            if (keys.has(key)) {
              matches = true;
              break;
            }
          }
          if (!matches) {
            return;
          }
        }
  
        try {
          watcher.handler({
            values: keys instanceof Set ? pickStorageValues(storageSnapshot, keys) : { ...storageSnapshot },
            storage: storageSnapshot,
            changedKeys: normalizedChangedKeys,
            envelope: envelope ?? null
          });
        } catch (_error) {
          // Ignore watcher failures.
        }
      });
    }
  
    function normalizeTaskRecord(value) {
      if (!value || typeof value !== "object") {
        return null;
      }
  
      const taskId = safeText(value.taskId);
      if (!taskId) {
        return null;
      }
  
      const seq = Number.isFinite(value.seq) ? value.seq : 0;
      const status = safeText(value.status);
      const kind = safeText(value.kind);
  
      return {
        ...value,
        taskId,
        seq,
        status,
        kind
      };
    }
  
    function mergeTaskUpdate(record) {
      const normalized = normalizeTaskRecord(record);
      if (!normalized) {
        return null;
      }
  
      const tasks = state.tasks && typeof state.tasks === "object" ? state.tasks : null;
      const existing = tasks?.byId?.[normalized.taskId] ?? null;
      const existingSeq = existing && typeof existing.seq === "number" ? existing.seq : -1;
      if (normalized.seq <= existingSeq) {
        return existing;
      }
  
      const merged = existing && typeof existing === "object" ? { ...existing, ...normalized } : { ...normalized };
      const byId = { ...(tasks?.byId ?? {}), [normalized.taskId]: merged };
      let runningIds = Array.isArray(tasks?.runningIds) ? tasks.runningIds.slice() : [];
      let historyIds = Array.isArray(tasks?.historyIds) ? tasks.historyIds.slice() : [];
  
      const isRunning = TASK_RUNNING_STATUSES.has(merged.status);
      const isTerminal = TASK_TERMINAL_STATUSES.has(merged.status);
      if (isRunning) {
        runningIds = [merged.taskId, ...runningIds.filter((id) => id !== merged.taskId)];
        historyIds = historyIds.filter((id) => id !== merged.taskId);
      } else if (isTerminal) {
        runningIds = runningIds.filter((id) => id !== merged.taskId);
        historyIds = [merged.taskId, ...historyIds.filter((id) => id !== merged.taskId)];
        if (historyIds.length > MAX_TASK_HISTORY) {
          historyIds = historyIds.slice(0, MAX_TASK_HISTORY);
        }
      } else {
        runningIds = runningIds.filter((id) => id !== merged.taskId);
      }
  
      setState({
        tasks: {
          ...(tasks ?? state.tasks),
          byId,
          runningIds,
          historyIds
        }
      });
  
      return merged;
    }
  
    function applyTasksSync(payload, envelope) {
      const running = Array.isArray(payload?.running) ? payload.running : [];
      const history = Array.isArray(payload?.history) ? payload.history : [];
  
      const tasks = state.tasks && typeof state.tasks === "object" ? state.tasks : null;
      const nextById = { ...(tasks?.byId ?? {}) };
      const runningIds = [];
      const historyIds = [];
  
      running.forEach((task) => {
        const normalized = normalizeTaskRecord(task);
        if (!normalized) {
          return;
        }
        const existing = nextById[normalized.taskId];
        const existingSeq = existing && typeof existing.seq === "number" ? existing.seq : -1;
        if (normalized.seq > existingSeq) {
          nextById[normalized.taskId] = existing && typeof existing === "object" ? { ...existing, ...normalized } : { ...normalized };
        }
        runningIds.push(normalized.taskId);
      });
  
      history.forEach((task) => {
        const normalized = normalizeTaskRecord(task);
        if (!normalized) {
          return;
        }
        const existing = nextById[normalized.taskId];
        const existingSeq = existing && typeof existing.seq === "number" ? existing.seq : -1;
        if (normalized.seq > existingSeq) {
          nextById[normalized.taskId] = existing && typeof existing === "object" ? { ...existing, ...normalized } : { ...normalized };
        }
        historyIds.push(normalized.taskId);
      });
  
      setState({
        tasks: {
          ...(tasks ?? state.tasks),
          byId: nextById,
          runningIds,
          historyIds,
          lastSyncAt: safeText(envelope?.timestamp) || new Date().toISOString()
        }
      });
  
      emit("tasks.sync", { running: runningIds.map((id) => nextById[id]).filter(Boolean), history: historyIds.map((id) => nextById[id]).filter(Boolean), envelope });
    }
  
    function normalizeKitRecord(value) {
      if (!value || typeof value !== "object") {
        return null;
      }
  
      const kitId = safeText(value.kitId ?? value.id);
      if (!kitId) {
        return null;
      }
  
      return { ...value, kitId };
    }
  
    function applyKitsSync(payload, envelope) {
      const kits = Array.isArray(payload?.kits) ? payload.kits : [];
      const byId = {};
      const ids = [];
  
      kits.forEach((kit) => {
        const normalized = normalizeKitRecord(kit);
        if (!normalized) {
          return;
        }
        byId[normalized.kitId] = normalized;
        ids.push(normalized.kitId);
      });
  
      const previous = state.kits && typeof state.kits === "object" ? state.kits : null;
      setState({
        kits: {
          ...(previous ?? state.kits),
          byId,
          ids,
          lastSyncAt: safeText(envelope?.timestamp) || new Date().toISOString()
        }
      });
  
      emit("kits.sync", { kits: ids.map((id) => byId[id]).filter(Boolean), byId, ids, envelope });
    }
  
    function applyCatalogSourcesSync(payload, envelope) {
      const sources = Array.isArray(payload?.sources) ? payload.sources : [];
      const previous = state.catalog && typeof state.catalog === "object" ? state.catalog : null;
      setState({
        catalog: {
          ...(previous ?? state.catalog),
          sources,
          lastSyncAt: safeText(envelope?.timestamp) || new Date().toISOString()
        }
      });
      emit("catalog.sources.sync", { sources, envelope });
    }
  
    function applyCatalogSync(payload, envelope) {
      const packages = Array.isArray(payload?.packages) ? payload.packages : [];
      const previous = state.catalog && typeof state.catalog === "object" ? state.catalog : null;
      setState({
        catalog: {
          ...(previous ?? state.catalog),
          packages,
          lastSyncAt: safeText(envelope?.timestamp) || new Date().toISOString()
        }
      });
      emit("catalog.sync", { packages, payload, envelope });
    }
  
    function handleEnvelope(envelope) {
      if (!envelope || envelope.source !== "host-adapter") {
        return;
      }
      setState({ lastHostMessageId: raw.getLastHostMessageId() });
  
      switch (envelope.type) {
        case "bridge.ready.ack": {
          const permissions = normalizePermissionsList(envelope.payload?.grantedPermissions);
          setState({
            sessionId: envelope.payload?.sessionId ?? state.sessionId,
            connected: true,
            permissionsKnown: true,
            permissions,
            hostInfo: envelope.payload?.hostInfo ?? state.hostInfo
          });
          emit("ready", {
            sessionId: envelope.payload?.sessionId ?? null,
            permissions,
            hostInfo: envelope.payload?.hostInfo ?? null,
            envelope
          });
          emit("permissions", { permissions, envelope });
          emit("host", { hostInfo: envelope.payload?.hostInfo ?? null, envelope });
          break;
        }
        case "permissions.sync": {
          const permissions = normalizePermissionsList(envelope.payload?.grantedPermissions);
          setState({ permissionsKnown: true, permissions });
          emit("permissions", { permissions, envelope });
          break;
        }
        case "context.sync": {
          const context = envelope.payload?.context ?? envelope.payload?.requestContext ?? null;
          setState({ context });
          emit("context", { context, envelope });
          break;
        }
        case "candidates.render": {
          const payload = envelope.payload ?? {};
          const requestContext = payload.requestContext ?? payload.context ?? null;
          const result = payload.result ?? null;
          const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
          setState({ candidates: { requestContext, result } });
          emit("candidates", { requestContext, result, candidates, envelope });
          break;
        }
        case "storage.sync": {
          const values = envelope.payload?.values ?? {};
          if (values && typeof values === "object") {
            setState({ storage: { ...(state.storage ?? {}), ...values } });
          }
          emit("storage", { values, envelope });
          notifyStorageWatchers(Object.keys(values ?? {}), envelope);
          break;
        }
        case "kits.sync": {
          applyKitsSync(envelope.payload ?? {}, envelope);
          break;
        }
        case "catalog.sources.sync": {
          applyCatalogSourcesSync(envelope.payload ?? {}, envelope);
          break;
        }
        case "catalog.sync": {
          applyCatalogSync(envelope.payload ?? {}, envelope);
          break;
        }
        case "binding.invoke": {
          const invocation = normalizeBindingInvocation(envelope.payload ?? {});
          if (invocation) {
            setState({ lastInvocation: invocation });
            emit("binding.invoke", { invocation, envelope });
          }
          break;
        }
        case "ai.response": {
          const payload = envelope.payload ?? {};
          setState({ ai: payload });
          emit("ai.response", { result: payload, envelope });
          emit("ai", { result: payload, envelope });
          break;
        }
        case "ai.response.delta": {
          const payload = envelope.payload ?? {};
          const deltaText = typeof payload.deltaText === "string" ? payload.deltaText : typeof payload.delta === "string" ? payload.delta : "";
          emit("ai.delta", { deltaText, payload, envelope });
          break;
        }
        case "runtime.message": {
          const message = normalizeRuntimeMessage(envelope.payload ?? {});
          if (message) {
            setState({ lastMessage: message });
            emit("runtime.message", { message, envelope });
            if (message.channel) {
              emit(`runtime.message.${message.channel}`, { message, envelope });
            }
          }
          break;
        }
        case "task.update": {
          const record = envelope.payload?.task ?? envelope.payload?.taskPatch ?? null;
          const task = mergeTaskUpdate(record);
          if (task) {
            emit("task", { task, envelope });
          }
          break;
        }
        case "tasks.sync": {
          applyTasksSync(envelope.payload ?? {}, envelope);
          break;
        }
        case "task.cancel.ack": {
          emit("task.cancel.ack", { payload: envelope.payload ?? {}, envelope });
          break;
        }
        case "host.state.update": {
          const label = envelope.payload?.label ?? "";
          const details = envelope.payload?.details ?? {};
          emit("host.update", { label, details, envelope });
  
          const intent = normalizeHostIntent(details?.intent);
          if (intent) {
            setState({ lastIntent: intent });
            emit("intent", { intent, envelope });
            emit(`intent.${intent.kind}`, { intent, envelope });
          }
          break;
        }
        case "bridge.error":
        case "permission.denied": {
          const error = normalizeHostError(envelope);
          setState({ lastError: error });
          emit("error", { error, envelope });
          break;
        }
        default:
          break;
      }
  
      emit("envelope", { envelope });
    }
  
    const detach = raw.on("*", handleEnvelope);
  
    return {
      raw,
      get state() {
        return state;
      },
      dispose() {
        detach();
        subscribers.clear();
        storageWatchers.clear();
      },
      subscribe(handler) {
        if (typeof handler !== "function") {
          throw new TypeError("FunctionKitRuntimeSDK.createKit().subscribe(handler) requires a function.");
        }
        subscribers.add(handler);
        handler(state);
        return () => subscribers.delete(handler);
      },
      on: emitter.on,
      hasPermission(permission) {
        return raw.hasPermission(permission);
      },
      runtime: {
        onIntent(kindOrHandler, maybeHandler) {
          const kind = typeof kindOrHandler === "string" ? safeText(kindOrHandler) : "";
          const handler = typeof kindOrHandler === "function" ? kindOrHandler : maybeHandler;
          if (kindOrHandler !== undefined && typeof kindOrHandler !== "function" && typeof kindOrHandler !== "string") {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.onIntent expects (handler) or (kind, handler).");
          }
          if (typeof kindOrHandler === "string" && !kind) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.onIntent(kind, handler) requires a non-empty kind.");
          }
          if (typeof handler !== "function") {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.onIntent(...) requires a function handler.");
          }
          return kind ? emitter.on(`intent.${kind}`, handler) : emitter.on("intent", handler);
        },
        onMessage(channelOrHandler, maybeHandler) {
          const channel = typeof channelOrHandler === "string" ? safeText(channelOrHandler) : "";
          const handler = typeof channelOrHandler === "function" ? channelOrHandler : maybeHandler;
          if (
            channelOrHandler !== undefined &&
            typeof channelOrHandler !== "function" &&
            typeof channelOrHandler !== "string"
          ) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.onMessage expects (handler) or (channel, handler).");
          }
          if (typeof channelOrHandler === "string" && !channel) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.onMessage(channel, handler) requires a non-empty channel.");
          }
          if (typeof handler !== "function") {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.onMessage(...) requires a function handler.");
          }
          return channel ? emitter.on(`runtime.message.${channel}`, handler) : emitter.on("runtime.message", handler);
        },
        async sendMessage(options = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          const toKitId = safeText(normalized.toKitId);
          if (!toKitId) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().runtime.sendMessage requires toKitId.");
          }
  
          const requestOptions = withDefaultReplyTo(normalized);
          try {
            const envelope = await raw.runtime.sendMessage({ ...normalized, ...requestOptions, toKitId });
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit runtime.sendMessage failed.");
          }
        }
      },
      bindings: {
        onInvoke(handler) {
          if (typeof handler !== "function") {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().bindings.onInvoke(handler) requires a function.");
          }
          return emitter.on("binding.invoke", handler);
        }
      },
      app: {
        getActivePackageName() {
          const ctx = state.context;
          if (!ctx || typeof ctx !== "object") {
            return null;
          }
          const pkg = ctx.sourcePackage ?? ctx.packageName;
          return typeof pkg === "string" && pkg.trim() ? pkg.trim() : null;
        },
        getSelection() {
          const ctx = state.context;
          if (!ctx || typeof ctx !== "object") {
            return null;
          }
          const start = ctx.selectionStart;
          const end = ctx.selectionEnd;
          const text = ctx.selectedText;
          const hasStart = typeof start === "number" && Number.isFinite(start);
          const hasEnd = typeof end === "number" && Number.isFinite(end);
          const hasText = typeof text === "string";
          if (!hasStart && !hasEnd && !hasText) {
            return null;
          }
          return {
            start: hasStart ? start : null,
            end: hasEnd ? end : null,
            text: hasText ? text : null
          };
        }
      },
      async connect(extra = {}) {
        const timeoutMs =
          Number.isFinite(connectOptions.timeoutMs) && connectOptions.timeoutMs > 0
            ? connectOptions.timeoutMs
            : 20000;
        const retries =
          Number.isFinite(connectOptions.retries) && connectOptions.retries >= 0 ? connectOptions.retries : 3;
        const baseDelayMs =
          Number.isFinite(connectOptions.retryDelayMs) && connectOptions.retryDelayMs > 0
            ? connectOptions.retryDelayMs
            : 400;
  
        const payload = {
          ...(extra && typeof extra === "object" ? extra : {}),
          timeoutMs
        };
  
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            const envelope = await raw.runtime.connect(payload);
            return {
              sessionId: envelope.payload?.sessionId ?? null,
              permissions: normalizePermissionsList(envelope.payload?.grantedPermissions),
              hostInfo: envelope.payload?.hostInfo ?? null,
              envelope
            };
          } catch (error) {
            if (attempt >= retries) {
              throw normalizeHostError(error, "Function Kit handshake failed.");
            }
            await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
          }
        }
  
        throw new Error("FunctionKitRuntimeSDK.createKit.connect reached an unreachable code path.");
      },
      fetch(url, init = {}) {
        const requestOptions = withDefaultReplyTo(init);
        return raw
          .fetch(url, { ...(init && typeof init === "object" ? init : {}), ...requestOptions })
          .then((envelope) => envelope.payload?.response ?? envelope.payload ?? envelope)
          .catch((error) => {
            throw normalizeHostError(error, "Function Kit fetch failed.");
          });
      },
      context: {
        async refresh(payload = {}, extra = {}) {
          try {
            const envelope = await raw.context.requestSnapshot(payload, withDefaultReplyTo(extra));
            return envelope.payload?.context ?? envelope.payload?.requestContext ?? null;
          } catch (error) {
            throw normalizeHostError(error, "Function Kit context refresh failed.");
          }
        }
      },
      candidates: {
        regenerate(payload = {}, extra = {}) {
          return raw.candidates.regenerate(payload, withDefaultReplyTo(extra));
        }
      },
      storage: {
        async get(keys = [], extra = {}) {
          try {
            const envelope = await raw.storage.get(keys, withDefaultReplyTo(extra));
            return envelope.payload?.values ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit storage.get failed.");
          }
        },
        async set(values = {}, extra = {}) {
          try {
            const envelope = await raw.storage.set(values, withDefaultReplyTo(extra));
            return envelope.payload?.values ?? values;
          } catch (error) {
            throw normalizeHostError(error, "Function Kit storage.set failed.");
          }
        },
        watch(keys, handler, options = {}) {
          if (typeof handler !== "function") {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().storage.watch(keys, handler) requires a function handler.");
          }
  
          const normalizedKeys =
            typeof keys === "string"
              ? [safeText(keys)].filter(Boolean)
              : Array.isArray(keys)
                ? keys.map((entry) => safeText(entry)).filter(Boolean)
                : null;
          if (normalizedKeys && normalizedKeys.length === 0) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().storage.watch(keys, handler) requires at least one key.");
          }
  
          const watcher = {
            keys: normalizedKeys ? new Set(normalizedKeys) : null,
            handler
          };
          storageWatchers.add(watcher);
  
          if (!options || options.immediate !== false) {
            const storageSnapshot =
              state.storage && typeof state.storage === "object" ? state.storage : {};
            try {
              handler({
                values: watcher.keys ? pickStorageValues(storageSnapshot, watcher.keys) : { ...storageSnapshot },
                storage: storageSnapshot,
                changedKeys: [],
                envelope: null
              });
            } catch (_error) {
              // Ignore watcher failures.
            }
          }
  
          return () => storageWatchers.delete(watcher);
        }
      },
      files: {
        async pick(options = {}, extra = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          try {
            const envelope = await raw.files.pick(normalized, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit files.pick failed.");
          }
        },
        async download(options = {}, extra = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          try {
            const envelope = await raw.files.download(normalized, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit files.download failed.");
          }
        },
        async getUrl(options = {}, extra = {}) {
          const normalized =
            typeof options === "string"
              ? { fileId: options }
              : options && typeof options === "object"
                ? { ...options }
                : {};
          const fileId = safeText(normalized.fileId);
          if (!fileId) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().files.getUrl requires fileId.");
          }
          try {
            const envelope = await raw.files.getUrl({ ...normalized, fileId }, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit files.getUrl failed.");
          }
        }
      },
      input: {
        insert(payload = {}, extra = {}) {
          const normalized = typeof payload === "string" ? { text: payload } : payload;
          return raw.input.insertText(normalized, withDefaultReplyTo(extra));
        },
        replace(payload = {}, extra = {}) {
          const normalized = typeof payload === "string" ? { text: payload } : payload;
          return raw.input.replaceText(normalized, withDefaultReplyTo(extra));
        },
        commitImage(payload = {}, extra = {}) {
          const normalized = typeof payload === "string" ? { dataUrl: payload } : payload;
          return raw.input.commitImage(normalized, withDefaultReplyTo(extra));
        },
        async observeBestEffort(options = {}, extra = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          const requestOptions = withDefaultReplyTo(extra);
          try {
            await raw.input.observeBestEffortStart(normalized, requestOptions);
          } catch (error) {
            throw normalizeHostError(error, "Function Kit input.observeBestEffort failed.");
          }
  
          return async () => {
            try {
              await raw.input.observeBestEffortStop({}, requestOptions);
            } catch (error) {
              throw normalizeHostError(error, "Function Kit input.observeBestEffort.stop failed.");
            }
          };
        },
        async observe(options = {}, extra = {}) {
          return this.observeBestEffort(options, extra);
        }
      },
      send: {
        async registerImeActionInterceptor(options = {}, extra = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          try {
            const envelope = await raw.sendIntercept.registerImeAction(normalized, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit send.registerImeActionInterceptor failed.");
          }
        },
        async unregisterImeActionInterceptor(options = {}, extra = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          try {
            const envelope = await raw.sendIntercept.unregisterImeAction(normalized, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit send.unregisterImeActionInterceptor failed.");
          }
        },
        onImeActionIntent(handler) {
          if (typeof handler !== "function") {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().send.onImeActionIntent(handler) requires a function.");
          }
  
          return raw.on("send.intercept.ime_action.intent", async (envelope) => {
            const payload = envelope?.payload && typeof envelope.payload === "object" ? envelope.payload : {};
            const event = {
              intent: payload.intent ?? null,
              context: payload.context ?? null,
              envelope
            };
  
            let allow = true;
            try {
              const result = await handler(event);
              if (typeof result === "boolean") {
                allow = result;
              } else if (result && typeof result === "object" && typeof result.allow === "boolean") {
                allow = result.allow;
              }
            } catch (_error) {
              allow = true;
            }
  
            raw.send("send.intercept.ime_action.result", { allow }, { replyTo: envelope?.messageId });
          });
        }
      },
      settings: {
        open(payload = {}, extra = {}) {
          return raw.settings.open(payload, withDefaultReplyTo(extra));
        }
      },
      panel: {
        updateState(patch = {}, extra = {}) {
          return raw.panel.updateState(patch, withDefaultReplyTo(extra)).catch((error) => {
            throw normalizeHostError(error, "Function Kit panel.updateState failed.");
          });
        }
      },
      tasks: {
        get(taskId) {
          const id = safeText(taskId);
          if (!id) {
            return null;
          }
          return state.tasks?.byId?.[id] ?? null;
        },
        listRunning() {
          const tasks = state.tasks;
          const ids = Array.isArray(tasks?.runningIds) ? tasks.runningIds : [];
          return ids.map((id) => tasks.byId?.[id]).filter(Boolean);
        },
        listHistory() {
          const tasks = state.tasks;
          const ids = Array.isArray(tasks?.historyIds) ? tasks.historyIds : [];
          return ids.map((id) => tasks.byId?.[id]).filter(Boolean);
        },
        async sync(options = {}, extra = {}) {
          const requestOptions = withDefaultReplyTo(extra);
          try {
            const envelope = await raw.tasks.sync(
              { includeHistory: true, historyLimit: 30, ...(options && typeof options === "object" ? options : {}) },
              requestOptions
            );
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit tasks.sync failed.");
          }
        },
        async cancel(options = {}, extra = {}) {
          const requestOptions = withDefaultReplyTo(extra);
          const normalized =
            typeof options === "string"
              ? { taskId: options }
              : options && typeof options === "object"
                ? { ...options }
                : {};
  
          const taskId = safeText(normalized.taskId);
          if (!taskId) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().tasks.cancel requires taskId.");
          }
  
          try {
            const envelope = await raw.tasks.cancel({ ...normalized, taskId }, requestOptions);
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit tasks.cancel failed.");
          }
        }
      },
      kits: {
        get(kitId) {
          const id = safeText(kitId);
          if (!id) {
            return null;
          }
          return state.kits?.byId?.[id] ?? null;
        },
        list() {
          const kits = state.kits;
          const ids = Array.isArray(kits?.ids) ? kits.ids : [];
          return ids.map((id) => kits.byId?.[id]).filter(Boolean);
        },
        async sync(options = {}, extra = {}) {
          try {
            const envelope = await raw.kits.sync(options, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit kits.sync failed.");
          }
        },
        async open(options = {}, extra = {}) {
          const normalized =
            typeof options === "string"
              ? { kitId: options }
              : options && typeof options === "object"
                ? { ...options }
                : {};
  
          const kitId = safeText(normalized.kitId);
          if (!kitId) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().kits.open requires kitId.");
          }
  
          try {
            const envelope = await raw.kits.open({ ...normalized, kitId }, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit kits.open failed.");
          }
        },
        async install(options = {}, extra = {}) {
          try {
            const envelope = await raw.kits.install(options, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit kits.install failed.");
          }
        },
        async uninstall(options = {}, extra = {}) {
          const normalized =
            typeof options === "string"
              ? { kitId: options }
              : options && typeof options === "object"
                ? { ...options }
                : {};
  
          const kitId = safeText(normalized.kitId);
          if (!kitId) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().kits.uninstall requires kitId.");
          }
  
          try {
            const envelope = await raw.kits.uninstall({ ...normalized, kitId }, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit kits.uninstall failed.");
          }
        },
        async updateSettings(options = {}, extra = {}) {
          const normalized =
            options && typeof options === "object"
              ? { ...options }
              : {};
  
          const kitId = safeText(normalized.kitId);
          if (!kitId) {
            throw new TypeError("FunctionKitRuntimeSDK.createKit().kits.updateSettings requires kitId.");
          }
  
          try {
            const envelope = await raw.kits.updateSettings({ ...normalized, kitId }, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit kits.updateSettings failed.");
          }
        }
      },
      catalog: {
        async getSources(options = {}, extra = {}) {
          try {
            const envelope = await raw.catalog.getSources(options, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit catalog.getSources failed.");
          }
        },
        async setSources(options = {}, extra = {}) {
          try {
            const envelope = await raw.catalog.setSources(options, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit catalog.setSources failed.");
          }
        },
        async refresh(options = {}, extra = {}) {
          try {
            const envelope = await raw.catalog.refresh(options, withDefaultReplyTo(extra));
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit catalog.refresh failed.");
          }
        }
      },
      ai: {
        async request(options = {}) {
          const normalized = options && typeof options === "object" ? { ...options } : {};
          const requestId = safeText(normalized.requestId);
          if (!requestId) {
            normalized.requestId = nextMessageId("ai-request");
          }
  
          const requestOptions = withDefaultReplyTo(normalized);
          try {
            const envelope = await raw.ai.request({ ...normalized, ...requestOptions });
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit ai.request failed.");
          }
        },
        async listAgents(filter = {}) {
          const requestOptions = withDefaultReplyTo(filter);
          try {
            const envelope = await raw.ai.listAgents({
              ...(filter && typeof filter === "object" ? filter : {}),
              ...requestOptions
            });
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit ai.agent.list failed.");
          }
        },
        async runAgent(options = {}) {
          const requestOptions = withDefaultReplyTo(options);
          try {
            const envelope = await raw.ai.runAgent({
              ...(options && typeof options === "object" ? options : {}),
              ...requestOptions
            });
            return envelope.payload ?? {};
          } catch (error) {
            throw normalizeHostError(error, "Function Kit ai.agent.run failed.");
          }
        }
      }
    };
  }
  
  const FunctionKitRuntimeSDK = {
    PROTOCOL_VERSION,
    createKit,
    preview,
    discovery: {
      DEFAULT_DISCOVERY_RANKING,
      SUPPORTED_DISCOVERY_LAUNCH_MODES,
      buildDiscoveryIndex,
      matchDiscoveryEntries,
      normalizeDiscoveryManifest,
      normalizeSlashQuery,
      parseSlashTrigger,
      rankDiscoveryMatches,
      resolveDiscoveryQuery
    }
  };

  globalObject.FunctionKitRuntimeSDK = FunctionKitRuntimeSDK;
})(globalThis);
