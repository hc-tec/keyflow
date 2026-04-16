import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, hashFile, readJson, run, writeJson } from "./_lib.mjs";

const repoRoot = getRepoRoot();
const templateDir = path.join(repoRoot, "templates", "function-kit-template-preview-rewrite");
const outRoot = path.join(repoRoot, "artifacts", "npm", "templates", "function-kit-template-preview-rewrite");

await fs.mkdir(outRoot, { recursive: true });

const pkg = await readJson(path.join(templateDir, "package.json"));
const { stdout } = await run("npm", ["pack", "--json"], { cwd: templateDir });
const packed = JSON.parse(stdout);
const fileName = packed?.[0]?.filename;

if (!fileName) {
  throw new Error("[npm] npm pack did not return a filename for the preview-rewrite starter template.");
}

const sourceTgz = path.join(templateDir, fileName);
const targetTgz = path.join(outRoot, fileName);
await fs.rm(targetTgz, { force: true });
await fs.rename(sourceTgz, targetTgz);

const dist = await hashFile(targetTgz);
await writeJson(path.join(outRoot, "preview-rewrite-template.json"), {
  generatedAt: new Date().toISOString(),
  packageName: pkg.name,
  version: pkg.version,
  sourceDir: path.relative(repoRoot, templateDir),
  tarballPath: path.relative(repoRoot, targetTgz),
  dist,
});

console.log(`[npm] preview-rewrite starter template: ${pkg.name}@${pkg.version}`);
console.log(`[npm] tarball: ${path.relative(repoRoot, targetTgz)}`);
