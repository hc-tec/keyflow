import fs from "node:fs/promises";
import path from "node:path";
import {
  artifactsRoot,
  buildNpmKitStage,
  parseArgs,
  quotePowerShellLiteral,
  resolveKitTarget,
  run,
  safeText,
} from "./_workspace-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run publish:npm -- [--kit <kitId>] [--scope yourscope] [--package-name @scope/name] [--registry https://registry.npmjs.org/] [--token-file tmp/npm-token.txt]",
      "",
      "Notes:",
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

  console.log(`[starter] publish package : ${stage.packageName}@${stage.version}`);
  console.log(`[starter] registry        : ${registry}`);
  await run("npm", publishArgs, { cwd: stage.buildDir, stdio: "inherit" });
} finally {
  await fs.rm(npmrcPath, { force: true });
}
