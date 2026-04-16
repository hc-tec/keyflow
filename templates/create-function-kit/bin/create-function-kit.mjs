#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaultTemplatePackage = "@keyflow2/function-kit-template-petite-vue";
const officialTemplatePackages = Object.freeze({
  starter: {
    packageName: "@keyflow2/function-kit-template-petite-vue",
    description: "General petite-vue starter for standard panel/action kits.",
  },
  "petite-vue": {
    packageName: "@keyflow2/function-kit-template-petite-vue",
    description: "Alias of the default general-purpose starter.",
  },
  "preview-rewrite": {
    packageName: "@keyflow2/function-kit-template-preview-rewrite",
    description: "AI text preview starter for proofread/polish/translate/summary flows.",
  },
});
const defaultWorkspaceNamePrefix = "function-kit-workspace-";
const kitIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function parseArgs(argv) {
  const args = new Map();
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      positional.push(current);
      continue;
    }
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
  return { args, positional };
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toTitleCase(value) {
  return value
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveKitIdFromName(value) {
  const normalized = safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return "";
  }
  if (!/^[a-z0-9]/.test(normalized)) {
    return `kit-${normalized}`;
  }
  return normalized;
}

function toWorkspacePackageName(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${defaultWorkspaceNamePrefix}${slug || "starter"}`;
}

function usage() {
  console.log(
    [
      "Usage:",
      "  npx @keyflow2/create-function-kit <target-dir> [--kit-id yourscope.launchpad] [--name \"Launchpad\"]",
      "",
      "Options:",
      "  --template <name|npm-ref>  starter template alias or npm package",
      "  --template-dir <path>      use a local starter directory instead of npm (maintainers/dev only)",
      "  --list-templates           show official starter aliases",
      "  --kit-id <id>              new manifest.id and kit directory name (defaults to target dir name)",
      "  --name <label>             display name shown in the starter UI",
      "  --description <text>       override starter description",
      "  --workspace-name <name>    override the generated root package.json name",
      "  --force                    replace an existing non-empty target directory",
      "  --open                     run npm run open:kitstudio after scaffolding",
      "  --kit-studio-root <path>   explicit KitStudio root passed through to the starter helper",
      "  --dry-run                  print planned actions only",
    ].join("\n")
  );
}

function printOfficialTemplates() {
  console.log("Official starter aliases:");
  for (const [name, info] of Object.entries(officialTemplatePackages)) {
    console.log(`  - ${name.padEnd(16)} ${info.packageName}`);
    console.log(`    ${info.description}`);
  }
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

async function isDirectoryEmpty(dirPath) {
  const entries = await fs.readdir(dirPath);
  return entries.length === 0;
}

async function run(command, args, options = {}) {
  const { cwd, env, stdio = "pipe" } = options;

  async function spawnOnce(cmd, forceShell = false) {
    return await new Promise((resolve, reject) => {
      const isWinBatch =
        process.platform === "win32" && (cmd.toLowerCase().endsWith(".cmd") || cmd.toLowerCase().endsWith(".bat"));

      const shouldUseCmd = isWinBatch || forceShell;
      const spawnCmd = shouldUseCmd ? process.env.ComSpec ?? "cmd.exe" : cmd;
      const spawnArgs = shouldUseCmd ? ["/d", "/s", "/c", cmd, ...args] : args;

      const child = spawn(spawnCmd, spawnArgs, {
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
            const error = new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}`.trim());
            error.code = code;
            return reject(error);
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
          const error = new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}\n${err || out}`.trim());
          error.code = code;
          error.stdout = out;
          error.stderr = err;
          return reject(error);
        }
        resolve({ stdout: out, stderr: err });
      });
    });
  }

  let candidates = [command];
  if (process.platform === "win32" && path.extname(command) === "") {
    const lower = command.toLowerCase();
    const npmLike = new Set(["npm", "npx", "pnpm", "yarn"]);
    if (npmLike.has(lower)) {
      candidates = [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command];
    } else {
      candidates = [`${command}.exe`, command, `${command}.cmd`, `${command}.bat`];
    }
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await spawnOnce(candidate);
    } catch (error) {
      lastError = error;
      if (process.platform === "win32" && error?.code === "EPERM") {
        try {
          // eslint-disable-next-line no-await-in-loop
          return await spawnOnce(candidate, true);
        } catch (shellError) {
          lastError = shellError;
          if (shellError?.code !== "ENOENT" && shellError?.code !== "EPERM") {
            throw shellError;
          }
        }
      }
      if (error?.code !== "ENOENT" && error?.code !== "EPERM") {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(`Command not found: ${command}`);
}

async function copyDirectoryContents(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    await fs.cp(sourcePath, targetPath, { recursive: true });
  }
}

async function ensureTargetReady(targetDir, force) {
  if (!(await pathExists(targetDir))) {
    await fs.mkdir(targetDir, { recursive: true });
    return;
  }

  if (!(await pathExists(targetDir, "dir"))) {
    throw new Error(`[create] Target exists and is not a directory: ${targetDir}`);
  }

  if (await isDirectoryEmpty(targetDir)) {
    return;
  }

  if (!force) {
    throw new Error(`[create] Target directory is not empty: ${targetDir}\n[create] Re-run with --force to replace it.`);
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}

async function resolveTemplateRoot({ templateDir, templatePackage, tempRoot }) {
  const localTemplateDir = safeText(templateDir);
  if (localTemplateDir) {
    const resolved = path.resolve(process.cwd(), localTemplateDir);
    if (!(await pathExists(path.join(resolved, "package.json"), "file"))) {
      throw new Error(`[create] Local template directory is missing package.json: ${resolved}`);
    }
    return resolved;
  }

  const npmRef = safeText(templatePackage) || defaultTemplatePackage;
  const packDir = path.join(tempRoot, "pack");
  const extractDir = path.join(tempRoot, "extract");
  await fs.mkdir(packDir, { recursive: true });
  await fs.mkdir(extractDir, { recursive: true });

  const { stdout } = await run("npm", ["pack", npmRef, "--json"], { cwd: packDir });
  const packed = JSON.parse(stdout);
  const fileName = packed?.[0]?.filename;
  if (!fileName) {
    throw new Error(`[create] npm pack did not return a filename for ${npmRef}`);
  }

  const tgzPath = path.join(packDir, fileName);
  await run("tar", ["-xzf", tgzPath, "-C", extractDir]);

  const extractedRoot = path.join(extractDir, "package");
  if (!(await pathExists(path.join(extractedRoot, "package.json"), "file"))) {
    throw new Error(`[create] Extracted template is missing package.json: ${extractedRoot}`);
  }
  return extractedRoot;
}

function resolveTemplatePackage(templateValue) {
  const raw = safeText(templateValue);
  if (!raw) {
    return {
      packageName: defaultTemplatePackage,
      label: `starter -> ${defaultTemplatePackage}`,
    };
  }

  const official = officialTemplatePackages[raw.toLowerCase()];
  if (official) {
    return {
      packageName: official.packageName,
      label: `${raw} -> ${official.packageName}`,
    };
  }

  return {
    packageName: raw,
    label: raw,
  };
}

async function runRenameScript({ targetDir, kitId, name, description, workspaceName }) {
  const renameScriptPath = path.join(targetDir, "scripts", "rename-starter.mjs");
  if (!(await pathExists(renameScriptPath, "file"))) {
    throw new Error(`[create] Starter helper missing: ${renameScriptPath}`);
  }

  const renameArgs = [
    renameScriptPath,
    "--kit-id",
    kitId,
    "--name",
    name,
    "--workspace-name",
    workspaceName,
  ];
  if (description) {
    renameArgs.push("--description", description);
  }
  await run(process.execPath, renameArgs, { cwd: targetDir });
}

async function maybeOpenKitStudio({ targetDir, shouldOpen, kitStudioRoot }) {
  if (!shouldOpen) {
    return false;
  }

  const openScriptPath = path.join(targetDir, "scripts", "open-in-kitstudio.mjs");
  if (!(await pathExists(openScriptPath, "file"))) {
    return false;
  }

  const openArgs = [openScriptPath];
  const rootOverride = safeText(kitStudioRoot);
  if (rootOverride) {
    openArgs.push("--kit-studio-root", path.resolve(process.cwd(), rootOverride));
  }

  try {
    await run(process.execPath, openArgs, {
      cwd: targetDir,
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    console.warn(`[create] Starter created, but KitStudio did not open automatically: ${error.message}`);
    return false;
  }
}

const { args, positional } = parseArgs(process.argv.slice(2));
if (args.get("help")) {
  usage();
  process.exit(0);
}
if (args.get("list-templates")) {
  printOfficialTemplates();
  process.exit(0);
}

const targetArg = safeText(args.get("dir")) || safeText(positional[0]);
if (!targetArg) {
  usage();
  process.exit(2);
}

const targetDir = path.resolve(process.cwd(), targetArg);
const targetBaseName = path.basename(targetDir);
const inferredKitId = deriveKitIdFromName(targetBaseName);
const kitId = safeText(args.get("kit-id")) || inferredKitId;
if (!kitId || !kitIdPattern.test(kitId)) {
  console.error(`[create] Invalid kitId: ${kitId || "<empty>"}`);
  console.error("[create] Pass a valid --kit-id such as yourscope.launchpad");
  process.exit(2);
}

const name = safeText(args.get("name")) || toTitleCase(kitId);
const description = safeText(args.get("description"));
const workspaceName = safeText(args.get("workspace-name")) || toWorkspacePackageName(kitId);
const templateSelection = resolveTemplatePackage(args.get("template"));
const templatePackage = templateSelection.packageName;
const templateDir = safeText(args.get("template-dir"));
const force = args.get("force") === true;
const dryRun = args.get("dry-run") === true;
const shouldOpen = args.get("open") === true;

console.log(`[create] targetDir     : ${targetDir}`);
console.log(`[create] template      : ${templateDir ? path.resolve(process.cwd(), templateDir) : templateSelection.label}`);
console.log(`[create] kitId         : ${kitId}`);
console.log(`[create] name          : ${name}`);
console.log(`[create] workspaceName : ${workspaceName}`);

if (dryRun) {
  console.log("[create] Dry run only. No files written.");
  process.exit(0);
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "create-function-kit-"));

try {
  await ensureTargetReady(targetDir, force);
  const templateRoot = await resolveTemplateRoot({
    templateDir,
    templatePackage,
    tempRoot,
  });

  await copyDirectoryContents(templateRoot, targetDir);
  await runRenameScript({
    targetDir,
    kitId,
    name,
    description,
    workspaceName,
  });

  const opened = await maybeOpenKitStudio({
    targetDir,
    shouldOpen,
    kitStudioRoot: args.get("kit-studio-root"),
  });

  console.log(`[create] Ready: ${targetDir}`);
  if (!opened) {
    console.log(`[create] Next: cd ${JSON.stringify(targetDir)}`);
    console.log("[create] Next: npm run open:kitstudio");
  }
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
