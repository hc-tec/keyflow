export type DiscoveryLaunchMode = "quick-action" | "panel-first" | "hybrid";

export interface SlashMatcherConfig {
  type: "regex";
  pattern: string;
  weight?: number;
}

export interface SlashDiscoveryConfig {
  enabled?: boolean;
  commands?: string[];
  aliases?: string[];
  tags?: string[];
  minQueryLength?: number;
  matchers?: SlashMatcherConfig[];
}

export interface DiscoveryRankingConfig {
  baseWeight?: number;
  recentBoost?: number;
  pinnedBoost?: number;
  contextBoost?: number;
  blockedPenalty?: number;
}

export interface DiscoveryConfig {
  pinnable?: boolean;
  recentEnabled?: boolean;
  launchMode?: DiscoveryLaunchMode;
  slash?: SlashDiscoveryConfig;
  ranking?: DiscoveryRankingConfig;
}

export interface FunctionKitManifestLike {
  id?: string;
  name?: string;
  description?: string;
  runtimePermissions?: string[];
  triggers?: {
    manual?: boolean;
    selectionRequired?: boolean;
    contextTypes?: string[];
  };
  discovery?: DiscoveryConfig;
}

export interface SlashTriggerToken {
  active: true;
  mode: "slash-detecting" | "slash-searching";
  raw: string;
  query: string;
  tokenStart: number;
  tokenEnd: number;
  replacementRange: {
    start: number;
    end: number;
  };
}

export interface NormalizedSlashMatcher {
  type: "regex";
  pattern: string;
  weight: number;
}

export interface NormalizedDiscoveryManifest {
  id: string;
  name: string;
  description: string;
  runtimePermissions: string[];
  triggers: {
    manual: boolean;
    selectionRequired: boolean;
    contextTypes: string[];
  };
  discovery: {
    pinnable: boolean;
    recentEnabled: boolean;
    launchMode: DiscoveryLaunchMode;
    slash: {
      enabled: boolean;
      commands: string[];
      aliases: string[];
      tags: string[];
      minQueryLength: number;
      matchers: NormalizedSlashMatcher[];
    };
    ranking: Required<DiscoveryRankingConfig>;
  };
}

export interface DiscoveryEntry extends NormalizedDiscoveryManifest {
  order: number;
}

export interface DiscoveryMatchReason {
  kind:
    | "browse"
    | "command-exact"
    | "alias-exact"
    | "command-prefix"
    | "alias-prefix"
    | "tag-exact"
    | "tag-prefix"
    | "regex"
    | "name-substring"
    | "description-substring";
  matchedValue: string;
  score: number;
}

export interface DiscoveryMatch extends DiscoveryEntry {
  query: string;
  score: number;
  available: boolean;
  blockedPermissions: string[];
  match: DiscoveryMatchReason;
}

export interface SlashTriggerParseOptions {
  caretIndex?: number;
}

export interface DiscoveryMatchOptions {
  contextType?: string;
  contextTypes?: string[];
  recentKitIds?: string[];
  pinnedKitIds?: string[];
  availablePermissions?: string[];
}

export declare const DEFAULT_DISCOVERY_RANKING: Readonly<Required<DiscoveryRankingConfig>>;
export declare const SUPPORTED_DISCOVERY_LAUNCH_MODES: Readonly<DiscoveryLaunchMode[]>;

export declare function normalizeSlashQuery(value: unknown): string;
export declare function parseSlashTrigger(
  text: unknown,
  options?: SlashTriggerParseOptions
): SlashTriggerToken | null;
export declare function normalizeDiscoveryManifest(
  manifest?: FunctionKitManifestLike
): NormalizedDiscoveryManifest;
export declare function buildDiscoveryIndex(manifests?: FunctionKitManifestLike[]): DiscoveryEntry[];
export declare function rankDiscoveryMatches(matches?: DiscoveryMatch[]): DiscoveryMatch[];
export declare function matchDiscoveryEntries(
  entries?: DiscoveryEntry[],
  queryOrToken?: string | Pick<SlashTriggerToken, "query"> | null,
  options?: DiscoveryMatchOptions
): DiscoveryMatch[];
export declare function resolveDiscoveryQuery(
  manifests?: FunctionKitManifestLike[],
  text?: string | SlashTriggerToken | null,
  options?: DiscoveryMatchOptions & SlashTriggerParseOptions
): {
  token: SlashTriggerToken | null;
  matches: DiscoveryMatch[];
};
