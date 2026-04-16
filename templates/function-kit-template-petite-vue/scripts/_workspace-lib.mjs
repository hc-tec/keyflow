import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(__dirname, "..");
export const functionKitsRoot = path.join(packageRoot, "workspace", "function-kits");
export const artifactsRoot = path.join(packageRoot, "artifacts");
export const defaultStarterKitId = "starter-showcase";

const excludedPackDirNames = new Set([".git", "node_modules", "skills", "tools", "tests"]);
const excludedPackFileNames = new Set([".DS_Store"]);

export function parseArgs(argv) {
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

export function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

export async function pathExists(targetPath, type = null) {
  try {
    const stats = await fs.stat(targetPath);
    if (type === "dir") return stats.isDirectory();
    if (type === "file") return stats.isFile();
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

function shouldIncludePackPath(relativePath) {
  const segments = toPosixPath(relativePath).split("/").filter(Boolean);
  if (segments.length === 0) return true;
  const baseName = segments[segments.length - 1];
  if (excludedPackFileNames.has(baseName)) return false;
  if (segments.some((segment) => excludedPackDirNames.has(segment))) return false;
  return true;
}

export async function copyDirectoryContentsFiltered(sourceDir, targetDir, relativePrefix = "") {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const relativePath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
    if (!shouldIncludePackPath(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      await copyDirectoryContentsFiltered(sourcePath, targetPath, relativePath);
      continue;
    }
    if (!entry.isFile()) continue;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await fs.copyFile(sourcePath, targetPath);
  }
}

export async function readWorkspaceDefaultKitId() {
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!(await pathExists(packageJsonPath, "file"))) {
    return "";
  }
  try {
    const packageJson = await readJson(packageJsonPath);
    return safeText(packageJson?.keyflow?.defaultKitId);
  } catch {
    return "";
  }
}

export async function listKitCandidates() {
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

export async function resolveDefaultKitId() {
  const packageDefaultKitId = await readWorkspaceDefaultKitId();
  if (packageDefaultKitId) {
    const manifestPath = path.join(functionKitsRoot, packageDefaultKitId, "manifest.json");
    if (await pathExists(manifestPath, "file")) {
      return { kitId: packageDefaultKitId, candidates: [] };
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
    return { kitId: defaultStarterKitId, candidates };
  }
  return { kitId: "", candidates };
}

export async function resolveKitTarget(explicitKitId) {
  const override = safeText(explicitKitId);
  if (override) {
    const kitDir = path.join(functionKitsRoot, override);
    const manifestPath = path.join(kitDir, "manifest.json");
    if (!(await pathExists(manifestPath, "file"))) {
      throw new Error(`[starter] Kit not found: ${override}`);
    }
    const manifest = await readJson(manifestPath);
    return { kitId: override, kitDir, manifestPath, manifest, candidates: [] };
  }

  const resolved = await resolveDefaultKitId();
  if (!resolved.kitId) {
    const found = resolved.candidates.map((item) => `  - ${item}`).join("\n");
    throw new Error(
      `[starter] Multiple Function Kits found under workspace/function-kits.\n` +
        "[starter] Pass --kit <dir> to choose one.\n" +
        `[starter] Found:\n${found}`
    );
  }

  const kitDir = path.join(functionKitsRoot, resolved.kitId);
  const manifestPath = path.join(kitDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  return {
    kitId: resolved.kitId,
    kitDir,
    manifestPath,
    manifest,
    candidates: resolved.candidates,
  };
}

export function normalizeScope(rawValue) {
  const value = safeText(rawValue);
  if (!value) return "";
  return value.startsWith("@") ? value.slice(1) : value;
}

export function resolvePackageName({ scope, prefix = "keyflow-kit-", kitId, packageName }) {
  const explicit = safeText(packageName);
  if (explicit) return explicit;
  const normalizedScope = normalizeScope(scope);
  const baseName = `${prefix}${kitId}`;
  return normalizedScope ? `@${normalizedScope}/${baseName}` : baseName;
}

export function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export async function hashFile(filePath, algorithm = "sha256", encoding = "hex") {
  const hasher = crypto.createHash(algorithm);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 128);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead <= 0) break;
      hasher.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hasher.digest(encoding);
}

export async function getFileSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

export async function computeTarballDist(filePath) {
  return {
    integrity: `sha512-${await hashFile(filePath, "sha512", "base64")}`,
    sha256: await hashFile(filePath, "sha256", "hex"),
    sizeBytes: await getFileSize(filePath),
  };
}

async function spawnOnce(command, args, options, forceShell = false) {
  const { cwd, env, stdio = "pipe" } = options;
  return await new Promise((resolve, reject) => {
    const isWinBatch =
      process.platform === "win32" &&
      (command.toLowerCase().endsWith(".cmd") || command.toLowerCase().endsWith(".bat"));
    const shouldUseCmd = isWinBatch || forceShell;
    const spawnCommand = shouldUseCmd ? process.env.ComSpec ?? "cmd.exe" : command;
    const spawnArgs = shouldUseCmd ? ["/d", "/s", "/c", command, ...args] : args;

    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
      stdio,
    });

    if (stdio === "inherit") {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          const error = new Error(`Command failed (${code}): ${command} ${args.join(" ")}`.trim());
          error.code = code;
          reject(error);
          return;
        }
        resolve({ stdout: "", stderr: "" });
      });
      return;
    }

    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        const error = new Error(`Command failed (${code}): ${command} ${args.join(" ")}\n${err || out}`.trim());
        error.code = code;
        error.stdout = out;
        error.stderr = err;
        reject(error);
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

export async function run(command, args, options = {}) {
  let candidates = [command];
  if (process.platform === "win32" && path.extname(command) === "") {
    const lower = command.toLowerCase();
    const cmdFirst = new Set(["npm", "npx"]);
    const exeFirst = new Set(["git", "powershell", "pwsh"]);
    if (cmdFirst.has(lower)) {
      candidates = [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command];
    } else if (exeFirst.has(lower)) {
      candidates = [`${command}.exe`, command, `${command}.cmd`, `${command}.bat`];
    } else {
      candidates = [`${command}.exe`, command, `${command}.cmd`, `${command}.bat`];
    }
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await spawnOnce(candidate, args, options);
    } catch (error) {
      lastError = error;
      if (process.platform === "win32" && (error?.code === "EPERM" || error?.code === "EINVAL")) {
        try {
          // eslint-disable-next-line no-await-in-loop
          return await spawnOnce(candidate, args, options, true);
        } catch (shellError) {
          lastError = shellError;
          if (shellError?.code !== "ENOENT" && shellError?.code !== "EPERM" && shellError?.code !== "EINVAL") {
            throw shellError;
          }
        }
      }
      if (error?.code !== "ENOENT" && error?.code !== "EPERM" && error?.code !== "EINVAL") {
        throw error;
      }
    }
  }
  throw lastError ?? new Error(`Command not found: ${command}`);
}

export async function buildNpmKitStage({
  kitId,
  manifest,
  kitDir,
  scope,
  prefix,
  packageName,
  repository,
  homepage,
  bugs,
  outRoot = path.join(artifactsRoot, "npm"),
}) {
  const buildDir = path.join(outRoot, "build", kitId);
  await ensureCleanDir(buildDir);
  await copyDirectoryContentsFiltered(kitDir, buildDir);

  const resolvedPackageName = resolvePackageName({ scope, prefix, kitId, packageName });
  const pkg = {
    name: resolvedPackageName,
    version: String(manifest.version ?? "0.0.0"),
    description: String(manifest.description ?? manifest.name ?? kitId),
    keywords: ["keyflow", "function-kit", "ime", "webview"],
    license: "Apache-2.0",
    keyflow: {
      kind: "function-kit",
      kitId,
      manifest: "manifest.json",
    },
  };

  if (repository) {
    pkg.repository = { type: "git", url: repository };
  }
  if (homepage) {
    pkg.homepage = homepage;
  }
  if (bugs) {
    pkg.bugs = { url: bugs };
  }

  await fs.writeFile(path.join(buildDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");

  return {
    kitId,
    kitDir,
    manifest,
    buildDir,
    packageName: resolvedPackageName,
    version: pkg.version,
    outRoot,
  };
}
