import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const functionKitsRoot = path.join(packageRoot, "workspace", "function-kits");
const defaultSourceDir = "preview-rewrite-starter";
const kitIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const workspaceReadmeMarker = "<!-- keyflow:function-kit-workspace-readme -->";

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

function toTitleCase(value) {
  return value
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toWorkspacePackageName(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `function-kit-workspace-${slug || "starter"}`;
}

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run rename:starter -- --kit-id yourscope.proofreader --name \"Proofreader\"",
      "",
      "Options:",
      "  --kit-id <id>         required; new manifest.id and directory name",
      "  --name <label>        display name shown in manifest and sample UI",
      "  --description <text>  override sample description",
      "  --source <dir>        source kit directory under workspace/function-kits (default: current workspace kit)",
      "  --workspace-name <n>  override the root package.json name for this local workspace",
      "  --force               allow overwriting an existing target directory",
    ].join("\n")
  );
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

async function resolveSourceDirName(explicitSourceDir) {
  const override = safeText(explicitSourceDir);
  if (override) {
    return { sourceDirName: override, candidates: [] };
  }

  const packageDefaultKitId = await readWorkspaceDefaultKitId();
  if (packageDefaultKitId) {
    const manifestPath = path.join(functionKitsRoot, packageDefaultKitId, "manifest.json");
    if (await pathExists(manifestPath, "file")) {
      return { sourceDirName: packageDefaultKitId, candidates: [] };
    }
  }

  const candidates = await listKitCandidates();
  if (candidates.length === 1) {
    return { sourceDirName: candidates[0], candidates };
  }

  if (candidates.length === 0) {
    return { sourceDirName: defaultSourceDir, candidates };
  }

  if (candidates.includes(defaultSourceDir)) {
    const manifestPath = path.join(functionKitsRoot, defaultSourceDir, "manifest.json");
    if (await pathExists(manifestPath, "file")) {
      return { sourceDirName: defaultSourceDir, candidates };
    }
  }

  return { sourceDirName: "", candidates };
}

function makeWorkspaceReadme({ kitId, name }) {
  return [
    `# ${name}`,
    "",
    workspaceReadmeMarker,
    "",
    "这是一个本地 Keyflow Function Kit 工作区。",
    "",
    "## 快速开始",
    "",
    "```powershell",
    "npm run open:kitstudio",
    "```",
    "",
    "如果 KitStudio 不在本项目同级目录 `../kit-studio`，先设置：",
    "",
    "```powershell",
    '$env:KITSTUDIO_ROOT = \"D:\\dev\\kit-studio\"',
    "npm run open:kitstudio",
    "```",
    "",
    "## 每次改动后先自检",
    "",
    "```powershell",
    "npm run doctor",
    "```",
    "",
    "如果工作区里后续有多个 kit，可以显式指定：",
    "",
    "```powershell",
    `npm run doctor -- --kit ${kitId}`,
    "```",
    "",
    "## 打包与发布",
    "",
    "```powershell",
    "npm run pack:zip",
    "npm run pack:npm -- --scope yourscope",
    "npm run publish:npm -- --scope yourscope --dry-run",
    "npm run catalog:check -- --scope yourscope",
    "npm run catalog:entry -- --scope yourscope",
    "```",
    "",
    "详细说明：",
    "",
    "- `docs/WORKFLOW.md`",
    "- `docs/PLATFORM_COMPATIBILITY.md`",
    "- `docs/ANDROID_HOST_RUNBOOK.md`",
    "",
    "## 重命名（可选）",
    "",
    "```powershell",
    'npm run rename:starter -- --kit-id yourscope.proofreader --name \"Proofreader\"',
    "```",
    "",
    "## 常改的文件",
    "",
    `- workspace/function-kits/${kitId}/manifest.json`,
    `- workspace/function-kits/${kitId}/ui/app/index.html`,
    `- workspace/function-kits/${kitId}/ui/app/main.js`,
    `- workspace/function-kits/${kitId}/ui/app/styles.css`,
    "",
    "## 发布前最后确认",
    "",
    "- 不要依赖 `localStorage/sessionStorage/IndexedDB`",
    "- 不要依赖外链脚本",
    "- 真正发布前至少在 Android Host 上验证一次核心路径",
    "",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.get("help")) {
  usage();
  process.exit(0);
}

const nextKitId = safeText(args.get("kit-id"));
if (!nextKitId) {
  usage();
  process.exit(2);
}
if (!kitIdPattern.test(nextKitId)) {
  console.error(`[starter] Invalid kitId: ${nextKitId}`);
  process.exit(2);
}

const { sourceDirName, candidates } = await resolveSourceDirName(args.get("source"));
if (!sourceDirName) {
  console.error("[starter] Multiple Function Kits found under workspace/function-kits.");
  console.error("[starter] Fix: pass --source <dir> to choose the kit you want to rename.");
  console.error("[starter] Found:");
  for (const candidate of candidates) {
    console.error(`  - ${candidate}`);
  }
  process.exit(2);
}

const sourceDir = path.join(functionKitsRoot, sourceDirName);
if (!(await pathExists(sourceDir, "dir"))) {
  console.error(`[starter] Source starter directory not found: ${sourceDir}`);
  process.exit(2);
}

const targetDir = path.join(functionKitsRoot, nextKitId);
const force = args.get("force") === true;
if (sourceDir !== targetDir && (await pathExists(targetDir)) && !force) {
  console.error(`[starter] Target directory already exists: ${targetDir}`);
  console.error("[starter] Re-run with --force if you want to replace it.");
  process.exit(2);
}

const name = safeText(args.get("name")) || toTitleCase(nextKitId);
const description =
  safeText(args.get("description")) ||
  `A Function Kit starter for ${name}: read current input, generate a preview, then replace only after confirmation.`;
const workspaceName = safeText(args.get("workspace-name")) || toWorkspacePackageName(nextKitId);

const manifestPath = path.join(sourceDir, "manifest.json");
const manifestRaw = await fs.readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);
manifest.id = nextKitId;
manifest.name = name;
manifest.description = description;

if (manifest.icons && typeof manifest.icons === "object") {
  for (const [size, iconPathRaw] of Object.entries(manifest.icons)) {
    if (typeof iconPathRaw !== "string") continue;
    const iconPath = toPosixPath(iconPathRaw);
    const ext = path.posix.extname(iconPath);
    const base = path.posix.basename(iconPath, ext);
    if (base !== sourceDirName) continue;

    const iconDir = path.posix.dirname(iconPath);
    const nextIconRelative = iconDir === "." ? `${nextKitId}${ext}` : `${iconDir}/${nextKitId}${ext}`;
    const sourceIconPath = path.join(sourceDir, iconPath);
    const targetIconPath = path.join(sourceDir, nextIconRelative);

    if (await pathExists(sourceIconPath, "file")) {
      if (sourceIconPath !== targetIconPath) {
        if (await pathExists(targetIconPath, "file")) {
          await fs.rm(targetIconPath, { force: true });
        }
        await fs.rename(sourceIconPath, targetIconPath);
      }
      manifest.icons[size] = nextIconRelative;
    }
  }
}

const mainPath = path.join(sourceDir, "ui", "app", "main.js");
let mainSource = await fs.readFile(mainPath, "utf8");
mainSource = mainSource.replace(/kitId:\s*"[^"]+"/, `kitId: ${JSON.stringify(nextKitId)}`);
mainSource = mainSource.replace(/displayName:\s*"[^"]+"/, `displayName: ${JSON.stringify(name)}`);
mainSource = mainSource.replace(/description:\s*"[^"]+"/, `description: ${JSON.stringify(description)}`);
await fs.writeFile(mainPath, mainSource, "utf8");

const indexHtmlPath = path.join(sourceDir, "ui", "app", "index.html");
if (await pathExists(indexHtmlPath, "file")) {
  let indexHtml = await fs.readFile(indexHtmlPath, "utf8");
  indexHtml = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`);
  await fs.writeFile(indexHtmlPath, indexHtml, "utf8");
}

const readmePath = path.join(sourceDir, "README.md");
if (await pathExists(readmePath, "file")) {
  let readme = await fs.readFile(readmePath, "utf8");
  readme = readme.replace(/^# .+$/m, `# ${name}`);
  readme = readme.replace(new RegExp(`\`${escapeRegExp(sourceDirName)}\``, "g"), `\`${nextKitId}\``);
  await fs.writeFile(readmePath, readme, "utf8");
}

const uiReadmePath = path.join(sourceDir, "ui", "README.md");
if (await pathExists(uiReadmePath, "file")) {
  let uiReadme = await fs.readFile(uiReadmePath, "utf8");
  uiReadme = uiReadme.replace(new RegExp(`\`${escapeRegExp(sourceDirName)}\``, "g"), `\`${nextKitId}\``);
  await fs.writeFile(uiReadmePath, uiReadme, "utf8");
}

const packageJsonPath = path.join(packageRoot, "package.json");
if (await pathExists(packageJsonPath, "file")) {
  const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw);
  packageJson.name = workspaceName;
  packageJson.description = `Local workspace for ${name}, generated from the Keyflow preview-rewrite starter.`;
  packageJson.keyflow = {
    ...(packageJson.keyflow ?? {}),
    defaultKitId: nextKitId,
  };
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
}

const workspaceReadmePath = path.join(packageRoot, "README.md");
let shouldRewriteWorkspaceReadme = true;
if (await pathExists(workspaceReadmePath, "file")) {
  try {
    const existing = await fs.readFile(workspaceReadmePath, "utf8");
    shouldRewriteWorkspaceReadme =
      existing.includes(workspaceReadmeMarker) ||
      existing.includes("# Function Kit Starter Template") ||
      existing.includes("# Preview Rewrite Function Kit Starter") ||
      existing.includes("npm pack @keyflow2/function-kit-template-petite-vue") ||
      existing.includes("function-kit-template-preview-rewrite");
  } catch {
    shouldRewriteWorkspaceReadme = true;
  }
}

if (shouldRewriteWorkspaceReadme) {
  await fs.writeFile(workspaceReadmePath, makeWorkspaceReadme({ kitId: nextKitId, name }), "utf8");
}

await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

if (sourceDir !== targetDir) {
  if (force && (await pathExists(targetDir))) {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
  await fs.rename(sourceDir, targetDir);
}

console.log(`[starter] Renamed starter to ${nextKitId}`);
console.log(`[starter] Updated manifest: ${path.join(targetDir, "manifest.json")}`);
console.log(`[starter] Updated UI config: ${path.join(targetDir, "ui", "app", "main.js")}`);
console.log(`[starter] Updated workspace package: ${packageJsonPath}`);
console.log("[starter] Next steps:");
console.log("  1. Re-open KitStudio with: npm run open:kitstudio");
console.log(`  2. Edit ${path.join(targetDir, "ui", "app", "index.html")}`);
console.log(`  3. Edit ${path.join(targetDir, "ui", "app", "styles.css")}`);
