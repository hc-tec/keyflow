import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, parseArgs, readJson, run, writeJson } from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const outRoot = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm"));

const kitArg = typeof args.get("kit") === "string" ? String(args.get("kit")) : null;
const rawScope = args.get("scope");
if (rawScope === true) {
  console.error("[npm] ERROR: --scope requires a value.");
  console.error("[npm] On PowerShell, avoid leading '@' (splat). Use: --scope keyflow2");
  console.error("[npm] Or quote it: --scope '@keyflow2'");
  process.exit(2);
}
const scope = rawScope === false ? null : rawScope;
const prefix = args.get("prefix") === true ? "keyflow-kit-" : (args.get("prefix") ?? "keyflow-kit-");

function pkgNameToManifestPath(pkgName, installDir) {
  // Examples:
  // - keyflow-kit-foo          -> node_modules/keyflow-kit-foo/manifest.json
  // - @hc-tec/keyflow-kit-foo  -> node_modules/@hc-tec/keyflow-kit-foo/manifest.json
  const parts = pkgName.split("/");
  return path.join(installDir, "node_modules", ...parts, "manifest.json");
}

async function main() {
  console.log("[npm] smoke-local: build -> verify tgz -> npm install");

  const buildArgs = [path.join(repoRoot, "scripts", "npm", "build-kits.mjs"), "--out", outRoot];
  if (kitArg) buildArgs.push("--kit", kitArg);
  if (scope) buildArgs.push("--scope", String(scope));
  if (prefix) buildArgs.push("--prefix", String(prefix));
  await run("node", buildArgs);

  const metaPath = path.join(outRoot, "kit-packages.json");
  const meta = await readJson(metaPath);
  const kits = Array.isArray(meta?.kits) ? meta.kits : [];
  if (kits.length === 0) throw new Error("No kits found in kit-packages.json");

  const results = [];

  for (const kit of kits) {
    const tgzPath = kit.tarballPath ? path.resolve(repoRoot, kit.tarballPath) : null;
    if (!tgzPath) throw new Error(`Missing tarballPath for kitId=${kit.kitId}`);

    await run("node", [
      path.join(repoRoot, "scripts", "npm", "verify-kit-tgz.mjs"),
      "--tgz",
      tgzPath,
      "--out",
      path.join(outRoot, "verify"),
    ]);

    const installDir = path.join(outRoot, "smoke-install", kit.kitId);
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.mkdir(installDir, { recursive: true });
    await writeJson(path.join(installDir, "package.json"), { name: "keyflow-kit-smoke", private: true });

    await run("npm", ["install", tgzPath, "--silent"], { cwd: installDir });

    const manifestPath = pkgNameToManifestPath(kit.packageName, installDir);
    await fs.access(manifestPath);

    console.log(`[npm] OK: installed ${kit.packageName} (manifest ok)`);
    results.push({ kitId: kit.kitId, packageName: kit.packageName, version: kit.version });
  }

  await writeJson(path.join(outRoot, "smoke-local.json"), {
    generatedAt: new Date().toISOString(),
    kits: results,
  });
  console.log(`[npm] wrote: ${path.relative(repoRoot, path.join(outRoot, "smoke-local.json"))}`);
}

await main();
