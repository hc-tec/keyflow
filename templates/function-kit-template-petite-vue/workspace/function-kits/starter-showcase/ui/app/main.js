const starter = Object.freeze({
  kitId: "starter-showcase",
  displayName: "Starter Showcase",
  description: "A petite-vue starter wired to vendored runtime assets and a KitStudio-ready landing-page preview.",
  surface: "panel",
});

const storageKeys = Object.freeze({
  draft: "starter.draft",
});

const defaultDraft =
  "Ship a polished Function Kit with local vendor assets, host-backed storage, and a KitStudio-ready preview in minutes.";

const metrics = Object.freeze([
  { label: "Runtime", value: "Vendored", hint: "No extra workspace mount required." },
  { label: "UI", value: "petite-vue", hint: "Browser-native and zero-build." },
  { label: "Style", value: "kit-shadcn", hint: "Tokens + primitives already wired." },
  { label: "Preview", value: "KitStudio", hint: "Auto-opens because only one kit is mounted." },
]);

const features = Object.freeze([
  {
    index: "01",
    title: "Direct imports that survive CSP",
    body: "The starter keeps runtime.js, petite-vue, and the shadcn-style CSS beside the kit UI so Android WebView and KitStudio behave the same on day one.",
    tag: "vendor-first",
  },
  {
    index: "02",
    title: "Runtime calls you can keep",
    body: "Refresh context, open settings, insert copy, replace text, and save draft state are all wired already. Delete the copy, keep the bridge code.",
    tag: "host-bridge",
  },
  {
    index: "03",
    title: "A real-looking surface to iterate on",
    body: "The example reads like a small product landing page, so typography, spacing, and hierarchy are already at a respectable baseline before you add business logic.",
    tag: "product-quality",
  },
]);

const steps = Object.freeze([
  {
    label: "Step 1",
    title: "Open it in KitStudio",
    body: "Run npm run open:kitstudio. The script mounts only this starter workspace, so KitStudio lands directly on the sample kit instead of making you browse a long workspace list.",
  },
  {
    label: "Step 2",
    title: "Rename the starter before adding business logic",
    body: "Run npm run rename:starter with your own kitId and display name. That keeps your manifest, directory structure, and UI metadata aligned before you start shipping.",
  },
  {
    label: "Step 3",
    title: "Replace the showcase copy with your workflow",
    body: "Keep the runtime event handlers, remove the landing-page messaging, and shape the panel around your real user action: insert, replace, observe, intercept, or preview.",
  },
]);

const fileTree = Object.freeze([
  { path: "manifest.json", note: "permissions, discovery, entry bundle" },
  { path: "ui/app/index.html", note: "layout and semantic structure" },
  { path: "ui/app/main.js", note: "runtime bridge + petite-vue state" },
  { path: "ui/app/styles.css", note: "visual system and responsive behavior" },
  { path: "ui/vendor/function-kit-runtime.js", note: "vendored browser runtime SDK bundle" },
  { path: "ui/vendor/petite-vue.iife.js", note: "vendored reactive UI layer" },
  { path: "ui/vendor/kit-shadcn.css", note: "vendored token and primitive baseline" },
]);

const previewContext = Object.freeze({
  sourceMessage: "Can you turn this into a sharper launch note before noon?",
  sourcePackage: "preview.mock.host",
  selectedText: "sharper launch note",
});

const kit = globalThis.FunctionKitRuntimeSDK.createKit({
  kitId: starter.kitId,
  surface: starter.surface,
  debug: true,
  connect: {
    timeoutMs: 20000,
    retries: 3,
  },
  preview: {
    grantAll: true,
    storage: {
      [storageKeys.draft]: defaultDraft,
    },
    context: previewContext,
  },
});

document.title = starter.displayName;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveRuntimeError(error) {
  if (!error) return { message: "unknown error" };
  if (typeof error === "string") return { message: error };
  if (typeof error.message === "string" && error.message.length > 0) return { message: error.message };
  return { message: JSON.stringify(error) };
}

const app = globalThis.PetiteVue.reactive({
  starter,
  metrics,
  features,
  steps,
  fileTree,
  status: {
    state: "idle",
    text: "Waiting for host handshake",
    meta: null,
  },
  host: {
    sessionId: null,
    buildName: null,
  },
  permissions: [],
  caps: {
    canReadContext: false,
    canInsert: false,
    canReplace: false,
    canReadStorage: false,
    canWriteStorage: false,
  },
  context: null,
  draftText: defaultDraft,
  bootstrapCompleted: false,

  get hostSummary() {
    const build = this.host.buildName ? ` (${this.host.buildName})` : "";
    return `${starter.surface}${build}`;
  },

  get permissionSummary() {
    return this.permissions.length > 0 ? `${this.permissions.length} granted` : "pending";
  },

  get statusMetaText() {
    return this.status.meta || `surface=${starter.surface}`;
  },

  get contextPreview() {
    if (!this.context) return "";
    return normalizeText(this.context.selectedText) || normalizeText(this.context.sourceMessage) || "";
  },

  updateStatus(state, text, meta) {
    this.status.state = state;
    this.status.text = text;
    this.status.meta = meta || null;
  },

  syncCapabilities() {
    this.permissions = Array.isArray(kit.state.permissions) ? kit.state.permissions : this.permissions;
    this.caps.canReadContext = kit.hasPermission("context.read");
    this.caps.canInsert = kit.hasPermission("input.insert");
    this.caps.canReplace = kit.hasPermission("input.replace");
    this.caps.canReadStorage = kit.hasPermission("storage.read");
    this.caps.canWriteStorage = kit.hasPermission("storage.write");
  },

  hydrateContext(context) {
    this.context = context ?? null;
    if (!normalizeText(this.draftText)) {
      this.draftText = normalizeText(context?.selectedText) || normalizeText(context?.sourceMessage) || defaultDraft;
    }
  },

  loadDraft() {
    if (!kit.hasPermission("storage.read")) {
      return;
    }
    kit.storage
      .get([storageKeys.draft])
      .then((values) => {
        const draft = normalizeText(values?.[storageKeys.draft]);
        if (draft) {
          this.draftText = draft;
        }
      })
      .catch(() => {});
  },

  saveDraft() {
    if (!kit.hasPermission("storage.write")) {
      this.updateStatus("error", "Missing storage.write", "permissions=storage.write");
      return;
    }

    const draft = normalizeText(this.draftText);
    if (!draft) {
      this.updateStatus("error", "Draft is empty");
      return;
    }

    this.updateStatus("busy", "Saving draft");
    kit.storage
      .set({ [storageKeys.draft]: draft })
      .then(() => {
        this.updateStatus("ready", "Draft saved");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `Save failed: ${resolved.message}`);
      });
  },

  refreshContext() {
    if (!kit.hasPermission("context.read")) {
      this.updateStatus("error", "Missing context.read", "permissions=context.read");
      return;
    }

    this.updateStatus("busy", "Refreshing context");
    kit.context
      .refresh({ reason: "starter-manual-refresh" })
      .then((context) => {
        this.hydrateContext(context);
        this.updateStatus("ready", "Context synced");
      })
      .catch((error) => {
        const resolved = resolveRuntimeError(error);
        this.updateStatus("error", `Context refresh failed: ${resolved.message}`);
      });
  },

  useCurrentSelection() {
    const nextDraft = normalizeText(this.context?.selectedText) || normalizeText(this.context?.sourceMessage);
    if (!nextDraft) {
      this.updateStatus("error", "No context available yet");
      return;
    }

    this.draftText = nextDraft;
    this.updateStatus("ready", "Draft copied from host context");
  },

  insertText(mode, text, label) {
    const resolvedText = normalizeText(text);
    if (!resolvedText) {
      this.updateStatus("error", `${label} is empty`);
      return;
    }

    if (mode === "replace") {
      if (!kit.hasPermission("input.replace")) {
        this.updateStatus("error", "Missing input.replace", "permissions=input.replace");
        return;
      }
      kit.input.replace({ text: resolvedText, source: starter.kitId, label });
      this.updateStatus("busy", `Submitted replace for ${label}`);
      return;
    }

    if (!kit.hasPermission("input.insert")) {
      this.updateStatus("error", "Missing input.insert", "permissions=input.insert");
      return;
    }
    kit.input.insert({ text: resolvedText, source: starter.kitId, label });
    this.updateStatus("busy", `Submitted insert for ${label}`);
  },

  insertStarterPitch() {
    const selection = normalizeText(this.context?.selectedText);
    const pitch = selection
      ? `Start from "${selection}" and turn it into a polished Function Kit flow.`
      : "Start from a real user action, keep the runtime calls, and ship the first Function Kit today.";
    this.insertText("insert", pitch, "starter pitch");
  },

  replaceWithDraft() {
    this.insertText("replace", this.draftText, "draft copy");
  },

  openSettings() {
    kit.settings.open({});
  },
});

globalThis.PetiteVue.createApp(app).mount("#app");

kit.on("ready", ({ sessionId, permissions, hostInfo }) => {
  app.host.sessionId = sessionId ?? null;
  app.host.buildName = hostInfo?.build?.displayName ?? null;
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
  app.updateStatus("ready", "Host connected");

  if (!app.bootstrapCompleted) {
    app.bootstrapCompleted = true;
    app.loadDraft();
    app.refreshContext();
  }
});

kit.on("permissions", ({ permissions }) => {
  app.permissions = Array.isArray(permissions) ? permissions : [];
  app.syncCapabilities();
});

kit.on("context", ({ context }) => {
  app.hydrateContext(context);
});

kit.on("storage", ({ values }) => {
  const draft = normalizeText(values?.[storageKeys.draft]);
  if (draft) {
    app.draftText = draft;
  }
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

kit.connect().catch((error) => {
  const resolved = resolveRuntimeError(error);
  app.updateStatus("error", `Host handshake failed: ${resolved.message}`);
});
