import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, hashFile, parseArgs, readJson, run } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));
const repoRoot = getRepoRoot();
const createPkg = await readJson(path.join(repoRoot, "templates", "create-function-kit", "package.json"));
const defaultTgz = path.join(
  "artifacts",
  "npm",
  "templates",
  "create-function-kit",
  `keyflow2-create-function-kit-${createPkg.version}.tgz`
);
const tgzArg = args.get("tgz") ?? positional[0] ?? defaultTgz;

if (typeof tgzArg !== "string") {
  console.error("Usage: node scripts/npm/verify-create-function-kit.mjs --tgz <path-to.tgz>");
  process.exit(2);
}

const tgzPath = path.resolve(repoRoot, tgzArg);
const outDir = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm/verify-create-function-kit"));
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
  "package/bin/create-function-kit.mjs",
];

const missing = required.filter((file) => !files.includes(file));
if (missing.length > 0) {
  console.error("[npm] ERROR: create cli tarball is missing required files:");
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

await run("tar", ["-xzf", tgzPath, "-C", extractDir]);
console.log(`[npm] OK: create cli tarball extracted to ${path.relative(repoRoot, extractDir)}`);
