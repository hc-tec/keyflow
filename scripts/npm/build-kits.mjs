import fs from "node:fs/promises";
import path from "node:path";
import {
  copyDirFiltered,
  getRepoRoot,
  hashFile,
  parseArgs,
  readJson,
  resolvePackageName,
  run,
  writeJson,
} from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const kitsRoot = path.join(repoRoot, "TODO", "function-kits");
const outRoot = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm"));

const scope = args.get("scope") === true ? null : args.get("scope");
const prefix = args.get("prefix") === true ? "keyflow-kit-" : (args.get("prefix") ?? "keyflow-kit-");
const pack = args.get("pack") !== false;

const kitFilter = [];
const kitArg = args.get("kit");
if (typeof kitArg === "string") kitFilter.push(kitArg);

async function listKits() {
  const dirs = await fs.readdir(kitsRoot, { withFileTypes: true });
  const kits = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const kitDir = path.join(kitsRoot, d.name);
    const manifestPath = path.join(kitDir, "manifest.json");
    try {
      await fs.access(manifestPath);
    } catch {
      continue;
    }
    kits.push({ kitDir, dirName: d.name, manifestPath });
  }
  return kits;
}

function includeKit(kitId) {
  if (kitFilter.length === 0) return true;
  return kitFilter.includes(kitId);
}

async function main() {
  await fs.mkdir(outRoot, { recursive: true });

  const kits = await listKits();
  const built = [];

  for (const kit of kits) {
    const manifest = await readJson(kit.manifestPath);
    const kitId = String(manifest.id ?? kit.dirName);
    if (!includeKit(kitId)) continue;

    const version = String(manifest.version ?? "0.0.0");
    const packageName = resolvePackageName({ scope, prefix, kitId });

    const buildDir = path.join(outRoot, "build", kitId);
    await fs.rm(buildDir, { recursive: true, force: true });
    await fs.mkdir(buildDir, { recursive: true });

    await copyDirFiltered(kit.kitDir, buildDir);

    // Ensure license is present (npm UI expects it).
    const rootLicense = path.join(repoRoot, "LICENSE");
    try {
      await fs.copyFile(rootLicense, path.join(buildDir, "LICENSE"));
    } catch {
      // ignore
    }

    const pkg = {
      name: packageName,
      version,
      description: String(manifest.description ?? manifest.name ?? kitId),
      keywords: ["keyflow", "function-kit", "ime", "webview"],
      license: "Apache-2.0",
      repository: {
        type: "git",
        url: "git+https://github.com/hc-tec/keyflow.git",
      },
      bugs: {
        url: "https://github.com/hc-tec/keyflow/issues",
      },
      homepage: "https://github.com/hc-tec/keyflow#readme",
      keyflow: {
        kind: "function-kit",
        kitId,
        manifest: "manifest.json",
      },
    };

    await fs.writeFile(path.join(buildDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");

    let tgz = null;
    let dist = null;
    if (pack) {
      const { stdout } = await run("npm", ["pack", "--json"], { cwd: buildDir });
      const packed = JSON.parse(stdout);
      const fileName = packed?.[0]?.filename;
      if (!fileName) throw new Error(`npm pack did not return a filename for ${kitId}`);

      const localTgz = path.join(buildDir, fileName);
      const tarballDir = path.join(outRoot, "tarballs", kitId);
      await fs.mkdir(tarballDir, { recursive: true });
      tgz = path.join(tarballDir, fileName);
      await fs.rm(tgz, { force: true });
      await fs.rename(localTgz, tgz);

      dist = await hashFile(tgz);
    }

    built.push({
      kitId,
      name: String(manifest.name ?? kitId),
      version,
      packageName,
      buildDir: path.relative(repoRoot, buildDir),
      tarballPath: tgz ? path.relative(repoRoot, tgz) : null,
      dist,
    });
  }

  await writeJson(path.join(outRoot, "kit-packages.json"), {
    generatedAt: new Date().toISOString(),
    scope,
    prefix,
    kits: built,
  });

  console.log(`[npm] built ${built.length} kit package(s) into: ${path.relative(repoRoot, outRoot)}`);
  console.log(`[npm] metadata: ${path.relative(repoRoot, path.join(outRoot, "kit-packages.json"))}`);
}

await main();

