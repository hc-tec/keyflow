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

const token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!dryRun && !token) {
  console.error("[npm] Missing NPM_TOKEN (or NODE_AUTH_TOKEN).");
  console.error("[npm] Create one via: npm token create (publish)  then set env var NPM_TOKEN.");
  process.exit(2);
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
  const publishArgs = ["publish", "--registry", registry, "--access", "public"];
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
