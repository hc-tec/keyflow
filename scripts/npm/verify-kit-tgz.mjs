import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, hashFile, parseArgs, run } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const tgzArg = args.get("tgz") ?? positional[0];
if (!tgzArg || typeof tgzArg !== "string") {
  console.error("Usage: node scripts/npm/verify-kit-tgz.mjs --tgz <path-to.tgz> [--out <dir>]");
  process.exit(2);
}

const tgzPath = path.resolve(repoRoot, tgzArg);
const outDir = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm/verify"));
const extractDir = path.join(outDir, path.basename(tgzPath, ".tgz"));

await fs.mkdir(outDir, { recursive: true });
await fs.rm(extractDir, { recursive: true, force: true });
await fs.mkdir(extractDir, { recursive: true });

const dist = await hashFile(tgzPath);
console.log(`[npm] tgz: ${path.relative(repoRoot, tgzPath)}`);
console.log(`[npm] sizeBytes=${dist.sizeBytes} sha256=${dist.sha256}`);
console.log(`[npm] integrity=${dist.integrity}`);

const { stdout: list } = await run("tar", ["-tf", tgzPath]);
const files = list.split(/\r?\n/).filter(Boolean);
const hasManifest = files.includes("package/manifest.json");
if (!hasManifest) {
  console.error(`[npm] ERROR: missing package/manifest.json in tarball`);
  process.exit(1);
}

await run("tar", ["-xzf", tgzPath, "-C", extractDir]);
const manifestPath = path.join(extractDir, "package", "manifest.json");
try {
  await fs.access(manifestPath);
} catch {
  console.error(`[npm] ERROR: extracted manifest not found: ${manifestPath}`);
  process.exit(1);
}

console.log(`[npm] OK: manifest found and tarball extracted to: ${path.relative(repoRoot, extractDir)}`);

