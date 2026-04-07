import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, parseArgs, readJson, run } from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const outRoot = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm"));
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const dryRun = args.get("dry-run") === true;
const kitFilter = typeof args.get("kit") === "string" ? String(args.get("kit")) : null;
const otp = typeof args.get("otp") === "string" ? String(args.get("otp")) : null;
const tokenFile = typeof args.get("token-file") === "string" ? String(args.get("token-file")) : null;

let token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token && tokenFile) {
  const tokenPath = path.resolve(repoRoot, tokenFile);
  const raw = await fs.readFile(tokenPath, "utf8");
  token = raw.startsWith("\uFEFF") ? raw.slice(1).trim() : raw.trim();
}
if (!dryRun && !token) {
  console.warn("[npm] NOTE: NPM_TOKEN not set; relying on existing npm login (~/.npmrc).");
  console.warn("[npm] If publish fails with ENEEDAUTH, run: npm login  (or set NPM_TOKEN) and retry.");
}

const metaPath = path.join(outRoot, "kit-packages.json");
const meta = await readJson(metaPath);
const kits = Array.isArray(meta?.kits) ? meta.kits : [];
if (kits.length === 0) {
  console.error(`[npm] No kits found in ${path.relative(repoRoot, metaPath)}. Run build first.`);
  process.exit(2);
}

const published = [];

for (const kit of kits) {
  const buildDir = path.resolve(repoRoot, kit.buildDir);
  if (kitFilter && kit.kitId !== kitFilter) continue;

  const pkg = `${kit.packageName}@${kit.version}`;
  console.log(`[npm] publish: ${pkg}`);
  const isScoped = String(kit.packageName).startsWith("@");
  const publishArgs = ["publish", "--registry", registry];
  if (isScoped) publishArgs.push("--access", "public");
  if (dryRun) publishArgs.push("--dry-run");
  if (otp) publishArgs.push("--otp", otp);

  const npmrcPath = path.join(buildDir, ".npmrc");
  try {
    if (token) {
      const reg = new URL(registry);
      let authPath = reg.pathname || "/";
      if (!authPath.endsWith("/")) authPath += "/";
      const authLine = `//${reg.host}${authPath}:_authToken=${token}`;
      const npmrc = `registry=${registry}\nalways-auth=true\n${authLine}\n`;
      await fs.writeFile(npmrcPath, npmrc, "utf8");
    }

    await run("npm", publishArgs, { cwd: buildDir });
  } finally {
    await fs.rm(npmrcPath, { force: true });
  }

  published.push({ kitId: kit.kitId, packageName: kit.packageName, version: kit.version });
}

console.log(`[npm] done: published ${published.length} package(s)`);
