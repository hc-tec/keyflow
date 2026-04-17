import path from "node:path";
import {
  artifactsRoot,
  parseArgs,
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
      "  Generate a local helper JSON for the official catalog PR/Issue description.",
      "  This JSON is not an official repository submission file.",
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
const packageSpec = `${packageName}@${version}`;
const outRoot = path.resolve(path.join(artifactsRoot, ".."), safeText(args.get("out")) || path.join(artifactsRoot, "catalog"));
const outputPath = path.join(outRoot, `${kit.kitId}.catalog-entry.json`);

const entry = {
  generatedAt: new Date().toISOString(),
  localHelperOnly: true,
  doNotSubmitThisJson: true,
  kitId: kit.kitId,
  packageName,
  version,
  packageSpec,
  name: safeText(kit.manifest.name) || kit.kitId,
  description: safeText(kit.manifest.description),
  runtimePermissions: Array.isArray(kit.manifest.runtimePermissions)
    ? kit.manifest.runtimePermissions.map((item) => safeText(item)).filter(Boolean)
    : [],
  platforms: Array.isArray(kit.manifest.platforms) ? kit.manifest.platforms : [],
  nextSteps: [
    "1. Publish the npm package for real; pack:npm and publish:npm --dry-run are not enough.",
    `2. Run npm view ${packageSpec} and catalog:check; both must pass against the real npm registry package.`,
    `3. For a PR, only edit catalog/official.packages.json in the official repo and add the string ${JSON.stringify(packageSpec)}.`,
    "4. Paste the catalog:check Markdown, or the markdown fields in this helper JSON, into the PR description or Kit Submission issue.",
    "5. Do not commit artifacts/catalog/*.json to the official repository.",
    "6. Keep kitId globally unique; recommended format is <npmScope>.<kitSlug>.",
  ],
  officialCatalogSubmission: {
    officialRepoFile: "catalog/official.packages.json",
    packagesJsonLine: packageSpec,
    packagesJsonEntry: packageSpec,
    commitThisJson: false,
    expectedPrChange: `Add ${JSON.stringify(packageSpec)} to the catalog/official.packages.json JSON array.`,
    markdown: [
      `- npm package: \`${packageSpec}\``,
      `- kitId: \`${kit.kitId}\``,
      `- name: ${safeText(kit.manifest.name) || kit.kitId}`,
      `- runtimePermissions: ${(Array.isArray(kit.manifest.runtimePermissions) ? kit.manifest.runtimePermissions : []).join(", ") || "(none)"}`,
      safeText(kit.manifest.description) ? `- description: ${safeText(kit.manifest.description)}` : null,
    ].filter(Boolean),
  },
};

await writeJson(outputPath, entry);

console.log(`[starter] local helper json : ${outputPath}`);
console.log(`[starter] package spec      : ${packageSpec}`);
console.log("[starter] official PR file  : catalog/official.packages.json");
console.log(`[starter] add JSON string   : ${JSON.stringify(packageSpec)}`);
console.log("[starter] do not submit this JSON file to the official repo.");
