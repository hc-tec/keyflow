import test from "node:test";
import assert from "node:assert/strict";

import { createClient, createKit } from "../src/index.js";

function createMockHost() {
  const listeners = new Set();
  return {
    messages: [],
    addEventListener(type, handler) {
      if (type === "message") {
        listeners.add(handler);
      }
    },
    postMessage(envelope) {
      this.messages.push(envelope);
    },
    dispatch(envelope) {
      listeners.forEach((handler) => handler(envelope));
    }
  };
}

function createMockDocument() {
  const listeners = new Map();
  return {
    activeElement: null,
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.forEach((handler) => handler({ type, ...event }));
    }
  };
}

function createMockEditableElement({
  tagName = "TEXTAREA",
  type = "",
  value = "",
  textContent = "",
  selectionStart,
  selectionEnd,
  dataset = {},
  id = "",
  name = "",
  isContentEditable = false,
  disabled = false,
  readOnly = false
} = {}) {
  const element = {
    nodeType: 1,
    tagName,
    type,
    value,
    textContent,
    innerText: textContent,
    selectionStart: selectionStart ?? String(value ?? textContent ?? "").length,
    selectionEnd: selectionEnd ?? selectionStart ?? String(value ?? textContent ?? "").length,
    dataset,
    id,
    name,
    disabled,
    readOnly,
    isContentEditable,
    parentElement: null,
    parentNode: null,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    getAttribute(name) {
      if (name === "contenteditable" && isContentEditable) {
        return "true";
      }
      return null;
    },
    contains(node) {
      return node === this;
    }
  };

  return element;
}

function buildHostEnvelope(type, replyTo, payload = {}, extra = {}) {
  const envelope = {
    version: "1.0.0",
    messageId: extra.messageId ?? `host-${type}-1`,
    timestamp: new Date().toISOString(),
    kitId: extra.kitId ?? "chat-auto-reply",
    surface: extra.surface ?? "panel",
    source: "host-adapter",
    target: "function-kit-ui",
    type,
    payload
  };

  if (replyTo) {
    envelope.replyTo = replyTo;
  }

  return envelope;
}

async function withMockHost(run) {
  const previousHost = globalThis.FunctionKitHost;
  const previousAndroidHost = globalThis.AndroidFunctionKitHost;
  const previousBridge = globalThis.__FUNCTION_KIT_HOST_BRIDGE__;
  const previousPending = globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__;
  const previousPendingOutbound = globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__;
  const host = createMockHost();
  globalThis.FunctionKitHost = host;

  try {
    return await run(host);
  } finally {
    if (previousHost === undefined) {
      delete globalThis.FunctionKitHost;
    } else {
      globalThis.FunctionKitHost = previousHost;
    }

    if (previousAndroidHost === undefined) {
      delete globalThis.AndroidFunctionKitHost;
    } else {
      globalThis.AndroidFunctionKitHost = previousAndroidHost;
    }

    if (previousBridge === undefined) {
      delete globalThis.__FUNCTION_KIT_HOST_BRIDGE__;
    } else {
      globalThis.__FUNCTION_KIT_HOST_BRIDGE__ = previousBridge;
    }

    if (previousPending === undefined) {
      delete globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__;
    } else {
      globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__ = previousPending;
    }

    if (previousPendingOutbound === undefined) {
      delete globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__;
    } else {
      globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__ = previousPendingOutbound;
    }
  }
}

async function withMockDocument(run) {
  const previousDocument = globalThis.document;
  const previousGetSelection = globalThis.getSelection;
  const documentObject = createMockDocument();
  globalThis.document = documentObject;

  try {
    return await run(documentObject);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }

    if (previousGetSelection === undefined) {
      delete globalThis.getSelection;
    } else {
      globalThis.getSelection = previousGetSelection;
    }
  }
}

test("fetch normalizes transport payload and keeps request-only options off the body", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });
    const controller = new AbortController();

    const pending = client.fetch(new URL("https://api.example.test/replies"), {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "x-trace": 42
      },
      body: {
        prompt: "hello"
      },
      timeoutMs: 1200,
      replyTo: "trace-request-1",
      signal: controller.signal
    });

    const request = host.messages.at(-1);
    assert.equal(request.type, "network.fetch");
    assert.equal(request.replyTo, "trace-request-1");
    assert.equal(request.payload.url, "https://api.example.test/replies");
    assert.deepEqual(JSON.parse(JSON.stringify(request.payload.init)), {
      method: "POST",
      headers: [
        ["authorization", "Bearer token"],
        ["x-trace", "42"]
      ],
      body: {
        prompt: "hello"
      }
    });
    assert.equal("timeoutMs" in request.payload.init, false);
    assert.equal("signal" in request.payload.init, false);

    host.dispatch(
      buildHostEnvelope("network.fetch.result", request.messageId, {
        response: {
          status: 200,
          ok: true
        }
      })
    );

    const envelope = await pending;
    assert.equal(envelope.type, "network.fetch.result");
  });
});

test("createKit input.observeBestEffort toggles host observation via acked requests", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-observe-1",
          grantedPermissions: ["input.observe.best_effort"]
        },
        { messageId: "host-ack-observe-1" }
      )
    );
    await connectPromise;

    const startPromise = kit.input.observeBestEffort({ throttleMs: 123, maxChars: 32 });
    const startRequest = host.messages.at(-1);
    assert.equal(startRequest.type, "input.observe.best_effort.start");
    assert.equal(startRequest.replyTo, "host-ack-observe-1");
    assert.deepEqual(startRequest.payload, { throttleMs: 123, maxChars: 32 });

    host.dispatch(
      buildHostEnvelope(
        "input.observe.best_effort.ack",
        startRequest.messageId,
        { enabled: true },
        { messageId: "host-observe-ack-1" }
      )
    );

    const stop = await startPromise;
    assert.equal(typeof stop, "function");

    const stopPromise = stop();
    const stopRequest = host.messages.at(-1);
    assert.equal(stopRequest.type, "input.observe.best_effort.stop");

    host.dispatch(
      buildHostEnvelope(
        "input.observe.best_effort.ack",
        stopRequest.messageId,
        { enabled: false },
        { messageId: "host-observe-ack-2" }
      )
    );
    await stopPromise;
  });
});

test("createKit send.onImeActionIntent replies with send.intercept.ime_action.result", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-send-1",
          grantedPermissions: ["send.intercept.ime_action"]
        },
        { messageId: "host-ack-send-1" }
      )
    );
    await connectPromise;

    const registerPromise = kit.send.registerImeActionInterceptor({ timeoutMs: 500 });
    const registerRequest = host.messages.at(-1);
    assert.equal(registerRequest.type, "send.intercept.ime_action.register");

    host.dispatch(
      buildHostEnvelope(
        "send.intercept.ime_action.ack",
        registerRequest.messageId,
        { ok: true },
        { messageId: "host-send-register-ack" }
      )
    );
    await registerPromise;

    const detach = kit.send.onImeActionIntent((event) => {
      assert.deepEqual(event.intent, { kind: "editorAction", actionId: 4 });
      assert.deepEqual(event.context, { sourcePackage: "com.example.app" });
      return false;
    });

    host.dispatch(
      buildHostEnvelope(
        "send.intercept.ime_action.intent",
        null,
        {
          intent: { kind: "editorAction", actionId: 4 },
          context: { sourcePackage: "com.example.app" }
        },
        { messageId: "host-send-intent-1" }
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = host.messages.at(-1);
    assert.equal(result.type, "send.intercept.ime_action.result");
    assert.equal(result.replyTo, "host-send-intent-1");
    assert.deepEqual(result.payload, { allow: false });

    detach();
  });
});

test("runtime.connect supports request-only options such as timeoutMs", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });

    const startedAt = Date.now();
    await assert.rejects(
      () =>
        client.runtime.connect({
          requestedPermissions: ["context.read"],
          timeoutMs: 20
        }),
      /request timeout: bridge\.ready/
    );
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 150, `expected bridge.ready to time out quickly, got ${elapsedMs}ms`);

    const request = host.messages.at(-1);
    assert.equal(request.type, "bridge.ready");
    assert.deepEqual(request.payload.requestedPermissions, ["context.read"]);
    assert.equal("timeoutMs" in request.payload, false);
  });
});

test("createKit wraps handshake, injects replyTo, and returns payload-level storage values", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    assert.equal(connectRequest.type, "bridge.ready");
    assert.equal("requestedPermissions" in connectRequest.payload, false);
    assert.equal("timeoutMs" in connectRequest.payload, false);

    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-1",
          grantedPermissions: ["context.read", "storage.read"],
          hostInfo: {
            runtime: "test"
          }
        },
        { messageId: "host-ack-1" }
      )
    );
    const session = await connectPromise;
    assert.equal(session.sessionId, "session-1");
    assert.deepEqual(session.permissions, ["context.read", "storage.read"]);

    const pendingStorage = kit.storage.get(["preferredTone"]);
    const storageRequest = host.messages.at(-1);
    assert.equal(storageRequest.type, "storage.get");
    assert.equal(storageRequest.replyTo, "host-ack-1");
    host.dispatch(
      buildHostEnvelope("storage.sync", storageRequest.messageId, {
        values: {
          preferredTone: "balanced"
        }
      })
    );
    const values = await pendingStorage;
    assert.deepEqual(values, { preferredTone: "balanced" });
  });
});

test("createKit exposes app helpers based on structured context snapshots", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-app-1",
          grantedPermissions: ["context.read"]
        },
        { messageId: "host-ack-app-1" }
      )
    );
    await connectPromise;

    host.dispatch(
      buildHostEnvelope(
        "context.sync",
        null,
        {
          context: {
            sourcePackage: "com.example.app",
            selectionStart: 1,
            selectionEnd: 2,
            selectedText: "hi"
          }
        },
        { messageId: "host-context-1" }
      )
    );

    assert.equal(kit.app.getActivePackageName(), "com.example.app");
    assert.deepEqual(kit.app.getSelection(), { start: 1, end: 2, text: "hi" });
  });
});

test("createKit input.commitImage sends input.commitImage with replyTo seeded from last host message", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-image-1",
          grantedPermissions: ["input.commitImage"]
        },
        { messageId: "host-ack-image-1" }
      )
    );
    await connectPromise;

    const envelope = kit.input.commitImage("data:image/png;base64,AAAA");
    assert.equal(envelope.type, "input.commitImage");
    assert.equal(envelope.replyTo, "host-ack-image-1");
    assert.deepEqual(envelope.payload, { dataUrl: "data:image/png;base64,AAAA" });
  });
});

test("createKit tasks API syncs tasks, merges updates, and supports cancel ack", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-tasks-1",
          grantedPermissions: []
        },
        { messageId: "host-ack-tasks-1" }
      )
    );
    await connectPromise;

    const seenTasks = [];
    kit.on("task", ({ task }) => {
      seenTasks.push(task.taskId);
    });

    const syncPromise = kit.tasks.sync({ includeHistory: true, historyLimit: 2 });
    const syncRequest = host.messages.at(-1);
    assert.equal(syncRequest.type, "tasks.sync.request");
    assert.equal(syncRequest.replyTo, "host-ack-tasks-1");
    assert.deepEqual(syncRequest.payload, { includeHistory: true, historyLimit: 2 });

    host.dispatch(
      buildHostEnvelope(
        "tasks.sync",
        syncRequest.messageId,
        {
          running: [{ taskId: "t1", seq: 1, status: "running", kind: "network.fetch" }],
          history: [{ taskId: "t2", seq: 3, status: "succeeded", kind: "ai.request" }]
        },
        { messageId: "host-tasks-sync-1" }
      )
    );

    const syncPayload = await syncPromise;
    assert.equal(Array.isArray(syncPayload.running), true);
    assert.equal(syncPayload.running[0].taskId, "t1");

    assert.equal(kit.tasks.get("t1")?.status, "running");
    assert.equal(kit.tasks.listRunning().length, 1);
    assert.equal(kit.tasks.listHistory().length, 1);

    host.dispatch(
      buildHostEnvelope(
        "task.update",
        null,
        {
          task: { taskId: "t1", seq: 2, status: "succeeded", kind: "network.fetch" }
        },
        { messageId: "host-task-update-1" }
      )
    );

    assert.equal(kit.tasks.get("t1")?.status, "succeeded");
    assert.equal(kit.tasks.listRunning().length, 0);
    assert.ok(kit.tasks.listHistory().some((task) => task.taskId === "t1"));

    host.dispatch(
      buildHostEnvelope(
        "task.update",
        null,
        {
          task: { taskId: "t1", seq: 1, status: "running", kind: "network.fetch" }
        },
        { messageId: "host-task-update-stale" }
      )
    );
    assert.equal(kit.tasks.get("t1")?.status, "succeeded");

    host.dispatch(
      buildHostEnvelope(
        "task.update",
        null,
        {
          task: { taskId: "t3", seq: 1, status: "running", kind: "ai.request" }
        },
        { messageId: "host-task-update-2" }
      )
    );

    const cancelPromise = kit.tasks.cancel({ taskId: "t3", reason: "user" });
    const cancelRequest = host.messages.at(-1);
    assert.equal(cancelRequest.type, "task.cancel");
    assert.equal(cancelRequest.replyTo, kit.raw.getLastHostMessageId());
    assert.deepEqual(cancelRequest.payload, { taskId: "t3", reason: "user" });

    host.dispatch(
      buildHostEnvelope(
        "task.cancel.ack",
        cancelRequest.messageId,
        { taskId: "t3", ok: true },
        { messageId: "host-task-cancel-ack-1" }
      )
    );

    const cancelPayload = await cancelPromise;
    assert.deepEqual(cancelPayload, { taskId: "t3", ok: true });

    assert.ok(seenTasks.includes("t1"));
  });
});

test("createKit kits API syncs kits and updates aggregated state", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-kits-1",
          grantedPermissions: ["kits.manage"]
        },
        { messageId: "host-ack-kits-1" }
      )
    );
    await connectPromise;

    const syncPromise = kit.kits.sync({ includeDisabled: true });
    const syncRequest = host.messages.at(-1);
    assert.equal(syncRequest.type, "kits.sync.request");
    assert.equal(syncRequest.replyTo, "host-ack-kits-1");
    assert.deepEqual(syncRequest.payload, { includeDisabled: true });

    host.dispatch(
      buildHostEnvelope(
        "kits.sync",
        syncRequest.messageId,
        {
          kits: [
            { kitId: "chat-auto-reply", name: "Chat Auto Reply", enabled: true },
            { kitId: "quick-phrases", name: "Quick Phrases", enabled: false }
          ]
        },
        { messageId: "host-kits-sync-1" }
      )
    );

    const syncPayload = await syncPromise;
    assert.equal(Array.isArray(syncPayload.kits), true);
    assert.equal(syncPayload.kits[0].kitId, "chat-auto-reply");
    assert.equal(kit.kits.get("chat-auto-reply")?.name, "Chat Auto Reply");
    assert.equal(kit.kits.list().length, 2);
    assert.equal(kit.state.kits.ids.length, 2);
  });
});

test("createKit catalog API syncs sources and packages into state", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-catalog-1",
          grantedPermissions: ["kits.manage"]
        },
        { messageId: "host-ack-catalog-1" }
      )
    );
    await connectPromise;

    const sourcesPromise = kit.catalog.getSources();
    const sourcesRequest = host.messages.at(-1);
    assert.equal(sourcesRequest.type, "catalog.sources.get");

    host.dispatch(
      buildHostEnvelope(
        "catalog.sources.sync",
        sourcesRequest.messageId,
        {
          sources: [{ url: "https://store.example.test/catalog.json", enabled: true }]
        },
        { messageId: "host-catalog-sources-1" }
      )
    );

    const sourcesPayload = await sourcesPromise;
    assert.equal(Array.isArray(sourcesPayload.sources), true);
    assert.equal(kit.state.catalog.sources.length, 1);

    const refreshPromise = kit.catalog.refresh({ url: "https://store.example.test/catalog.json" });
    const refreshRequest = host.messages.at(-1);
    assert.equal(refreshRequest.type, "catalog.refresh");
    assert.deepEqual(refreshRequest.payload, { url: "https://store.example.test/catalog.json" });

    host.dispatch(
      buildHostEnvelope(
        "catalog.sync",
        refreshRequest.messageId,
        {
          packages: [{ kitId: "chat-auto-reply", name: "Chat Auto Reply", version: "0.1.0" }]
        },
        { messageId: "host-catalog-sync-1" }
      )
    );

    const refreshPayload = await refreshPromise;
    assert.equal(Array.isArray(refreshPayload.packages), true);
    assert.equal(kit.state.catalog.packages.length, 1);
  });
});

test("createKit files.download and files.getUrl resolve through host replies", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });

    const downloadPromise = kit.files.download({ url: "https://cdn.example.test/icon.png" });
    const downloadRequest = host.messages.at(-1);
    assert.equal(downloadRequest.type, "files.download");
    assert.deepEqual(downloadRequest.payload, { url: "https://cdn.example.test/icon.png" });

    host.dispatch(
      buildHostEnvelope(
        "files.download.result",
        downloadRequest.messageId,
        { ok: true, fileId: "file-1", name: "icon.png" },
        { messageId: "host-files-download-1" }
      )
    );

    const downloaded = await downloadPromise;
    assert.equal(downloaded.fileId, "file-1");

    const resolvePromise = kit.files.getUrl("file-1");
    const resolveRequest = host.messages.at(-1);
    assert.equal(resolveRequest.type, "files.getUrl");
    assert.deepEqual(resolveRequest.payload, { fileId: "file-1" });

    host.dispatch(
      buildHostEnvelope(
        "files.getUrl.result",
        resolveRequest.messageId,
        { ok: true, fileId: "file-1", url: "https://function-kit.local/assets/files/file-1" },
        { messageId: "host-files-get-url-1" }
      )
    );

    const resolved = await resolvePromise;
    assert.equal(resolved.url, "https://function-kit.local/assets/files/file-1");
  });
});

test("createKit bindings.onInvoke normalizes binding.invoke envelopes", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel"
    });

    const received = [];
    const detach = kit.bindings.onInvoke((event) => received.push(event));

    host.dispatch(
      buildHostEnvelope("binding.invoke", null, {
        invocationId: "inv-1",
        trigger: "manual",
        binding: {
          id: "binding-1",
          title: "Test binding",
          preferredPresentation: "panel.preview",
          categories: ["paste", "privacy"],
          entry: { view: "preview" }
        },
        context: { sourcePackage: "test.app" },
        clipboardText: "hello",
        createdAtEpochMs: 123,
        requestedPayloads: ["clipboard.text"],
        providedPayloads: ["clipboard.text"],
        payloadLimits: {
          cursorContextChars: 256,
          selectionTextMaxChars: 8192,
          clipboardTextMaxChars: 8192
        },
        payloadTruncated: false,
        missingPermissions: []
      })
    );

    assert.equal(received.length, 1);
    assert.equal(received[0].envelope.type, "binding.invoke");
    assert.equal(received[0].invocation.invocationId, "inv-1");
    assert.equal(received[0].invocation.trigger, "manual");
    assert.equal(received[0].invocation.binding.id, "binding-1");
    assert.equal(received[0].invocation.binding.title, "Test binding");
    assert.equal(received[0].invocation.binding.preferredPresentation, "panel.preview");
    assert.deepEqual(received[0].invocation.binding.categories, ["paste", "privacy"]);
    assert.deepEqual(received[0].invocation.binding.entry, { view: "preview" });
    assert.equal(received[0].invocation.clipboardText, "hello");
    assert.deepEqual(received[0].invocation.requestedPayloads, ["clipboard.text"]);
    assert.deepEqual(received[0].invocation.providedPayloads, ["clipboard.text"]);
    assert.deepEqual(received[0].invocation.missingPermissions, []);
    assert.equal(received[0].invocation.payloadTruncated, false);
    assert.equal(received[0].invocation.payloadLimits?.cursorContextChars, 256);
    assert.equal(kit.state.lastInvocation?.invocationId, "inv-1");

    detach();
    kit.dispose();
  });
});

test("createKit runtime.onIntent emits host intents derived from host.state.update", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel"
    });

    const intents = [];
    const detachAll = kit.runtime.onIntent((event) => intents.push({ kind: event.intent.kind, envelope: event.envelope }));
    const detachOpenOptions =
      kit.runtime.onIntent("open_options", (event) =>
        intents.push({ kind: `scoped:${event.intent.kind}`, envelope: event.envelope })
      );

    host.dispatch(
      buildHostEnvelope("host.state.update", null, {
        label: "Opened options",
        details: { intent: { kind: "open_options", source: "test" } }
      })
    );

    assert.equal(intents.length, 2);
    assert.equal(intents[0].kind, "open_options");
    assert.equal(intents[1].kind, "scoped:open_options");
    assert.equal(kit.state.lastIntent?.kind, "open_options");

    detachAll();
    detachOpenOptions();
    kit.dispose();
  });
});

test("createKit runtime.sendMessage dispatches runtime.message.send and resolves ack payload", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel"
    });

    const sendPromise = kit.runtime.sendMessage({ toKitId: "quick-phrases", channel: "demo", data: { ok: true } });

    const outbound = host.messages.at(-1);
    assert.equal(outbound?.type, "runtime.message.send");
    assert.equal(outbound?.payload?.toKitId, "quick-phrases");
    assert.equal(outbound?.payload?.channel, "demo");
    assert.deepEqual(outbound?.payload?.data, { ok: true });

    host.dispatch(
      buildHostEnvelope(
        "runtime.message.send.ack",
        outbound.messageId,
        { delivered: 1 },
        { messageId: "host-runtime-message-send-ack-1" }
      )
    );

    const result = await sendPromise;
    assert.equal(result.delivered, 1);

    kit.dispose();
  });
});

test("createKit runtime.onMessage emits runtime messages and updates lastMessage", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel"
    });

    const received = [];
    const detach = kit.runtime.onMessage((event) => received.push(event.message));

    host.dispatch(
      buildHostEnvelope(
        "runtime.message",
        null,
        { fromKitId: "quick-phrases", fromSurface: "panel", channel: "demo", data: { value: 42 }, sentAtEpochMs: 123 },
        { messageId: "host-runtime-message-1" }
      )
    );

    assert.equal(received.length, 1);
    assert.equal(received[0].fromKitId, "quick-phrases");
    assert.equal(received[0].channel, "demo");
    assert.deepEqual(received[0].data, { value: 42 });
    assert.equal(kit.state.lastMessage?.fromKitId, "quick-phrases");

    detach();
    kit.dispose();
  });
});

test("createKit emits ai.delta for ai.response.delta envelopes", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel"
    });

    const deltas = [];
    const detach = kit.on("ai.delta", (event) => deltas.push(event.deltaText));

    host.dispatch(
      buildHostEnvelope("ai.response.delta", null, { requestId: "req-1", deltaText: "hello" }, { messageId: "host-ai-delta-1" })
    );

    assert.deepEqual(deltas, ["hello"]);

    detach();
    kit.dispose();
  });
});

test("createKit storage.watch observes storage.sync changes by key", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel"
    });

    host.dispatch(
      buildHostEnvelope("storage.sync", null, { values: { alpha: 1, beta: 2 } }, { messageId: "host-storage-sync-1" })
    );

    const changes = [];
    const detach = kit.storage.watch(["alpha"], (event) => changes.push(event), { immediate: true });

    assert.equal(changes.length, 1);
    assert.equal(changes[0].values.alpha, 1);
    assert.deepEqual(changes[0].changedKeys, []);

    host.dispatch(buildHostEnvelope("storage.sync", null, { values: { beta: 3 } }, { messageId: "host-storage-sync-2" }));
    assert.equal(changes.length, 1);

    host.dispatch(buildHostEnvelope("storage.sync", null, { values: { alpha: 4 } }, { messageId: "host-storage-sync-3" }));
    assert.equal(changes.length, 2);
    assert.equal(changes[1].values.alpha, 4);
    assert.deepEqual(changes[1].changedKeys, ["alpha"]);

    detach();
    kit.dispose();
  });
});

test("createClient debug emits outbound trace, request lifecycle, and drop reasons", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      debug: true,
      requestTimeoutMs: 200
    });

    const debugEvents = [];
    client.on("*", (envelope) => {
      if (typeof envelope?.type === "string" && envelope.type.startsWith("debug.")) {
        debugEvents.push(envelope);
      }
    });

    client.send("settings.open", {});
    assert.ok(
      debugEvents.some(
        (entry) =>
          entry.type === "debug.envelope" &&
          entry.payload?.direction === "ui->host" &&
          entry.payload?.kind === "send" &&
          entry.payload?.envelope?.type === "settings.open"
      )
    );

    const contextPromise = client.context.requestSnapshot({ reason: "unit-test" });
    const contextRequest = host.messages.at(-1);
    const contextSync = buildHostEnvelope(
      "context.sync",
      contextRequest.messageId,
      { context: { sourceMessage: "hi" } },
      { messageId: "host-context-sync-1" }
    );
    host.dispatch(contextSync);
    await contextPromise;

    assert.ok(
      debugEvents.some(
        (entry) => entry.type === "debug.request" && entry.payload?.phase === "pending" && entry.payload?.requestType === "context.request"
      )
    );
    assert.ok(
      debugEvents.some(
        (entry) => entry.type === "debug.request" && entry.payload?.phase === "resolved" && entry.payload?.requestType === "context.request"
      )
    );

    host.dispatch(contextSync);
    assert.ok(debugEvents.some((entry) => entry.type === "debug.drop" && entry.payload?.reason === "duplicate-message"));
  });
});

test("createKit normalizes bridge.error envelopes into FunctionKitHostError", async () => {
  await withMockHost(async (host) => {
    const kit = createKit({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200,
      connect: {
        timeoutMs: 200,
        retries: 0
      }
    });

    const connectPromise = kit.connect();
    const connectRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        connectRequest.messageId,
        {
          sessionId: "session-2",
          grantedPermissions: ["storage.read"]
        },
        { messageId: "host-ack-2" }
      )
    );
    await connectPromise;

    const pending = kit.storage.get(["k1"]);
    const storageRequest = host.messages.at(-1);
    host.dispatch({
      version: "1.0.0",
      messageId: "host-error-1",
      timestamp: new Date().toISOString(),
      kitId: "chat-auto-reply",
      surface: "panel",
      source: "host-adapter",
      target: "function-kit-ui",
      type: "bridge.error",
      payload: {},
      replyTo: storageRequest.messageId,
      error: {
        code: "storage_failed",
        message: "storage sync failed",
        retryable: false,
        details: {
          reason: "preview"
        }
      }
    });

    await assert.rejects(pending, (error) => {
      assert.equal(error?.name, "FunctionKitHostError");
      assert.equal(error?.code, "storage_failed");
      assert.equal(error?.message, "storage sync failed");
      return true;
    });
  });
});

test("outbound requests queue until the Android host bridge becomes available", async () => {
  const previousHost = globalThis.FunctionKitHost;
  const previousAndroidHost = globalThis.AndroidFunctionKitHost;
  const previousBridge = globalThis.__FUNCTION_KIT_HOST_BRIDGE__;
  const previousPendingHost = globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__;
  const previousPendingUi = globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__;
  delete globalThis.FunctionKitHost;
  delete globalThis.AndroidFunctionKitHost;
  delete globalThis.__FUNCTION_KIT_HOST_BRIDGE__;
  delete globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__;
  delete globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__;

  try {
    const outboundMessages = [];
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 500
    });

    const connectPromise = client.runtime.connect({
      requestedPermissions: ["context.read", "input.insert"]
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__.length, 1);
    assert.equal(outboundMessages.length, 0);

    globalThis.AndroidFunctionKitHost = {
      postMessage(rawEnvelope) {
        outboundMessages.push(JSON.parse(rawEnvelope));
      }
    };

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(outboundMessages.length, 1);
    assert.equal(outboundMessages[0].type, "bridge.ready");
    assert.equal(globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__.length, 0);

    globalThis.__FUNCTION_KIT_HOST_BRIDGE__.dispatchEnvelope(
      JSON.stringify(
        buildHostEnvelope("bridge.ready.ack", outboundMessages[0].messageId, {
          sessionId: "session-android-bridge",
          grantedPermissions: ["context.read", "input.insert"],
          hostInfo: {
            platform: "android",
            runtime: "fcitx5-android-webview"
          }
        })
      )
    );

    await connectPromise;
    assert.equal(client.hasPermission("context.read"), true);
    assert.equal(client.hasPermission("input.insert"), true);
  } finally {
    if (previousHost === undefined) {
      delete globalThis.FunctionKitHost;
    } else {
      globalThis.FunctionKitHost = previousHost;
    }

    if (previousAndroidHost === undefined) {
      delete globalThis.AndroidFunctionKitHost;
    } else {
      globalThis.AndroidFunctionKitHost = previousAndroidHost;
    }

    if (previousBridge === undefined) {
      delete globalThis.__FUNCTION_KIT_HOST_BRIDGE__;
    } else {
      globalThis.__FUNCTION_KIT_HOST_BRIDGE__ = previousBridge;
    }

    if (previousPendingHost === undefined) {
      delete globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__;
    } else {
      globalThis.__FUNCTION_KIT_PENDING_HOST_ENVELOPES__ = previousPendingHost;
    }

    if (previousPendingUi === undefined) {
      delete globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__;
    } else {
      globalThis.__FUNCTION_KIT_PENDING_UI_ENVELOPES__ = previousPendingUi;
    }
  }
});

test("bridge and permission sync update local runtime state", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });

    const pending = client.runtime.connect({
      requestedPermissions: ["ai.request", "network.fetch"]
    });
    const request = host.messages.at(-1);

    host.dispatch(
      buildHostEnvelope(
        "bridge.ready.ack",
        request.messageId,
        {
          grantedPermissions: ["ai.request", "network.fetch"]
        },
        {
          messageId: "host-bridge-ack-1"
        }
      )
    );

    const ack = await pending;
    assert.equal(ack.type, "bridge.ready.ack");
    assert.equal(client.getLastHostMessageId(), "host-bridge-ack-1");
    assert.equal(client.hasPermission("ai.request"), true);
    assert.equal(client.hasPermission("network.fetch"), true);

    host.dispatch(
      buildHostEnvelope(
        "permissions.sync",
        null,
        {
          grantedPermissions: ["storage.read"]
        },
        {
          messageId: "host-permissions-1"
        }
      )
    );

    assert.equal(client.getLastHostMessageId(), "host-permissions-1");
    assert.equal(client.hasPermission("ai.request"), false);
    assert.equal(client.hasPermission("storage.read"), true);
  });
});

test("pending requests reject when the host returns bridge errors or permission denials", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });

    const requestPending = client.ai.request({ requestId: "req-not-ready", prompt: "hi" });
    const request = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope("bridge.error", request.messageId, {
        code: "ai_request_not_ready"
      })
    );

    await assert.rejects(
      requestPending,
      (error) => error?.type === "bridge.error" && error?.payload?.code === "ai_request_not_ready"
    );

    const storagePending = client.storage.get(["draft"]);
    const storageRequest = host.messages.at(-1);
    host.dispatch(
      buildHostEnvelope("permission.denied", storageRequest.messageId, {
        permission: "storage.read"
      })
    );

    await assert.rejects(
      storagePending,
      (error) => error?.type === "permission.denied" && error?.payload?.permission === "storage.read"
    );
  });
});

test("ai.request resolves with ai.response and preserves requestId", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });

    const pending = client.ai.request({
      requestId: "req-1",
      route: { kind: "host-shared" },
      prompt: "Say hello"
    });
    const request = host.messages.at(-1);

    assert.equal(request.type, "ai.request");
    assert.equal(request.payload.requestId, "req-1");

    host.dispatch(
      buildHostEnvelope("ai.response", request.messageId, {
        requestId: "req-1",
        status: "succeeded",
        output: { type: "text", text: "Hello!" }
      })
    );

    const envelope = await pending;
    assert.equal(envelope.type, "ai.response");
    assert.equal(envelope.payload.requestId, "req-1");
    assert.equal(envelope.payload.output.text, "Hello!");
  });
});

test("requests ignore mismatched envelopes and can resolve by expected reply type when replyTo is absent", async () => {
  await withMockHost(async (host) => {
    const client = createClient({
      kitId: "chat-auto-reply",
      surface: "panel",
      requestTimeoutMs: 200
    });

    let settled = false;
    const pending = client.ai.listAgents({ scope: "chat" }).then(
      (value) => {
        settled = true;
        return value;
      },
      (error) => {
        settled = true;
        throw error;
      }
    );
    const request = host.messages.at(-1);

    host.dispatch(
      buildHostEnvelope(
        "ai.agent.list.result",
        request.messageId,
        {
          agents: [{ id: "wrong-surface" }]
        },
        {
          messageId: "host-wrong-surface-1",
          surface: "editor"
        }
      )
    );

    await Promise.resolve();
    assert.equal(settled, false);

    host.dispatch(
      buildHostEnvelope(
        "ai.agent.list.result",
        null,
        {
          agents: [{ id: "desktop-agent" }]
        },
        {
          messageId: "host-agents-1"
        }
      )
    );

    const envelope = await pending;
    assert.equal(envelope.type, "ai.agent.list.result");
    assert.deepEqual(JSON.parse(JSON.stringify(envelope.payload.agents)), [{ id: "desktop-agent" }]);
    assert.equal(client.getLastHostMessageId(), "host-agents-1");
  });
});

test("focused textarea automatically opens the composer bridge and syncs host state back into the field", async () => {
  await withMockHost(async (host) => {
    await withMockDocument(async (documentObject) => {
      const textarea = createMockEditableElement({
        tagName: "TEXTAREA",
        value: "Draft reply",
        selectionStart: 5,
        selectionEnd: 10,
        id: "draft"
      });

      createClient({
        kitId: "chat-auto-reply",
        surface: "panel",
        requestTimeoutMs: 200
      });

      documentObject.activeElement = textarea;
      documentObject.dispatch("focusin", { target: textarea });

      const openRequest = host.messages.at(-1);
      assert.equal(openRequest.type, "composer.open");
      assert.equal(openRequest.payload.text, "Draft reply");
      assert.equal(openRequest.payload.selectionStart, 5);
      assert.equal(openRequest.payload.selectionEnd, 10);
      assert.equal(openRequest.payload.composerId, "auto-draft");

      host.dispatch(
        buildHostEnvelope("composer.state.sync", openRequest.messageId, {
          composer: {
            composerId: openRequest.payload.composerId,
            text: "Host draft",
            selectionStart: 4,
            selectionEnd: 9
          }
        })
      );

      assert.equal(textarea.value, "Host draft");
      assert.equal(textarea.selectionStart, 4);
      assert.equal(textarea.selectionEnd, 9);

      textarea.value = "Host draft!";
      textarea.selectionStart = 11;
      textarea.selectionEnd = 11;
      documentObject.dispatch("input", { target: textarea });

      const updateRequest = host.messages.at(-1);
      assert.equal(updateRequest.type, "composer.update");
      assert.equal(updateRequest.payload.text, "Host draft!");
      assert.equal(updateRequest.payload.selectionStart, 11);
      assert.equal(updateRequest.payload.selectionEnd, 11);

      documentObject.activeElement = null;
      documentObject.dispatch("focusout", { target: textarea });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const closeRequest = host.messages.at(-1);
      assert.equal(closeRequest.type, "composer.close");
      assert.equal(closeRequest.payload.composerId, "auto-draft");
      assert.equal(closeRequest.payload.open, false);
      assert.equal(closeRequest.payload.focused, false);
    });
  });
});

test("automatic composer bridge ignores password fields and respects explicit composer ids on contenteditable targets", async () => {
  await withMockHost(async (host) => {
    await withMockDocument(async (documentObject) => {
      const passwordField = createMockEditableElement({
        tagName: "INPUT",
        type: "password",
        value: "secret"
      });

      const editable = createMockEditableElement({
        tagName: "DIV",
        textContent: "Editable draft",
        selectionStart: 2,
        selectionEnd: 8,
        dataset: {
          functionKitComposerId: "RichComposer"
        },
        isContentEditable: true
      });

      createClient({
        kitId: "chat-auto-reply",
        surface: "panel",
        requestTimeoutMs: 200
      });

      documentObject.activeElement = passwordField;
      documentObject.dispatch("focusin", { target: passwordField });
      assert.equal(host.messages.length, 0);

      documentObject.activeElement = editable;
      documentObject.dispatch("focusin", { target: editable });

      const openRequest = host.messages.at(-1);
      assert.equal(openRequest.type, "composer.open");
      assert.equal(openRequest.payload.composerId, "RichComposer");
      assert.equal(openRequest.payload.text, "Editable draft");

      host.dispatch(
        buildHostEnvelope("composer.state.sync", openRequest.messageId, {
          composer: {
            composerId: "OtherComposer",
            text: "Ignored"
          }
        }, {
          messageId: "host-composer-sync-ignore"
        })
      );
      assert.equal(editable.textContent, "Editable draft");

      host.dispatch(
        buildHostEnvelope("composer.state.sync", openRequest.messageId, {
          composer: {
            composerId: "RichComposer",
            text: "Editable synced"
          }
        }, {
          messageId: "host-composer-sync-apply"
        })
      );
      assert.equal(editable.textContent, "Editable synced");
    });
  });
});
