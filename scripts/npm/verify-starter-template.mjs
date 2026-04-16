import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, hashFile, parseArgs, readJson, run } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));
const repoRoot = getRepoRoot();
const starterPkg = await readJson(
  path.join(repoRoot, "templates", "function-kit-template-petite-vue", "package.json")
);
const defaultTgz = path.join(
  "artifacts",
  "npm",
  "templates",
  "function-kit-template-petite-vue",
  `keyflow2-function-kit-template-petite-vue-${starterPkg.version}.tgz`
);
const tgzArg =
  args.get("tgz") ??
  positional[0] ??
  defaultTgz;

if (typeof tgzArg !== "string") {
  console.error("Usage: node scripts/npm/verify-starter-template.mjs --tgz <path-to.tgz>");
  process.exit(2);
}

const tgzPath = path.resolve(repoRoot, tgzArg);
const outDir = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm/verify-starter-template"));
const extractDir = path.join(outDir, path.basename(tgzPath, ".tgz"));

await fs.mkdir(outDir, { recursive: true });
await fs.rm(extractDir, { recursive: true, force: true });
await fs.mkdir(extractDir, { recursive: true });

const dist = await hashFile(tgzPath);
console.log(`[npm] tgz: ${path.relative(repoRoot, tgzPath)}`);
console.log(`[npm] sizeBytes=${dist.sizeBytes} sha256=${dist.sha256}`);
console.log(`[npm] integrity=${dist.integrity}`);

const { stdout } = await run("tar", ["-tf", tgzPath]);
const files = stdout.split(/\r?\n/).filter(Boolean);
const required = [
  "package/package.json",
  "package/README.md",
  "package/docs/WORKFLOW.md",
  "package/docs/PLATFORM_COMPATIBILITY.md",
  "package/scripts/open-in-kitstudio.mjs",
  "package/scripts/doctor.mjs",
  "package/scripts/rename-starter.mjs",
  "package/scripts/pack-kit-zip.mjs",
  "package/scripts/pack-kit-npm.mjs",
  "package/scripts/publish-kit-npm.mjs",
  "package/scripts/catalog-check.mjs",
  "package/scripts/generate-catalog-entry.mjs",
  "package/workspace/function-kits/starter-showcase/manifest.json",
  "package/workspace/function-kits/starter-showcase/ui/app/index.html",
  "package/workspace/function-kits/starter-showcase/ui/app/main.js",
  "package/workspace/function-kits/starter-showcase/ui/app/styles.css",
  "package/workspace/function-kits/starter-showcase/ui/vendor/function-kit-runtime.js",
  "package/workspace/function-kits/starter-showcase/ui/vendor/petite-vue.iife.js",
  "package/workspace/function-kits/starter-showcase/ui/vendor/kit-shadcn.css"
];

const missing = required.filter((file) => !files.includes(file));
if (missing.length > 0) {
  console.error("[npm] ERROR: starter tarball is missing required files:");
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

await run("tar", ["-xzf", tgzPath, "-C", extractDir]);
console.log(`[npm] OK: starter tarball extracted to ${path.relative(repoRoot, extractDir)}`);
