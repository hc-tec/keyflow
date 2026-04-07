export type FunctionKitSurface = "inline" | "panel" | "editor";

export type RuntimePermission =
  | "context.read"
  | "input.insert"
  | "input.replace"
  | "input.commitImage"
  | "input.observe.best_effort"
  | "candidates.regenerate"
  | "settings.open"
  | "storage.read"
  | "storage.write"
  | "files.pick"
  | "files.download"
  | "panel.state.write"
  | "runtime.message.send"
  | "runtime.message.receive"
  | "network.fetch"
  | "ai.request"
  | "kits.manage"
  | "send.intercept.ime_action"
  | "ai.agent.list"
  | "ai.agent.run"
  | (string & {});

export type RuntimeMessageType =
  | "bridge.ready"
  | "bridge.ready.ack"
  | "binding.invoke"
  | "context.request"
  | "context.sync"
  | "candidates.render"
  | "candidate.insert"
  | "candidate.replace"
  | "input.commitImage"
  | "input.observe.best_effort.start"
  | "input.observe.best_effort.stop"
  | "input.observe.best_effort.ack"
  | "candidates.regenerate"
  | "settings.open"
  | "storage.get"
  | "storage.set"
  | "storage.sync"
  | "panel.state.update"
  | "panel.state.ack"
  | "task.update"
  | "tasks.sync.request"
  | "tasks.sync"
  | "task.cancel"
  | "task.cancel.ack"
  | "permissions.sync"
  | "permission.denied"
  | "host.state.update"
  | "runtime.message.send"
  | "runtime.message.send.ack"
  | "runtime.message"
  | "bridge.error"
  | "network.fetch"
  | "network.fetch.result"
  | "files.pick"
  | "files.pick.result"
  | "files.download"
  | "files.download.result"
  | "files.getUrl"
  | "files.getUrl.result"
  | "ai.request"
  | "ai.response"
  | "ai.response.delta"
  | "ai.agent.list"
  | "ai.agent.list.result"
  | "ai.agent.run"
  | "ai.agent.run.result"
  | "kits.sync.request"
  | "kits.sync"
  | "kits.open"
  | "kits.open.result"
  | "kits.install"
  | "kits.install.result"
  | "kits.uninstall"
  | "kits.uninstall.result"
  | "kits.settings.update"
  | "kits.settings.update.result"
  | "catalog.sources.get"
  | "catalog.sources.set"
  | "catalog.sources.sync"
  | "catalog.refresh"
  | "catalog.sync"
  | "send.intercept.ime_action.register"
  | "send.intercept.ime_action.unregister"
  | "send.intercept.ime_action.ack"
  | "send.intercept.ime_action.intent"
  | "send.intercept.ime_action.result"
  | (string & {});

export {
  DEFAULT_DISCOVERY_RANKING,
  SUPPORTED_DISCOVERY_LAUNCH_MODES,
  buildDiscoveryIndex,
  matchDiscoveryEntries,
  normalizeDiscoveryManifest,
  normalizeSlashQuery,
  parseSlashTrigger,
  rankDiscoveryMatches,
  resolveDiscoveryQuery
} from "./discovery";

export interface RuntimeEnvelope {
  version: "1.0.0";
  messageId: string;
  timestamp: string;
  kitId: string;
  surface: FunctionKitSurface;
  source: "host-adapter" | "function-kit-ui";
  target: "host-adapter" | "function-kit-ui";
  type: RuntimeMessageType;
  payload: Record<string, unknown>;
  replyTo?: string;
}

export interface CreateClientOptions {
  kitId: string;
  surface?: FunctionKitSurface;
  debug?: boolean;
  requestTimeoutMs?: number;
  inputBridge?: { autoBind?: boolean };
}

export interface ConnectOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export interface PreviewHostOptions {
  grantAll?: boolean;
  executionMode?: string;
  permissions?: string[];
  runtimePermissions?: string[];
  grantedPermissions?: string[];
  context?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  kits?: any[];
  catalogSources?: any[];
  catalogPackages?: any[];
  candidatesGenerator?: (input: {
    seed: number;
    preferredTone: string;
    modifiers: string[];
    context: Record<string, unknown>;
  }) => Array<Record<string, unknown>>;
  aiRequestHandler?: (input: { envelope: RuntimeEnvelope; context: Record<string, unknown> }) => {
    text?: string;
    structured?: Record<string, unknown>;
    usage?: Record<string, unknown>;
  };
}

export interface RequestOptions {
  replyTo?: string;
  signal?: AbortSignal | null;
  timeoutMs?: number;
}

export interface SendOptions {
  replyTo?: string;
}

export type RuntimeHeadersInit =
  | Record<string, string | number | boolean>
  | Array<[string, string | number | boolean]>
  | Iterable<[string, string | number | boolean]>;

export interface FunctionKitFetchInit extends RequestOptions {
  method?: string;
  headers?: RuntimeHeadersInit;
  body?: unknown;
  [key: string]: unknown;
}

export interface RuntimeApi {
  connect(extra?: Record<string, unknown>): Promise<RuntimeEnvelope>;
  sendMessage(payload?: Record<string, unknown>): Promise<RuntimeEnvelope>;
}

export interface ContextApi {
  requestSnapshot(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
}

export interface InputApi {
  insertText(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
  replaceText(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
  commitImage(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
  observeBestEffortStart(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  observeBestEffortStop(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
}

export interface CandidatesApi {
  regenerate(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
}

export interface AiRequestOptions extends RequestOptions {
  requestId?: string;
  route?: unknown;
  [key: string]: unknown;
}

export interface AiAgentFilter extends RequestOptions {
  [key: string]: unknown;
}

export interface AiRunAgentOptions extends RequestOptions {
  [key: string]: unknown;
}

export interface AiApi {
  request(options?: AiRequestOptions): Promise<RuntimeEnvelope>;
  listAgents(filter?: AiAgentFilter): Promise<RuntimeEnvelope>;
  runAgent(options?: AiRunAgentOptions): Promise<RuntimeEnvelope>;
}

export interface SettingsApi {
  open(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
}

export interface StorageApi {
  get(keys: string[], extra?: RequestOptions): Promise<RuntimeEnvelope>;
  set(values: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
}

export interface PanelApi {
  updateState(patch: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
}

export interface TasksApi {
  sync(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  cancel(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
}

export interface FunctionKitClient {
  protocolVersion: "1.0.0";
  on(type: string, handler: (envelope: RuntimeEnvelope) => void): () => void;
  send(type: string, payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
  fetch(url: string | URL, init?: FunctionKitFetchInit): Promise<RuntimeEnvelope>;
  getLastHostMessageId(): string | null;
  hasPermission(permission: RuntimePermission | string): boolean;
  runtime: RuntimeApi;
  context: ContextApi;
  input: InputApi;
  sendIntercept: {
    registerImeAction(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    unregisterImeAction(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  };
  candidates: CandidatesApi;
  ai: AiApi;
  settings: SettingsApi;
  storage: StorageApi;
  files: {
    pick(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    download(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    getUrl(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  };
  kits: {
    sync(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    open(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    install(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    uninstall(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    updateSettings(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  };
  catalog: {
    getSources(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    setSources(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
    refresh(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  };
  panel: PanelApi;
  tasks: TasksApi;
}

export declare function createClient(options: CreateClientOptions): FunctionKitClient;

export interface FunctionKitHostError extends Error {
  code?: string;
  retryable?: boolean;
  details?: unknown;
  envelope?: RuntimeEnvelope | null;
}

export interface FunctionKitHostIntent {
  kind: string;
  [key: string]: unknown;
}

export interface FunctionKitRuntimeMessage {
  fromKitId: string;
  fromSurface: FunctionKitSurface | string | null;
  channel: string | null;
  data: any;
  sentAtEpochMs: number | null;
}

export type FunctionKitBindingRequestedPayload = "selection.text" | "selection.beforeCursor" | "selection.afterCursor" | "clipboard.text";

export interface FunctionKitBindingPayloadLimits {
  cursorContextChars: number | null;
  selectionTextMaxChars: number | null;
  clipboardTextMaxChars: number | null;
}

export interface FunctionKitBindingInvocation {
  invocationId: string | null;
  trigger: string | null;
  binding: {
    id: string | null;
    title: string | null;
    preferredPresentation: string | null;
    categories: string[] | null;
    entry: any;
  };
  context: any;
  clipboardText: string | null;
  createdAtEpochMs: number | null;
  requestedPayloads: FunctionKitBindingRequestedPayload[] | null;
  providedPayloads: FunctionKitBindingRequestedPayload[] | null;
  payloadLimits: FunctionKitBindingPayloadLimits | null;
  payloadTruncated: boolean | null;
  missingPermissions: string[] | null;
}

export interface FunctionKitStateSnapshot {
  kitId: string;
  surface: FunctionKitSurface;
  sessionId: string | null;
  connected: boolean;
  permissions: string[];
  permissionsKnown: boolean;
  hostInfo: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  candidates: { requestContext: unknown; result: unknown } | null;
  storage: Record<string, unknown> | null;
  ai: Record<string, unknown> | null;
  tasks: {
    byId: Record<string, Record<string, unknown>>;
    runningIds: string[];
    historyIds: string[];
    lastSyncAt: string | null;
  };
  kits: {
    byId: Record<string, any>;
    ids: string[];
    lastSyncAt: string | null;
  };
  catalog: {
    sources: any[];
    packages: any[];
    lastSyncAt: string | null;
  };
  lastHostMessageId: string | null;
  lastInvocation: FunctionKitBindingInvocation | null;
  lastIntent: FunctionKitHostIntent | null;
  lastMessage: FunctionKitRuntimeMessage | null;
  lastError: FunctionKitHostError | null;
}

export interface CreateKitOptions extends CreateClientOptions {
  connect?: ConnectOptions;
  preview?: PreviewHostOptions;
}

export interface FunctionKit {
  raw: FunctionKitClient;
  readonly state: FunctionKitStateSnapshot;
  dispose(): void;
  subscribe(handler: (state: FunctionKitStateSnapshot) => void): () => void;
  on(type: string, handler: (payload: any) => void): () => void;
  hasPermission(permission: RuntimePermission | string): boolean;
  runtime: {
    onIntent(handler: (event: { intent: FunctionKitHostIntent; envelope: RuntimeEnvelope }) => void): () => void;
    onIntent(kind: string, handler: (event: { intent: FunctionKitHostIntent; envelope: RuntimeEnvelope }) => void): () => void;
    onMessage(handler: (event: { message: FunctionKitRuntimeMessage; envelope: RuntimeEnvelope }) => void): () => void;
    onMessage(channel: string, handler: (event: { message: FunctionKitRuntimeMessage; envelope: RuntimeEnvelope }) => void): () => void;
    sendMessage(options: { toKitId: string; channel?: string; data?: any; toSurface?: FunctionKitSurface | string }): Promise<
      Record<string, unknown>
    >;
  };
  bindings: {
    onInvoke(handler: (event: { invocation: FunctionKitBindingInvocation; envelope: RuntimeEnvelope }) => void): () => void;
  };
  app: {
    getActivePackageName(): string | null;
    getSelection(): { start: number | null; end: number | null; text: string | null } | null;
  };
  connect(extra?: Record<string, unknown>): Promise<{
    sessionId: string | null;
    permissions: string[];
    hostInfo: Record<string, unknown> | null;
    envelope: RuntimeEnvelope;
  }>;
  fetch(url: string | URL, init?: FunctionKitFetchInit): Promise<any>;
  context: {
    refresh(payload?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown> | null>;
  };
  candidates: {
    regenerate(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
  };
  storage: {
    get(keys: string[], extra?: RequestOptions): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    watch(
      keys: string[] | string | null,
      handler: (event: {
        values: Record<string, unknown>;
        storage: Record<string, unknown>;
        changedKeys: string[];
        envelope: RuntimeEnvelope | null;
      }) => void,
      options?: { immediate?: boolean }
    ): () => void;
  };
  files: {
    pick(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    download(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    getUrl(options?: Record<string, unknown> | string, extra?: RequestOptions): Promise<Record<string, unknown>>;
  };
  input: {
    insert(payload: Record<string, unknown> | string, extra?: SendOptions): RuntimeEnvelope;
    replace(payload: Record<string, unknown> | string, extra?: SendOptions): RuntimeEnvelope;
    commitImage(payload: Record<string, unknown> | string, extra?: SendOptions): RuntimeEnvelope;
    observeBestEffort(options?: Record<string, unknown>, extra?: RequestOptions): Promise<() => Promise<void>>;
    observe(options?: Record<string, unknown>, extra?: RequestOptions): Promise<() => Promise<void>>;
  };
  send: {
    registerImeActionInterceptor(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    unregisterImeActionInterceptor(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    onImeActionIntent(handler: (event: {
      intent: any;
      context: any;
      envelope: RuntimeEnvelope;
    }) => boolean | { allow: boolean } | Promise<boolean | { allow: boolean }>): () => void;
  };
  settings: {
    open(payload?: Record<string, unknown>, extra?: SendOptions): RuntimeEnvelope;
  };
  panel: {
    updateState(patch: Record<string, unknown>, extra?: RequestOptions): Promise<RuntimeEnvelope>;
  };
  tasks: {
    get(taskId: string): Record<string, unknown> | null;
    listRunning(): Array<Record<string, unknown>>;
    listHistory(): Array<Record<string, unknown>>;
    sync(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    cancel(options: { taskId: string; reason?: string } | string, extra?: RequestOptions): Promise<Record<string, unknown>>;
  };
  kits: {
    get(kitId: string): Record<string, unknown> | null;
    list(): Array<Record<string, unknown>>;
    sync(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    open(options: { kitId: string; [key: string]: unknown } | string, extra?: RequestOptions): Promise<Record<string, unknown>>;
    install(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    uninstall(options: { kitId: string; [key: string]: unknown } | string, extra?: RequestOptions): Promise<Record<string, unknown>>;
    updateSettings(options: { kitId: string; [key: string]: unknown }, extra?: RequestOptions): Promise<Record<string, unknown>>;
  };
  catalog: {
    getSources(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    setSources(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
    refresh(options?: Record<string, unknown>, extra?: RequestOptions): Promise<Record<string, unknown>>;
  };
  ai: {
    request(options?: AiRequestOptions): Promise<Record<string, unknown>>;
    listAgents(filter?: AiAgentFilter): Promise<Record<string, unknown>>;
    runAgent(options?: AiRunAgentOptions): Promise<Record<string, unknown>>;
  };
}

export declare function createKit(options: CreateKitOptions): FunctionKit;

export declare const FunctionKitRuntimeSDK: {
  PROTOCOL_VERSION: "1.0.0";
  createKit: typeof createKit;
  preview: {
    installIfMissing(options?: PreviewHostOptions & { kitId?: string; surface?: FunctionKitSurface }): {
      installed: boolean;
      host: any;
    };
  };
  discovery: {
    DEFAULT_DISCOVERY_RANKING: typeof import("./discovery").DEFAULT_DISCOVERY_RANKING;
    SUPPORTED_DISCOVERY_LAUNCH_MODES: typeof import("./discovery").SUPPORTED_DISCOVERY_LAUNCH_MODES;
    buildDiscoveryIndex: typeof import("./discovery").buildDiscoveryIndex;
    matchDiscoveryEntries: typeof import("./discovery").matchDiscoveryEntries;
    normalizeDiscoveryManifest: typeof import("./discovery").normalizeDiscoveryManifest;
    normalizeSlashQuery: typeof import("./discovery").normalizeSlashQuery;
    parseSlashTrigger: typeof import("./discovery").parseSlashTrigger;
    rankDiscoveryMatches: typeof import("./discovery").rankDiscoveryMatches;
    resolveDiscoveryQuery: typeof import("./discovery").resolveDiscoveryQuery;
  };
};
