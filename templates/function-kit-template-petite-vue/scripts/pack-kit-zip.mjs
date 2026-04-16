import fs from "node:fs/promises";
import path from "node:path";
import {
  artifactsRoot,
  computeTarballDist,
  copyDirectoryContentsFiltered,
  ensureCleanDir,
  parseArgs,
  quotePowerShellLiteral,
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
      "  npm run pack:zip -- [--kit <kitId>] [--dry-run]",
      "",
      "Output:",
      "  artifacts/zip/<kitId>/<kitId>-<version>.zip",
      "  artifacts/zip/<kitId>/<kitId>-<version>.json",
    ].join("\n")
  );
}

if (args.get("help")) {
  usage();
  process.exit(0);
}

async function createZip(sourceDir, outputFile) {
  await fs.rm(outputFile, { force: true });
  if (process.platform === "win32") {
    const command = `Compress-Archive -LiteralPath ${quotePowerShellLiteral(sourceDir)} -DestinationPath ${quotePowerShellLiteral(outputFile)} -Force`;
    await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { stdio: "inherit" });
    return;
  }
  const parentDir = path.dirname(sourceDir);
  const baseName = path.basename(sourceDir);
  await run("zip", ["-qr", outputFile, baseName], { cwd: parentDir, stdio: "inherit" });
}

const kit = await resolveKitTarget(args.get("kit"));
const dryRun = args.get("dry-run") === true;
const outRoot = path.resolve(path.join(artifactsRoot, ".."), safeText(args.get("out")) || path.join(artifactsRoot, "zip"));
const version = safeText(kit.manifest.version) || "0.0.0";
const zipName = `${kit.kitId}-${version}.zip`;
const packageDir = path.join(outRoot, kit.kitId);
const stageRoot = path.join(packageDir, ".stage");
const stageDir = path.join(stageRoot, kit.kitId);
const outputFile = path.join(packageDir, zipName);
const metadataFile = path.join(packageDir, `${kit.kitId}-${version}.json`);

if (dryRun) {
  console.log(`[starter] zip package : ${outputFile}`);
  console.log(`[starter] source kit  : ${kit.kitDir}`);
  process.exit(0);
}

await ensureCleanDir(stageDir);
await copyDirectoryContentsFiltered(kit.kitDir, stageDir);
await fs.mkdir(packageDir, { recursive: true });
await createZip(path.join(stageRoot, kit.kitId), outputFile);

const dist = await computeTarballDist(outputFile);
await writeJson(metadataFile, {
  generatedAt: new Date().toISOString(),
  kitId: kit.kitId,
  name: safeText(kit.manifest.name) || kit.kitId,
  version,
  zipPath: outputFile,
  dist,
});

console.log(`[starter] zip package packed: ${outputFile}`);
console.log(`[starter] metadata         : ${metadataFile}`);
