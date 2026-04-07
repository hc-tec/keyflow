import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = value;
    index += 1;
  }
  return result;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readDotEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing env file: ${envPath}`);
  }
  const values = {};
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) {
      values[key] = value;
    }
  }
  return values;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function mergeCatalog(existingModels, desiredModels) {
  const byId = new Map();
  for (const model of Array.isArray(existingModels) ? existingModels : []) {
    if (model && typeof model.id === "string") {
      byId.set(model.id, { ...model });
    }
  }
  for (const model of desiredModels) {
    const existing = byId.get(model.id);
    if (!existing) {
      byId.set(model.id, { ...model });
      continue;
    }
    byId.set(model.id, {
      ...model,
      ...existing,
      name: existing.name || model.name,
      reasoning: typeof existing.reasoning === "boolean" ? existing.reasoning : model.reasoning,
      contextWindow:
        typeof existing.contextWindow === "number" && existing.contextWindow > 0
          ? existing.contextWindow
          : model.contextWindow,
      maxTokens:
        typeof existing.maxTokens === "number" && existing.maxTokens > 0
          ? existing.maxTokens
          : model.maxTokens,
      cost: existing.cost ?? model.cost,
      input: Array.isArray(existing.input) && existing.input.length > 0 ? existing.input : model.input,
    });
  }
  return [...byId.values()];
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..+/u, "").replace("T", "_");
  fs.copyFileSync(filePath, `${filePath}.bak.${timestamp}`);
}

const args = parseArgs(process.argv.slice(2));
const envPath = args["env-path"] || path.join(os.homedir(), ".openclaw", ".env");
const configPath = args["config-path"] || path.join(os.homedir(), ".openclaw", "openclaw.json");
const primaryModel = args["primary-model"] || "deepseek-chat";
const workspacePath = args["workspace-path"] || workspaceRoot;

if (!["deepseek-chat", "deepseek-reasoner"].includes(primaryModel)) {
  throw new Error(`Unsupported primary model: ${primaryModel}`);
}

ensureDir(path.dirname(envPath));
ensureDir(path.dirname(configPath));

const envValues = readDotEnv(envPath);
const apiKey = envValues.OPENCLAW_DEEPSEEK_API_KEY;
if (!apiKey) {
  throw new Error(`OPENCLAW_DEEPSEEK_API_KEY is missing in ${envPath}`);
}
const baseUrl = envValues.OPENCLAW_DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const providerId = "deepseek";
const primaryModelRef = `${providerId}/${primaryModel}`;

const desiredModels = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    contextWindow: 128000,
    maxTokens: 4096,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    contextWindow: 128000,
    maxTokens: 4096,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: true,
  },
];

const config = readJsonIfExists(configPath);
config.agents ??= {};
config.agents.defaults ??= {};
config.agents.defaults.workspace ??= workspacePath;
config.agents.defaults.model ??= {};
config.agents.defaults.model.primary = primaryModelRef;
config.agents.defaults.model.fallbacks = Array.isArray(config.agents.defaults.model.fallbacks)
  ? config.agents.defaults.model.fallbacks
  : [];
config.agents.defaults.models ??= {};

for (const model of desiredModels) {
  const modelRef = `${providerId}/${model.id}`;
  const existing = config.agents.defaults.models[modelRef] ?? {};
  config.agents.defaults.models[modelRef] = {
    ...existing,
    alias: existing.alias || model.name,
  };
}

config.models ??= {};
config.models.mode ??= "merge";
config.models.providers ??= {};

const existingProvider = config.models.providers[providerId] ?? {};
config.models.providers[providerId] = {
  ...existingProvider,
  baseUrl,
  api: "openai-completions",
  auth: "api-key",
  apiKey,
  models: mergeCatalog(existingProvider.models, desiredModels),
};

backupIfExists(configPath);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const summary = {
  configPath,
  envPath,
  workspace: config.agents.defaults.workspace,
  primaryModel: primaryModelRef,
  providerId,
  baseUrl,
  availableModels: desiredModels.map((model) => `${providerId}/${model.id}`),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
