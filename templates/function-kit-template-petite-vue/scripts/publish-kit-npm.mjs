import fs from "node:fs/promises";
import path from "node:path";
import {
  artifactsRoot,
  buildNpmKitStage,
  parseArgs,
  resolveKitTarget,
  run,
  safeText,
} from "./_workspace-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run publish:npm -- [--kit <kitId>] [--scope myorg] [--package-name @myorg/my-kit] [--registry https://registry.npmjs.org/] [--token-file tmp/npm-token.txt]",
      "",
      "Notes:",
      "  - If --scope and --package-name are omitted, packageName defaults to keyflow-kit-<kitId>.",
      "  - Publishing still requires an npm account and token/login.",
      "  - Scoped packages will be published with --access public.",
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
const registry = safeText(args.get("registry")) || "https://registry.npmjs.org/";
const dryRun = args.get("dry-run") === true;
const otp = safeText(args.get("otp"));
const tokenFile = safeText(args.get("token-file"));
const outRoot = path.resolve(path.join(artifactsRoot, ".."), safeText(args.get("out")) || path.join(artifactsRoot, "npm"));

let token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN || "";
if (!token && tokenFile) {
  const tokenPath = path.resolve(process.cwd(), tokenFile);
  const raw = await fs.readFile(tokenPath, "utf8");
  token = raw.startsWith("\uFEFF") ? raw.slice(1).trim() : raw.trim();
}

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

async function verifyPublishAuth() {
  if (dryRun) {
    return;
  }
  try {
    const result = await run("npm", ["whoami", "--registry", registry], { cwd: stage.buildDir });
    const username = safeText(result.stdout);
    console.log(`[starter] npm auth        : ${username || "verified"}`);
    if (stage.packageName.startsWith("@")) {
      const packageScope = stage.packageName.split("/")[0];
      console.log(`[starter] publish scope    : ${packageScope} (account must already have publish rights)`);
    }
  } catch (error) {
    throw new Error(
      [
        `[starter] npm auth check failed before publishing ${stage.packageName}@${stage.version}.`,
        "[starter] Publishing is not open to any random account.",
        "[starter] You still need:",
        "[starter]   1. an npm account",
        "[starter]   2. publish rights on the target package / scope",
        "[starter]   3. one of: --token-file, NPM_TOKEN, NODE_AUTH_TOKEN, or npm login",
        `[starter] Registry: ${registry}`,
        "",
        String(error?.message || error),
      ].join("\n")
    );
  }
}

const publishArgs = ["publish", "--registry", registry];
if (stage.packageName.startsWith("@")) {
  publishArgs.push("--access", "public");
}
if (dryRun) {
  publishArgs.push("--dry-run");
}
if (otp) {
  publishArgs.push("--otp", otp);
}

const npmrcPath = path.join(stage.buildDir, ".npmrc");

try {
  if (token) {
    const registryUrl = new URL(registry);
    let authPath = registryUrl.pathname || "/";
    if (!authPath.endsWith("/")) authPath += "/";
    const npmrcLines = [
      `registry=${registry}`,
      "always-auth=true",
      `//${registryUrl.host}${authPath}:_authToken=${token}`,
    ];
    await fs.writeFile(npmrcPath, npmrcLines.join("\n") + "\n", "utf8");
  } else if (!dryRun) {
    console.warn("[starter] NOTE: token not provided; relying on existing npm login (~/.npmrc).");
  }

  await verifyPublishAuth();
  console.log(`[starter] publish package : ${stage.packageName}@${stage.version}`);
  console.log(`[starter] registry        : ${registry}`);
  await run("npm", publishArgs, { cwd: stage.buildDir, stdio: "inherit" });
} finally {
  await fs.rm(npmrcPath, { force: true });
}
