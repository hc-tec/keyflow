import path from "node:path";
import { getRepoRoot, parseArgs, parsePackageSpec, readJson, writeJson } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));
const repoRoot = getRepoRoot();
const packagesFile = path.resolve(repoRoot, String(args.get("packages-file") ?? "catalog/official.packages.json"));
const incomingSpecs = positional.filter((item) => typeof item === "string" && item.trim().length > 0);

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/npm/add-official-package.mjs @scope/keyflow-kit-demo@0.1.0 [more-specs...]",
      "",
      "Options:",
      "  --packages-file <path>   target JSON array file (default: catalog/official.packages.json)",
      "",
      "Behavior:",
      "  - add a new package spec if npm package name is not present yet",
      "  - replace the existing spec if the same npm package name already exists with another version",
      "  - keep the file sorted by npm package name for stable diffs",
    ].join("\n")
  );
}

if (args.get("help") || incomingSpecs.length === 0) {
  usage();
  process.exit(args.get("help") ? 0 : 2);
}

const current = await readJson(packagesFile);
if (!Array.isArray(current)) {
  throw new Error(`[npm] packages-file must be a JSON array: ${path.relative(repoRoot, packagesFile)}`);
}

const currentByName = new Map();
for (const value of current) {
  const parsed = parsePackageSpec(value);
  if (currentByName.has(parsed.name)) {
    throw new Error(
      `[npm] Duplicate npm package already present in ${path.relative(repoRoot, packagesFile)}: ${parsed.name}`
    );
  }
  currentByName.set(parsed.name, parsed.spec);
}

const changes = [];
for (const rawSpec of incomingSpecs) {
  const parsed = parsePackageSpec(rawSpec);
  const previous = currentByName.get(parsed.name);
  if (!previous) {
    currentByName.set(parsed.name, parsed.spec);
    changes.push({ kind: "added", name: parsed.name, next: parsed.spec });
    continue;
  }
  if (previous === parsed.spec) {
    changes.push({ kind: "unchanged", name: parsed.name, next: parsed.spec });
    continue;
  }
  currentByName.set(parsed.name, parsed.spec);
  changes.push({ kind: "updated", name: parsed.name, previous, next: parsed.spec });
}

const nextSpecs = [...currentByName.values()].sort((left, right) => {
  const leftParsed = parsePackageSpec(left);
  const rightParsed = parsePackageSpec(right);
  return leftParsed.name.localeCompare(rightParsed.name) || leftParsed.version.localeCompare(rightParsed.version);
});

await writeJson(packagesFile, nextSpecs);

console.log(`[npm] updated: ${path.relative(repoRoot, packagesFile)}`);
for (const change of changes) {
  if (change.kind === "added") {
    console.log(`[npm] added   : ${change.next}`);
    continue;
  }
  if (change.kind === "updated") {
    console.log(`[npm] updated : ${change.previous} -> ${change.next}`);
    continue;
  }
  console.log(`[npm] unchanged: ${change.next}`);
}
