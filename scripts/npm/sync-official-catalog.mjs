import path from "node:path";
import { getRepoRoot, parseArgs, run } from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();

const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const packagesFile = String(args.get("packages-file") ?? "catalog/official.packages.json");
const outFile = String(args.get("out-file") ?? "catalog/official.catalog.json");
const catalogName = String(args.get("catalog-name") ?? "@keyflow2/keyflow-kit-catalog");

const tokenFile = typeof args.get("token-file") === "string" ? String(args.get("token-file")) : null;
const dryRun = args.get("dry-run") === true;

async function main() {
  console.log("[npm] sync-official-catalog");
  console.log(`[npm] registry=${registry}`);
  console.log(`[npm] packagesFile=${packagesFile}`);
  console.log(`[npm] outFile=${outFile}`);
  console.log(`[npm] catalogName=${catalogName}`);

  await run("node", [
    path.join(repoRoot, "scripts", "npm", "generate-catalog-from-registry.mjs"),
    "--registry",
    registry,
    "--packages-file",
    packagesFile,
    "--out-file",
    outFile,
  ]);

  const publishArgs = [
    path.join(repoRoot, "scripts", "npm", "publish-catalog-package.mjs"),
    "--registry",
    registry,
    "--catalog",
    outFile,
    "--name",
    catalogName,
  ];
  if (dryRun) publishArgs.push("--dry-run");
  if (tokenFile) publishArgs.push("--token-file", tokenFile);

  await run("node", publishArgs);
}

await main();

