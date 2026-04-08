import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, hashFile, readJson, run, writeJson } from "./_lib.mjs";

const repoRoot = getRepoRoot();
const packageDir = path.join(repoRoot, "templates", "create-function-kit");
const outRoot = path.join(repoRoot, "artifacts", "npm", "templates", "create-function-kit");

await fs.mkdir(outRoot, { recursive: true });

const pkg = await readJson(path.join(packageDir, "package.json"));
const { stdout } = await run("npm", ["pack", "--json"], { cwd: packageDir });
const packed = JSON.parse(stdout);
const fileName = packed?.[0]?.filename;

if (!fileName) {
  throw new Error("[npm] npm pack did not return a filename for create-function-kit.");
}

const sourceTgz = path.join(packageDir, fileName);
const targetTgz = path.join(outRoot, fileName);
await fs.rm(targetTgz, { force: true });
await fs.rename(sourceTgz, targetTgz);

const dist = await hashFile(targetTgz);
await writeJson(path.join(outRoot, "create-function-kit.json"), {
  generatedAt: new Date().toISOString(),
  packageName: pkg.name,
  version: pkg.version,
  sourceDir: path.relative(repoRoot, packageDir),
  tarballPath: path.relative(repoRoot, targetTgz),
  dist,
});

console.log(`[npm] create cli: ${pkg.name}@${pkg.version}`);
console.log(`[npm] tarball: ${path.relative(repoRoot, targetTgz)}`);
