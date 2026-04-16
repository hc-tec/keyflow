import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const functionKitsRoot = path.join(packageRoot, "workspace", "function-kits");
const defaultStarterKitId = "preview-rewrite-starter";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    if (key.startsWith("no-")) {
      args.set(key.slice(3), false);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
      continue;
    }
    args.set(key, true);
  }
  return args;
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function pathExists(targetPath, type = null) {
  try {
    const stats = await fs.stat(targetPath);
    if (type === "dir") return stats.isDirectory();
    if (type === "file") return stats.isFile();
    return true;
  } catch {
    return false;
  }
}

async function readWorkspaceDefaultKitId() {
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!(await pathExists(packageJsonPath, "file"))) {
    return "";
  }

  try {
    const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);
    return safeText(packageJson?.keyflow?.defaultKitId);
  } catch {
    return "";
  }
}

async function listKitCandidates() {
  if (!(await pathExists(functionKitsRoot, "dir"))) {
    return [];
  }

  const entries = await fs.readdir(functionKitsRoot, { withFileTypes: true });
  const kits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const manifestPath = path.join(functionKitsRoot, entry.name, "manifest.json");
    // eslint-disable-next-line no-await-in-loop
    if (await pathExists(manifestPath, "file")) {
      kits.push(entry.name);
    }
  }
  return kits;
}

async function resolveDefaultKitId() {
  const candidate = await readWorkspaceDefaultKitId();
  if (candidate) {
    const manifestPath = path.join(functionKitsRoot, candidate, "manifest.json");
    if (await pathExists(manifestPath, "file")) {
      return { kitId: candidate, candidates: [] };
    }
  }

  const candidates = await listKitCandidates();
  if (candidates.length === 1) {
    return { kitId: candidates[0], candidates };
  }

  if (candidates.length === 0) {
    return { kitId: defaultStarterKitId, candidates };
  }

  if (candidates.includes(defaultStarterKitId)) {
    const manifestPath = path.join(functionKitsRoot, defaultStarterKitId, "manifest.json");
    if (await pathExists(manifestPath, "file")) {
      return { kitId: defaultStarterKitId, candidates };
    }
  }

  return { kitId: "", candidates };
}

function listKitStudioRootCandidates(explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.KITSTUDIO_ROOT,
    path.resolve(packageRoot, "..", "kit-studio"),
    path.resolve(packageRoot, "..", "..", "kit-studio"),
    path.resolve(packageRoot, "..", "TODO", "ime-research", "repos", "kit-studio"),
    path.resolve(packageRoot, "..", "..", "TODO", "ime-research", "repos", "kit-studio"),
  ];
  const seen = new Set();
  const resolvedCandidates = [];
  for (const candidate of candidates) {
    const resolved = safeText(candidate);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    resolvedCandidates.push(resolved);
  }
  return resolvedCandidates;
}

async function resolveKitStudioRoot(explicitRoot) {
  const candidates = listKitStudioRootCandidates(explicitRoot);
  for (const resolved of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await pathExists(path.join(resolved, "package.json"), "file"))) continue;
    // eslint-disable-next-line no-await-in-loop
    if (!(await pathExists(path.join(resolved, "src", "server.mjs"), "file"))) continue;
    return resolved;
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(healthUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Server is still booting.
    }
    await sleep(400);
  }
  return false;
}

function openUrl(url) {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return true;
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run open:kitstudio -- [--kit-studio-root <path>] [--host 127.0.0.1] [--port 39001] [--no-open] [--dry-run]",
      "",
      "Environment:",
      "  KITSTUDIO_ROOT               override KitStudio repo root",
      "  KITSTUDIO_HOST / PORT        override listen host / port",
      "  KITSTUDIO_FUNCTION_KITS_ROOT is set automatically to this package's workspace/function-kits",
    ].join("\n")
  );
}

const args = parseArgs(process.argv.slice(2));
if (args.get("help")) {
  usage();
  process.exit(0);
}

const host = safeText(args.get("host")) || safeText(process.env.KITSTUDIO_HOST) || "127.0.0.1";
const portCandidate = safeText(args.get("port")) || safeText(process.env.KITSTUDIO_PORT) || "39001";
const port = Number.parseInt(portCandidate, 10);
if (!Number.isFinite(port) || port <= 0) {
  console.error(`[starter] Invalid port: ${portCandidate}`);
  process.exit(2);
}

const shouldOpenBrowser = args.get("open") !== false;
const dryRun = args.get("dry-run") === true;
const kitResolution = await resolveDefaultKitId();
const defaultKitId = kitResolution.kitId;
const kitCandidates = kitResolution.candidates;

const kitStudioRootCandidates = listKitStudioRootCandidates(args.get("kit-studio-root"));
const kitStudioRoot = await resolveKitStudioRoot(args.get("kit-studio-root"));
if (!kitStudioRoot) {
  console.log("[starter] Could not locate KitStudio.");
  console.log("[starter] Expected one of:");
  console.log("  - --kit-studio-root <path>");
  console.log("  - KITSTUDIO_ROOT env");
  for (const candidate of kitStudioRootCandidates) {
    console.log(`  - ${candidate}`);
  }
  console.log("");
  console.log("[starter] Recommended setup:");
  console.log(`  git clone https://github.com/hc-tec/kitstudio.git "${path.resolve(packageRoot, "..", "kit-studio")}"`);

  if (dryRun) {
    const placeholderRoot = kitStudioRootCandidates[0] ? kitStudioRootCandidates[0] : "<KITSTUDIO_ROOT>";
    console.log("");
    console.log("[starter] Dry run command:");
    console.log(`  ${process.execPath} ${path.join(placeholderRoot, "src", "server.mjs")}`);
    console.log("");
    console.log("[starter] NOTE: Set KITSTUDIO_FUNCTION_KITS_ROOT to mount this workspace:");
    console.log(`  KITSTUDIO_FUNCTION_KITS_ROOT=${functionKitsRoot}`);
    process.exit(0);
  }

  process.exit(2);
}

const kitIdForChecks = defaultKitId || kitCandidates[0] || defaultStarterKitId;
if (!(await pathExists(path.join(functionKitsRoot, kitIdForChecks, "manifest.json"), "file"))) {
  console.error(`[starter] The starter workspace is incomplete: missing workspace/function-kits/*/manifest.json`);
  process.exit(2);
}

if (!(await pathExists(path.join(kitStudioRoot, "node_modules"), "dir"))) {
  const msg = `[starter] KitStudio dependencies are not installed: ${kitStudioRoot}\n[starter] Run: cd "${kitStudioRoot}" && npm install`;
  if (!dryRun) {
    console.error(msg);
    process.exit(2);
  } else {
    console.log(msg);
  }
}

const env = {
  ...process.env,
  KITSTUDIO_FUNCTION_KITS_ROOT: functionKitsRoot,
  KITSTUDIO_HOST: host,
  KITSTUDIO_PORT: String(port),
};

const runtimeSdkRoot = path.join(packageRoot, "workspace", "function-kit-runtime-sdk");
if (!env.KITSTUDIO_RUNTIME_SDK_ROOT && (await pathExists(runtimeSdkRoot, "dir"))) {
  env.KITSTUDIO_RUNTIME_SDK_ROOT = runtimeSdkRoot;
}

const serverEntrypoint = path.join(kitStudioRoot, "src", "server.mjs");
const launchCommand = process.execPath;
const launchArgs = [serverEntrypoint];
const baseUrl = `http://${host}:${port}/`;
const healthUrl = `${baseUrl}api/health`;

console.log(`[starter] KitStudio root : ${kitStudioRoot}`);
console.log(`[starter] Kits mount     : ${functionKitsRoot}`);
if (defaultKitId) {
  console.log(`[starter] Default kit    : ${defaultKitId}`);
} else if (kitCandidates.length > 1) {
  console.log(`[starter] Default kit    : (not set; ${kitCandidates.length} kits found)`);
} else {
  console.log(`[starter] Default kit    : ${kitIdForChecks}`);
}
console.log(`[starter] URL            : ${baseUrl}`);
if (kitCandidates.length <= 1) {
  console.log("[starter] Because this workspace only mounts one starter kit, KitStudio will open it by default.");
} else {
  console.log("[starter] This workspace mounts multiple kits; KitStudio will start at the kit list.");
  console.log("[starter] Tip: set package.json -> keyflow.defaultKitId for a deterministic default.");
}

if (dryRun) {
  console.log(`[starter] Dry run command: ${launchCommand} ${launchArgs.join(" ")}`);
  process.exit(0);
}

const child = spawn(launchCommand, launchArgs, {
  cwd: kitStudioRoot,
  env,
  stdio: "inherit",
  shell: false,
  windowsHide: false,
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

const ready = await waitForHealth(healthUrl, 30000);
if (ready) {
  console.log(`[starter] KitStudio is ready: ${baseUrl}`);
  if (shouldOpenBrowser) {
    const opened = openUrl(baseUrl);
    if (!opened) {
      console.log(`[starter] Open the URL manually: ${baseUrl}`);
    }
  }
} else {
  console.log(`[starter] KitStudio did not report healthy within 30s. Open manually when ready: ${baseUrl}`);
}

const exitCode = await new Promise((resolve) => {
  child.on("exit", (code) => resolve(code ?? 0));
});

process.exit(exitCode);
