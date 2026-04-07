const DEFAULT_SEPARATOR_PATTERN = /[\s()[\]{}"'`.,!?;:<>|\\]/;
const DEFAULT_COMMAND_CHAR_PATTERN = /^[a-z0-9_-]$/i;

export const DEFAULT_DISCOVERY_RANKING = Object.freeze({
  baseWeight: 1,
  recentBoost: 0.4,
  pinnedBoost: 0.2,
  contextBoost: 0.3,
  blockedPenalty: 0.6
});

export const SUPPORTED_DISCOVERY_LAUNCH_MODES = Object.freeze([
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

export function normalizeSlashQuery(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/^\/+/, "").toLowerCase();
}

export function parseSlashTrigger(text, options = {}) {
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

export function normalizeDiscoveryManifest(manifest = {}) {
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

export function buildDiscoveryIndex(manifests = []) {
  return manifests
    .map((manifest, order) => ({
      ...normalizeDiscoveryManifest(manifest),
      order
    }))
    .filter((entry) => entry.id && entry.name);
}

export function rankDiscoveryMatches(matches = []) {
  return [...matches].sort(compareMatches);
}

export function matchDiscoveryEntries(entries = [], queryOrToken = "", options = {}) {
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

export function resolveDiscoveryQuery(manifests = [], text, options = {}) {
  const parsedToken = typeof text === "string" ? parseSlashTrigger(text, options) : text;
  const index = buildDiscoveryIndex(manifests);

  return {
    token: parsedToken,
    matches: matchDiscoveryEntries(index, parsedToken, options)
  };
}
