import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const bundlePath = path.join(projectRoot, "dist", "function-kit-runtime.js");

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

function buildHostEnvelope(type, replyTo, payload = {}) {
  return {
    version: "1.0.0",
    messageId: `host-${type}-1`,
    timestamp: new Date().toISOString(),
    kitId: "chat-auto-reply",
    surface: "panel",
    source: "host-adapter",
    target: "function-kit-ui",
    type,
    payload,
    replyTo
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
    dispatch(type, event = {}) {
      listeners.get(type)?.forEach((handler) => handler({ type, ...event }));
    }
  };
}

function createMockEditableElement({
  tagName = "TEXTAREA",
  type = "",
  value = "",
  selectionStart,
  selectionEnd,
  dataset = {},
  id = "",
  name = "",
  textContent = "",
  isContentEditable = false
} = {}) {
  return {
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
}

function executeBundle(overrides = {}) {
  const source = fs.readFileSync(bundlePath, "utf8");
  const host = createMockHost();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Map,
    Promise,
    Math,
    Set,
    URL,
    AbortController,
    FunctionKitHost: host,
    ...overrides
  };

  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: bundlePath });
  return { context, host };
}

test("browser bundle exposes discovery helpers on the global SDK", () => {
  const { context } = executeBundle();
  const sdk = context.FunctionKitRuntimeSDK;

  assert.ok(sdk);
  assert.equal(typeof sdk.createClient, "undefined");
  assert.equal(typeof sdk.createKit, "function");
  assert.equal(typeof sdk.preview?.installIfMissing, "function");
  assert.equal(typeof sdk.discovery.parseSlashTrigger, "function");
  assert.equal(typeof sdk.discovery.resolveDiscoveryQuery, "function");
  assert.equal(sdk.discovery.parseSlashTrigger("Need /reply")?.query, "reply");
});

test("browser bundle exposes network and ai APIs", () => {
  const { context } = executeBundle();
  const kit = context.FunctionKitRuntimeSDK.createKit({
    kitId: "chat-auto-reply",
    surface: "panel"
  });

  assert.equal(typeof kit.fetch, "function");
  assert.equal(typeof kit.files.pick, "function");
  assert.equal(typeof kit.files.download, "function");
  assert.equal(typeof kit.files.getUrl, "function");
  assert.equal(typeof kit.ai.request, "function");
  assert.equal(typeof kit.ai.listAgents, "function");
  assert.equal(typeof kit.ai.runAgent, "function");
  assert.equal(typeof kit.kits.sync, "function");
  assert.equal(typeof kit.kits.install, "function");
  assert.equal(typeof kit.kits.uninstall, "function");
  assert.equal(typeof kit.kits.updateSettings, "function");
  assert.equal(typeof kit.catalog.getSources, "function");
  assert.equal(typeof kit.catalog.setSources, "function");
  assert.equal(typeof kit.catalog.refresh, "function");
});

test("browser bundle automatically bridges textarea focus into the composer bridge", () => {
  const documentObject = createMockDocument();
  const textarea = createMockEditableElement({
    tagName: "TEXTAREA",
    value: "Bundle draft",
    selectionStart: 1,
    selectionEnd: 6,
    id: "bundle-draft"
  });
  const { context, host } = executeBundle({
    document: documentObject
  });

  context.FunctionKitRuntimeSDK.createKit({
    kitId: "chat-auto-reply",
    surface: "panel"
  });

  documentObject.activeElement = textarea;
  documentObject.dispatch("focusin", { target: textarea });

  const openRequest = host.messages.at(-1);
  assert.equal(openRequest.type, "composer.open");
  assert.equal(openRequest.payload.composerId, "auto-bundle-draft");
  assert.equal(openRequest.payload.text, "Bundle draft");
  assert.equal(openRequest.payload.selectionStart, 1);
  assert.equal(openRequest.payload.selectionEnd, 6);

  host.dispatch(
    buildHostEnvelope("composer.state.sync", openRequest.messageId, {
      composer: {
        composerId: openRequest.payload.composerId,
        text: "Bundle synced",
        selectionStart: 7,
        selectionEnd: 12
      }
    })
  );

  assert.equal(textarea.value, "Bundle synced");
  assert.equal(textarea.selectionStart, 7);
  assert.equal(textarea.selectionEnd, 12);
});

test("browser bundle can round-trip new request/reply surfaces", async () => {
  const { context, host } = executeBundle();
  const kit = context.FunctionKitRuntimeSDK.createKit({
    kitId: "chat-auto-reply",
    surface: "panel",
    requestTimeoutMs: 200
  });

  const fetchPromise = kit.raw.fetch("https://api.example.test/replies", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token"
    },
    body: {
      prompt: "hello"
    }
  });
  const fetchRequest = host.messages.at(-1);
  assert.equal(fetchRequest.type, "network.fetch");
  assert.equal(fetchRequest.payload.url, "https://api.example.test/replies");
  assert.deepEqual(JSON.parse(JSON.stringify(fetchRequest.payload.init.headers)), [
    ["authorization", "Bearer test-token"]
  ]);
  host.dispatch(
    buildHostEnvelope("network.fetch.result", fetchRequest.messageId, {
      ok: true,
      status: 200
    })
  );
  const fetchEnvelope = await fetchPromise;
  assert.equal(fetchEnvelope.type, "network.fetch.result");

  const aiPromise = kit.raw.ai.request({
    requestId: "req-1",
    prompt: "Say hi"
  });
  const aiRequest = host.messages.at(-1);
  assert.equal(aiRequest.type, "ai.request");
  host.dispatch(
    buildHostEnvelope("ai.response", aiRequest.messageId, {
      requestId: "req-1",
      status: "succeeded",
      output: { type: "text", text: "hi" }
    })
  );
  const aiEnvelope = await aiPromise;
  assert.equal(aiEnvelope.type, "ai.response");

  const agentsPromise = kit.raw.ai.listAgents({ scope: "chat" });
  const agentsRequest = host.messages.at(-1);
  assert.equal(agentsRequest.type, "ai.agent.list");
  host.dispatch(
    buildHostEnvelope("ai.agent.list.result", agentsRequest.messageId, {
      agents: [{ id: "main" }]
    })
  );
  const agentsEnvelope = await agentsPromise;
  assert.equal(agentsEnvelope.type, "ai.agent.list.result");

  const runAgentPromise = kit.raw.ai.runAgent({
    agentId: "main",
    input: {
      topic: "chat-reply"
    }
  });
  const runAgentRequest = host.messages.at(-1);
  assert.equal(runAgentRequest.type, "ai.agent.run");
  host.dispatch(
    buildHostEnvelope("ai.agent.run.result", runAgentRequest.messageId, {
      status: "completed"
    })
  );
  const runAgentEnvelope = await runAgentPromise;
  assert.equal(runAgentEnvelope.type, "ai.agent.run.result");
});

test("browser bundle request wrappers support AbortSignal", async () => {
  const { context, host } = executeBundle();
  const kit = context.FunctionKitRuntimeSDK.createKit({
    kitId: "chat-auto-reply",
    surface: "panel",
    requestTimeoutMs: 200
  });
  const controller = new AbortController();

  const pending = kit.raw.ai.request({
    requestId: "req-abort",
    signal: controller.signal
  });
  const aiRequest = host.messages.at(-1);
  assert.equal(aiRequest.type, "ai.request");

  controller.abort();

  await assert.rejects(
    pending,
    (error) => error?.name === "AbortError"
  );
});
