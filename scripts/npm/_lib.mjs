import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function getRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  return JSON.parse(text);
}

export async function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function run(command, args, options = {}) {
  const { cwd, env } = options;

  async function spawnOnce(cmd) {
    return await new Promise((resolve, reject) => {
      const isWinBatch =
        process.platform === "win32" && (cmd.toLowerCase().endsWith(".cmd") || cmd.toLowerCase().endsWith(".bat"));

      const spawnCmd = isWinBatch ? process.env.ComSpec ?? "cmd.exe" : cmd;
      const spawnArgs = isWinBatch ? ["/d", "/s", "/c", cmd, ...args] : args;

      const child = spawn(spawnCmd, spawnArgs, {
        cwd,
        env: { ...process.env, ...env },
        shell: false,
        windowsHide: true,
      });

      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (d) => stdout.push(d));
      child.stderr.on("data", (d) => stderr.push(d));
      child.on("error", reject);
      child.on("close", (code) => {
        const out = Buffer.concat(stdout).toString("utf8");
        const err = Buffer.concat(stderr).toString("utf8");
        if (code !== 0) {
          const e = new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}\n${err || out}`.trim());
          e.code = code;
          e.stdout = out;
          e.stderr = err;
          return reject(e);
        }
        resolve({ stdout: out, stderr: err });
      });
    });
  }

  const candidates = [command];
  if (process.platform === "win32" && path.extname(command) === "") {
    candidates.push(`${command}.cmd`, `${command}.exe`, `${command}.bat`);
  }

  let lastErr = null;
  for (const cmd of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await spawnOnce(cmd);
    } catch (e) {
      lastErr = e;
      if (e?.code !== "ENOENT") throw e;
    }
  }

  throw lastErr ?? new Error(`Command not found: ${command}`);
}

export function normalizePath(p) {
  return p.replaceAll("\\", "/");
}

export function shouldExclude(relPath) {
  const p = normalizePath(relPath);
  if (!p || p === "." || p === "..") return true;

  const top = p.split("/")[0];
  if (
    top === "node_modules" ||
    top === ".git" ||
    top === "tests" ||
    top === "tools" ||
    top === "skills" ||
    top === "__tests__"
  ) {
    return true;
  }

  const base = path.posix.basename(p);
  if (base === ".DS_Store") return true;
  if (base.toLowerCase() === "readme.md") return true;
  return false;
}

export async function copyDirFiltered(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    const rel = path.relative(srcDir, src);
    if (shouldExclude(rel)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirFiltered(src, dest);
      continue;
    }

    if (entry.isSymbolicLink()) {
      // Avoid publishing symlinks (different platforms handle them differently).
      continue;
    }

    if (entry.isFile()) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
  }
}

export async function hashFile(filePath) {
  const buf = await fs.readFile(filePath);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const sha512Base64 = crypto.createHash("sha512").update(buf).digest("base64");
  const integrity = `sha512-${sha512Base64}`;
  return { sizeBytes: buf.length, sha256, integrity };
}

export function parseArgs(argv) {
  const args = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const key = a.slice(2);
    if (key.startsWith("no-")) {
      args.set(key.slice(3), false);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
      continue;
    }
    args.set(key, true);
  }
  return { args, positional };
}

export function resolvePackageName({ scope, prefix, kitId }) {
  const safePrefix = prefix ?? "keyflow-kit-";
  const base = `${safePrefix}${kitId}`.toLowerCase();
  if (!scope) return base;
  const s = scope.startsWith("@") ? scope : `@${scope}`;
  return `${s}/${base}`;
}
