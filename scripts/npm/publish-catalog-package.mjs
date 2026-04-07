import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, parseArgs, readJson, run, writeJson } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();

const catalogArg = args.get("catalog") ?? positional[0];
if (!catalogArg || typeof catalogArg !== "string") {
  console.error(
    [
      "Usage:",
      "  node scripts/npm/publish-catalog-package.mjs --catalog catalog/official.catalog.json --name @keyflow2/keyflow-kit-catalog",
      "",
      "Options:",
      "  --registry <url>       (default: https://registry.npmjs.org/)",
      "  --token-file <path>   read token from file (recommended)",
      "  --dry-run             npm publish --dry-run",
      "  --otp <code>          2FA OTP (if required)",
      "  --name <pkg>          catalog package name",
      "  --version <semver>    override version (otherwise auto bump patch)",
      "  --out <dir>           output build root (default: artifacts/npm)",
    ].join("\n")
  );
  process.exit(2);
}

const catalogPath = path.resolve(repoRoot, String(catalogArg));
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const dryRun = args.get("dry-run") === true;
const otp = typeof args.get("otp") === "string" ? String(args.get("otp")) : null;
const name = String(args.get("name") ?? "@keyflow2/keyflow-kit-catalog");
const explicitVersion = typeof args.get("version") === "string" ? String(args.get("version")) : null;

const outRoot = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm"));
const buildDir = path.join(outRoot, "build-catalog");

const tokenFile = typeof args.get("token-file") === "string" ? String(args.get("token-file")) : null;
let token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token && tokenFile) {
  const tokenPath = path.resolve(repoRoot, tokenFile);
  const raw = await fs.readFile(tokenPath, "utf8");
  token = raw.startsWith("\uFEFF") ? raw.slice(1).trim() : raw.trim();
}

async function getNextVersion() {
  if (explicitVersion) return explicitVersion;
  try {
    const { stdout } = await run("npm", ["view", name, "version", "--registry", registry]);
    const v = String(stdout).trim();
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m) throw new Error(`Cannot auto-bump non-x.y.z version: ${v}`);
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = Number(m[3]) + 1;
    return `${major}.${minor}.${patch}`;
  } catch (e) {
    // If package doesn't exist yet, start at 0.0.1
    if (String(e?.stderr ?? e?.message ?? "").includes("E404")) return "0.0.1";
    return "0.0.1";
  }
}

async function main() {
  // Validate catalog JSON early.
  const catalog = await readJson(catalogPath);
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.packages)) {
    throw new Error(`[npm] Invalid catalog: missing packages[]: ${path.relative(repoRoot, catalogPath)}`);
  }

  const version = await getNextVersion();

  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(buildDir, { recursive: true });

  await fs.copyFile(catalogPath, path.join(buildDir, "catalog.json"));

  const pkgJson = {
    name,
    version,
    description: "Keyflow Function Kit Catalog (generated).",
    keywords: ["keyflow", "function-kit", "catalog", "ime"],
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/hc-tec/keyflow.git",
    },
    bugs: {
      url: "https://github.com/hc-tec/keyflow/issues",
    },
    homepage: "https://github.com/hc-tec/keyflow#readme",
    files: ["catalog.json"],
    keyflow: {
      kind: "function-kit-catalog",
      catalog: "catalog.json",
      format: String(catalog.kind ?? "unknown"),
    },
  };

  await fs.writeFile(path.join(buildDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n", "utf8");

  await writeJson(path.join(outRoot, "catalog-package.json"), {
    generatedAt: new Date().toISOString(),
    name,
    version,
    registry,
    catalogPath: path.relative(repoRoot, catalogPath),
    buildDir: path.relative(repoRoot, buildDir),
  });

  console.log(`[npm] catalog package: ${name}@${version}`);
  console.log(`[npm] buildDir: ${path.relative(repoRoot, buildDir)}`);

  const publishArgs = ["publish", "--registry", registry];
  if (String(name).startsWith("@")) publishArgs.push("--access", "public");
  if (dryRun) publishArgs.push("--dry-run");
  if (otp) publishArgs.push("--otp", otp);

  const npmrcPath = path.join(buildDir, ".npmrc");
  try {
    if (token) {
      const reg = new URL(registry);
      let authPath = reg.pathname || "/";
      if (!authPath.endsWith("/")) authPath += "/";
      const authLine = `//${reg.host}${authPath}:_authToken=${token}`;
      const npmrc = `registry=${registry}\nalways-auth=true\n${authLine}\n`;
      await fs.writeFile(npmrcPath, npmrc, "utf8");
    } else if (!dryRun) {
      console.warn("[npm] NOTE: token not provided; relying on existing npm login (~/.npmrc).");
    }

    await run("npm", publishArgs, { cwd: buildDir });
  } finally {
    await fs.rm(npmrcPath, { force: true });
  }

  console.log("[npm] done: published catalog package");
}

await main();

