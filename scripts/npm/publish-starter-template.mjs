import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, parseArgs, readJson, run } from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));
const repoRoot = getRepoRoot();
const templateDir = path.join(repoRoot, "templates", "function-kit-template-petite-vue");
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const dryRun = args.get("dry-run") === true;
const otp = typeof args.get("otp") === "string" ? String(args.get("otp")) : null;
const tokenFile = typeof args.get("token-file") === "string" ? String(args.get("token-file")) : null;

let token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token && tokenFile) {
  const tokenPath = path.resolve(repoRoot, tokenFile);
  const raw = await fs.readFile(tokenPath, "utf8");
  token = raw.startsWith("\uFEFF") ? raw.slice(1).trim() : raw.trim();
}

const pkg = await readJson(path.join(templateDir, "package.json"));
console.log(`[npm] publish starter template: ${pkg.name}@${pkg.version}`);

const publishArgs = ["publish", "--registry", registry];
if (String(pkg.name).startsWith("@")) publishArgs.push("--access", "public");
if (dryRun) publishArgs.push("--dry-run");
if (otp) publishArgs.push("--otp", otp);

const npmrcPath = path.join(templateDir, ".npmrc");
try {
  if (token) {
    const reg = new URL(registry);
    let authPath = reg.pathname || "/";
    if (!authPath.endsWith("/")) authPath += "/";
    const authLine = `//${reg.host}${authPath}:_authToken=${token}`;
    const npmrc = `registry=${registry}\nalways-auth=true\n${authLine}\n`;
    await fs.writeFile(npmrcPath, npmrc, "utf8");
  } else if (!dryRun) {
    console.warn("[npm] NOTE: token not provided; relying on existing npm login (~/.npmrc).");
  }

  await run("npm", publishArgs, { cwd: templateDir });
} finally {
  await fs.rm(npmrcPath, { force: true });
}

console.log("[npm] done: published starter template");
