import fs from "node:fs/promises";
import path from "node:path";
import { downloadToFile, getRepoRoot, hashFile, parseArgs, readJson, run, writeJson } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");

const outFileArg = args.get("out-file");
const outFile = path.resolve(repoRoot, String(outFileArg ?? "catalog/official.catalog.json"));

const packagesFileArg = args.get("packages-file");
const packagesFile = packagesFileArg ? path.resolve(repoRoot, String(packagesFileArg)) : null;

const pkgArg = args.get("pkg");

const pkgSpecs = [];
if (typeof pkgArg === "string") pkgSpecs.push(pkgArg);
pkgSpecs.push(...positional.filter((p) => typeof p === "string" && p.trim().length > 0));

if (packagesFile) {
  const list = await readJson(packagesFile);
  if (!Array.isArray(list)) {
    console.error(`[npm] ERROR: packages-file must be a JSON array of package specs: ${path.relative(repoRoot, packagesFile)}`);
    process.exit(2);
  }
  for (const v of list) {
    if (typeof v === "string" && v.trim().length > 0) pkgSpecs.push(v.trim());
  }
}

if (pkgSpecs.length === 0) {
  console.error(
    [
      "Usage:",
      "  node scripts/npm/generate-catalog-from-registry.mjs --packages-file catalog/official.packages.json",
      "  node scripts/npm/generate-catalog-from-registry.mjs --out-file catalog/my.catalog.json <pkg>@<ver> [more...]",
      "",
      "Options:",
      "  --registry <url>          npm registry (default: https://registry.npmjs.org/)",
      "  --packages-file <path>    JSON array of package specs",
      "  --out-file <path>         output catalog JSON path",
    ].join("\n")
  );
  process.exit(2);
}

function fileSafe(s) {
  return String(s).replaceAll("/", "__").replaceAll("@", "_").replaceAll(":", "_");
}

async function download(tarballUrl, tgzPath) {
  await downloadToFile(tarballUrl, tgzPath);
}

async function extractManifest(tgzPath, extractDir) {
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", tgzPath, "-C", extractDir, "package/manifest.json"]);
  return path.join(extractDir, "package", "manifest.json");
}

async function main() {
  const entries = [];

  for (const spec of pkgSpecs) {
    const { stdout: viewOut } = await run("npm", ["view", spec, "--registry", registry, "--json"]);
    const meta = JSON.parse(viewOut);
    const dist = meta?.dist;

    const pkgName = String(meta?.name ?? "");
    const pkgVersion = String(meta?.version ?? "");
    if (!pkgName || !pkgVersion) throw new Error(`[npm] Invalid npm metadata for ${spec}`);
    if (!dist?.tarball || !dist?.integrity) {
      throw new Error(`[npm] Missing dist.tarball/dist.integrity for ${spec}`);
    }

    const tarballUrl = String(dist.tarball);
    const expectedIntegrity = String(dist.integrity);

    const cacheDir = path.join(repoRoot, "artifacts", "npm", "catalog-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const tgzPath = path.join(cacheDir, `${fileSafe(`${pkgName}@${pkgVersion}`)}.tgz`);
    await download(tarballUrl, tgzPath);

    const actual = await hashFile(tgzPath);
    if (actual.integrity !== expectedIntegrity) {
      throw new Error(
        `[npm] Integrity mismatch for ${pkgName}@${pkgVersion}\nexpected=${expectedIntegrity}\nactual=${actual.integrity}`
      );
    }

    const extractDir = path.join(cacheDir, `${fileSafe(`${pkgName}@${pkgVersion}`)}.extract`);
    const manifestPath = await extractManifest(tgzPath, extractDir);
    const manifest = await readJson(manifestPath);

    const kitId = String(manifest?.id ?? "");
    if (!kitId) throw new Error(`[npm] Missing manifest.id in ${pkgName}@${pkgVersion}`);

    const manifestVersion = manifest?.version != null ? String(manifest.version) : null;
    if (manifestVersion && manifestVersion !== pkgVersion) {
      throw new Error(
        `[npm] Version mismatch for ${pkgName}@${pkgVersion}: manifest.version=${manifestVersion} npm.version=${pkgVersion}`
      );
    }

    entries.push({
      kitId,
      name: String(manifest?.name ?? kitId),
      version: pkgVersion,
      npm: { name: pkgName, version: pkgVersion },
      dist: {
        tarball: tarballUrl,
        integrity: expectedIntegrity,
        sha256: actual.sha256,
        sizeBytes: actual.sizeBytes,
      },
    });
  }

  // Deterministic order for stable diffs.
  entries.sort((a, b) => String(a.kitId).localeCompare(String(b.kitId)));

  const catalog = {
    kind: "keyflow.npm.catalog.v0",
    generatedAt: new Date().toISOString(),
    registry,
    packages: entries,
  };

  await writeJson(outFile, catalog);
  console.log(`[npm] wrote: ${path.relative(repoRoot, outFile)}`);
  console.log(`[npm] packages: ${entries.length}`);
}

await main();
