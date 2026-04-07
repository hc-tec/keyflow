import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

test("chat-auto-reply manifest declares AI routing metadata", () => {
  const manifest = readJson("TODO/function-kits/chat-auto-reply/manifest.json");

  assert.equal(manifest.ai?.executionMode, "direct-model");
  assert.equal(manifest.ai?.backendHints?.preferredBackendClass, "direct-model");
  assert.equal(manifest.ai?.backendHints?.requireStructuredJson, true);
  assert.equal(manifest.ai?.backendHints?.latencyTier, "interactive");
  assert.equal(manifest.ai?.backendHints?.latencyBudgetMs, 1200);
  assert.deepEqual(manifest.ai?.backendHints?.requiredCapabilities, [
    "structured-output",
    "low-latency"
  ]);
  assert.equal(manifest.network?.mode, "host-proxy");
  assert.equal(manifest.network?.allowAbsoluteUrls, false);
  assert.equal(manifest.permissions?.needsNetwork, true);
  assert.equal(manifest.permissions?.needsAiAccess, true);
  assert.ok(manifest.runtimePermissions.includes("ai.request"));
  assert.ok(manifest.hostBridge?.uiToHost.includes("ai.request"));
  assert.ok(manifest.hostBridge?.hostToUi.includes("ai.response"));
});

test("quick-phrases manifest stays focused on user-facing permissions (no composer permission/api)", () => {
  const manifest = readJson("TODO/function-kits/quick-phrases/manifest.json");

  assert.ok(manifest.runtimePermissions.includes("context.read"));
  assert.ok(manifest.runtimePermissions.includes("input.insert"));
  assert.ok(manifest.runtimePermissions.includes("input.replace"));
  assert.ok(manifest.runtimePermissions.includes("storage.read"));
  assert.ok(manifest.runtimePermissions.includes("storage.write"));
  assert.ok(manifest.runtimePermissions.includes("settings.open"));

  assert.ok(!manifest.runtimePermissions.some((permission) => String(permission).startsWith("composer.")));
  assert.ok(!manifest.hostBridge?.uiToHost?.some((messageType) => String(messageType).startsWith("composer.")));
  assert.ok(!manifest.hostBridge?.hostToUi?.some((messageType) => String(messageType).startsWith("composer.")));
  assert.equal("needsDetachedComposer" in (manifest.permissions ?? {}), false);
});

test("manifest schema links AI metadata to shared backend schemas", () => {
  const manifestSchema = readJson("TODO/function-kit-runtime-sdk/schemas/function-kit-manifest.schema.json");
  const commonSchema = readJson("TODO/function-kit-runtime-sdk/schemas/ai-backend-common.schema.json");
  const requestSchema = readJson("TODO/function-kit-runtime-sdk/schemas/ai-backend-request.schema.json");
  const responseSchema = readJson("TODO/function-kit-runtime-sdk/schemas/ai-backend-response.schema.json");

  assert.equal(
    manifestSchema.properties?.ai?.properties?.executionMode?.$ref,
    "./ai-backend-common.schema.json#/$defs/executionMode"
  );
  assert.equal(
    manifestSchema.properties?.ai?.properties?.backendHints?.$ref,
    "./ai-backend-common.schema.json#/$defs/backendHints"
  );
  assert.equal(manifestSchema.properties?.network?.properties?.mode?.enum?.[0], "host-proxy");
  assert.equal(manifestSchema.properties?.permissions?.properties?.needsAiAccess?.type, "boolean");
  for (const permission of [
    "input.commitImage",
    "input.observe.best_effort",
    "network.fetch",
    "files.pick",
    "files.download",
    "runtime.message.send",
    "runtime.message.receive",
    "ai.request",
    "kits.manage",
    "send.intercept.ime_action",
    "ai.agent.list",
    "ai.agent.run"
  ]) {
    assert.ok(manifestSchema.properties?.runtimePermissions?.items?.enum?.includes(permission));
  }
  assert.ok(commonSchema.$defs?.backendHints);
  assert.equal(
    requestSchema.properties?.executionMode?.$ref,
    "./ai-backend-common.schema.json#/$defs/executionMode"
  );
  assert.equal(
    responseSchema.properties?.backendClass?.$ref,
    "./ai-backend-common.schema.json#/$defs/backendClass"
  );
});

test("host bridge schema enumerates network, ai, and composer bridge message types", () => {
  const envelopeSchema = readJson("TODO/function-kits/host-bridge/message-envelope.schema.json");
  const typeEnum = envelopeSchema.properties?.type?.enum ?? [];

  for (const messageType of [
    "binding.invoke",
    "input.commitImage",
    "input.observe.best_effort.start",
    "input.observe.best_effort.stop",
    "input.observe.best_effort.ack",
    "network.fetch",
    "network.fetch.result",
    "ai.request",
    "ai.response",
    "ai.response.delta",
    "runtime.message.send",
    "runtime.message.send.ack",
    "runtime.message",
    "ai.agent.list",
    "ai.agent.list.result",
    "ai.agent.run",
    "ai.agent.run.result",
    "files.download",
    "files.download.result",
    "files.getUrl",
    "files.getUrl.result",
    "kits.sync.request",
    "kits.sync",
    "kits.install",
    "kits.install.result",
    "kits.uninstall",
    "kits.uninstall.result",
    "kits.settings.update",
    "kits.settings.update.result",
    "catalog.sources.get",
    "catalog.sources.set",
    "catalog.sources.sync",
    "catalog.refresh",
    "catalog.sync",
    "task.update",
    "tasks.sync.request",
    "tasks.sync",
    "task.cancel",
    "task.cancel.ack",
    "send.intercept.ime_action.register",
    "send.intercept.ime_action.unregister",
    "send.intercept.ime_action.ack",
    "send.intercept.ime_action.intent",
    "send.intercept.ime_action.result",
    "composer.open",
    "composer.focus",
    "composer.update",
    "composer.close",
    "composer.state.sync"
  ]) {
    assert.ok(typeEnum.includes(messageType));
  }
});
