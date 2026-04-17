import fs from "node:fs/promises";
import path from "node:path";
import {
  artifactsRoot,
  buildNpmKitStage,
  computeTarballDist,
  packageRoot,
  parseArgs,
  resolveKitTarget,
  run,
  safeText,
  writeJson,
} from "./_workspace-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run pack:npm -- [--kit <kitId>] [--scope myorg] [--prefix keyflow-kit-] [--package-name @myorg/my-kit] [--dry-run]",
      "",
      "Output:",
      "  artifacts/npm/build/<kitId>/",
      "  artifacts/npm/tarballs/<kitId>/*.tgz",
      "  artifacts/npm/kit-packages.json",
      "",
      "Default:",
      "  If --scope and --package-name are omitted, packageName becomes keyflow-kit-<kitId>.",
    ].join("\n")
  );
}

if (args.get("help")) {
  usage();
  process.exit(0);
}

const kit = await resolveKitTarget(args.get("kit"));
const scope = safeText(args.get("scope"));
const prefix = safeText(args.get("prefix")) || "keyflow-kit-";
const packageName = safeText(args.get("package-name"));
const repository = safeText(args.get("repository"));
const homepage = safeText(args.get("homepage"));
const bugs = safeText(args.get("bugs"));
const dryRun = args.get("dry-run") === true;
const outRoot = path.resolve(packageRoot, safeText(args.get("out")) || path.join("artifacts", "npm"));

const stage = await buildNpmKitStage({
  kitId: kit.kitId,
  manifest: kit.manifest,
  kitDir: kit.kitDir,
  scope,
  prefix,
  packageName,
  repository,
  homepage,
  bugs,
  outRoot,
});

const metadataPath = path.join(outRoot, "kit-packages.json");

if (dryRun) {
  console.log(`[starter] kit          : ${stage.kitId}`);
  console.log(`[starter] packageName  : ${stage.packageName}`);
  console.log(`[starter] version      : ${stage.version}`);
  console.log(`[starter] buildDir     : ${stage.buildDir}`);
  console.log(`[starter] dry run only : npm pack not executed`);
  process.exit(0);
}

const { stdout } = await run("npm", ["pack", "--json"], { cwd: stage.buildDir });
const packed = JSON.parse(stdout);
const fileName = packed?.[0]?.filename;
if (!fileName) {
  throw new Error("[starter] npm pack did not return a filename.");
}

const tarballDir = path.join(outRoot, "tarballs", stage.kitId);
await fs.mkdir(tarballDir, { recursive: true });
const sourceTgz = path.join(stage.buildDir, fileName);
const targetTgz = path.join(tarballDir, fileName);
await fs.rm(targetTgz, { force: true });
await fs.rename(sourceTgz, targetTgz);

const dist = await computeTarballDist(targetTgz);
const metadata = {
  generatedAt: new Date().toISOString(),
  packages: [
    {
      kitId: stage.kitId,
      name: safeText(stage.manifest.name) || stage.kitId,
      version: stage.version,
      packageName: stage.packageName,
      buildDir: path.relative(packageRoot, stage.buildDir),
      tarballPath: path.relative(packageRoot, targetTgz),
      dist,
    },
  ],
};
await writeJson(metadataPath, metadata);

console.log(`[starter] npm package packed: ${targetTgz}`);
console.log(`[starter] metadata          : ${metadataPath}`);
