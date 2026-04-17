import path from "node:path";
import {
  artifactsRoot,
  parseArgs,
  readJson,
  resolveKitTarget,
  resolvePackageName,
  safeText,
  writeJson,
} from "./_workspace-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run catalog:entry -- [--kit <kitId>] [--scope myorg] [--package-name @myorg/my-kit]",
      "",
      "Purpose:",
      "  Generate a local JSON/Markdown snippet for official catalog PR/Issue submission.",
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
const packageName = resolvePackageName({
  scope,
  prefix,
  kitId: kit.kitId,
  packageName: args.get("package-name"),
});
const version = safeText(kit.manifest.version) || "0.0.0";
const outRoot = path.resolve(path.join(artifactsRoot, ".."), safeText(args.get("out")) || path.join(artifactsRoot, "catalog"));
const outputPath = path.join(outRoot, `${kit.kitId}.catalog-entry.json`);

const entry = {
  generatedAt: new Date().toISOString(),
  kitId: kit.kitId,
  packageName,
  version,
  name: safeText(kit.manifest.name) || kit.kitId,
  description: safeText(kit.manifest.description),
  runtimePermissions: Array.isArray(kit.manifest.runtimePermissions)
    ? kit.manifest.runtimePermissions.map((item) => safeText(item)).filter(Boolean)
    : [],
  platforms: Array.isArray(kit.manifest.platforms) ? kit.manifest.platforms : [],
  nextSteps: [
    "1. Publish the npm package if you have not done so yet.",
    "2. Run catalog:check and make sure the published tarball/manifest validation passes.",
    "3. Submit this package name + version to the official catalog PR/Issue flow.",
    "4. Keep kitId globally unique; recommended format is <npmScope>.<kitSlug>.",
  ],
  officialCatalogSubmission: {
    packagesJsonLine: packageName,
    markdown: [
      `- npm package: \`${packageName}@${version}\``,
      `- kitId: \`${kit.kitId}\``,
      `- name: ${safeText(kit.manifest.name) || kit.kitId}`,
      `- runtimePermissions: ${(Array.isArray(kit.manifest.runtimePermissions) ? kit.manifest.runtimePermissions : []).join(", ") || "(none)"}`,
      safeText(kit.manifest.description) ? `- description: ${safeText(kit.manifest.description)}` : null,
    ].filter(Boolean),
  },
};

await writeJson(outputPath, entry);

console.log(`[starter] catalog entry file: ${outputPath}`);
console.log(`[starter] submit package     : ${packageName}@${version}`);
