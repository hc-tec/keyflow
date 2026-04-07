import fs from "node:fs/promises";
import path from "node:path";
import { downloadToFile, getRepoRoot, hashFile, parseArgs, run } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const pkgArg = args.get("pkg") ?? positional[0];
if (!pkgArg || typeof pkgArg !== "string") {
  console.error(
    "Usage: node scripts/npm/verify-npm-catalog.mjs --pkg <name>@<version> [--registry <url>] [--out <dir>]"
  );
  process.exit(2);
}

const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const outDir = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm/verify"));
await fs.mkdir(outDir, { recursive: true });

const { stdout: viewOut } = await run("npm", ["view", pkgArg, "--registry", registry, "--json"]);
const meta = JSON.parse(viewOut);
const dist = meta?.dist;
if (!dist?.tarball || !dist?.integrity) {
  console.error(`[npm] ERROR: missing dist.tarball/dist.integrity for ${pkgArg}`);
  process.exit(1);
}

const tarballUrl = String(dist.tarball);
const integrity = String(dist.integrity);

console.log(`[npm] pkg=${pkgArg}`);
console.log(`[npm] registry=${registry}`);
console.log(`[npm] tarball=${tarballUrl}`);
console.log(`[npm] integrity=${integrity}`);

const fileSafe = pkgArg.replaceAll("/", "__").replaceAll("@", "").replaceAll(":", "_");
const tgzPath = path.join(outDir, `${fileSafe}.tgz`);

await downloadToFile(tarballUrl, tgzPath);

const actual = await hashFile(tgzPath);
if (actual.integrity !== integrity) {
  console.error(`[npm] ERROR: integrity mismatch`);
  console.error(`[npm] expected=${integrity}`);
  console.error(`[npm] actual=${actual.integrity}`);
  process.exit(1);
}
console.log(`[npm] OK: integrity matched`);

await run("node", [path.join(repoRoot, "scripts", "npm", "verify-catalog-tgz.mjs"), "--tgz", tgzPath, "--out", outDir]);
