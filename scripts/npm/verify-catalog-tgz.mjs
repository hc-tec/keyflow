import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, hashFile, parseArgs, readJson, run } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const tgzArg = args.get("tgz") ?? positional[0];
if (!tgzArg || typeof tgzArg !== "string") {
  console.error("Usage: node scripts/npm/verify-catalog-tgz.mjs --tgz <path-to.tgz> [--out <dir>]");
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
const catalogPathInTgz = "package/catalog.json";
if (!files.includes(catalogPathInTgz)) {
  console.error(`[npm] ERROR: missing ${catalogPathInTgz} in tarball`);
  process.exit(1);
}

await run("tar", ["-xzf", tgzPath, "-C", extractDir, catalogPathInTgz]);
const extracted = path.join(extractDir, "package", "catalog.json");
await fs.access(extracted);

// Parse JSON to catch broken files early.
const catalog = await readJson(extracted);
if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.packages)) {
  console.error(`[npm] ERROR: catalog.json missing packages[]`);
  process.exit(1);
}

if (String(catalog.kind ?? "") !== "keyflow.npm.catalog.v0") {
  console.error(`[npm] ERROR: unexpected catalog.kind: ${String(catalog.kind ?? "")}`);
  process.exit(1);
}

function normalizeRelativePackagePath(raw) {
  const normalized = String(raw ?? "")
    .replaceAll("\\", "/")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^package\//, "");
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

for (const p of catalog.packages) {
  const kitId = String(p?.kitId ?? "");
  const npmName = String(p?.npm?.name ?? "");
  const npmVersion = String(p?.npm?.version ?? "");
  if (!kitId || !npmName || !npmVersion) {
    console.error(`[npm] ERROR: invalid package entry (need kitId + npm.name + npm.version)`);
    console.error(JSON.stringify(p, null, 2));
    process.exit(1);
  }

  const iconCandidates = [];
  const icon = normalizeRelativePackagePath(p?.icon);
  if (icon) iconCandidates.push(icon);
  const icons = p?.icons;
  if (icons && typeof icons === "object" && !Array.isArray(icons)) {
    for (const value of Object.values(icons)) {
      const normalized = normalizeRelativePackagePath(value);
      if (normalized) iconCandidates.push(normalized);
    }
  }

  for (const relative of [...new Set(iconCandidates)]) {
    const packagePath = `package/${relative}`;
    if (!files.includes(packagePath)) {
      console.error(`[npm] ERROR: missing icon sidecar referenced by catalog: ${packagePath}`);
      process.exit(1);
    }
  }
}

console.log(`[npm] OK: catalog.json parsed (packages=${catalog.packages.length})`);
console.log(`[npm] extracted to: ${path.relative(repoRoot, extractDir)}`);
