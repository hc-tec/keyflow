import fs from "node:fs/promises";
import path from "node:path";
import {
  getRepoRoot,
  parseArgs,
  parsePackageSpec,
  readJson,
  run,
  writeJson,
} from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));
const repoRoot = getRepoRoot();
const packagesFile = path.resolve(repoRoot, String(args.get("packages-file") ?? "catalog/official.packages.json"));
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const baseFileArg = args.get("base-file");
const baseRef = typeof args.get("base-ref") === "string" ? String(args.get("base-ref")) : "";
const allowRemovals = args.get("allow-removals") === true;
const outRoot = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm/catalog-submission"));
const generatedCatalogPath = path.join(outRoot, "official.catalog.json");
const generatedAssetsDir = path.join(outRoot, "official.catalog.assets");
const reportJsonPath = path.join(outRoot, "catalog-submission-report.json");
const summaryPath = path.join(outRoot, "catalog-submission-summary.md");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/npm/validate-official-catalog-submission.mjs --base-ref origin/main",
      "",
      "Options:",
      "  --packages-file <path>   target JSON array file (default: catalog/official.packages.json)",
      "  --base-file <path>       compare against another JSON array file",
      "  --base-ref <git-ref>     compare against a git ref (for PR validation)",
      "  --registry <url>         npm registry (default: https://registry.npmjs.org/)",
      "  --out <dir>              output directory for generated catalog + reports",
      "  --allow-removals         do not fail if packages were removed from official.packages.json",
    ].join("\n")
  );
}

if (args.get("help")) {
  usage();
  process.exit(0);
}

function push(results, level, label, detail = "") {
  results.push({ level, label, detail });
}

function printResults(results) {
  const markers = {
    pass: "[pass]",
    warn: "[warn]",
    fail: "[fail]",
    note: "[note]",
  };
  for (const item of results) {
    console.log(`${markers[item.level] || "[info]"} ${item.label}`);
    if (item.detail) console.log(`       ${item.detail}`);
  }
}

async function readBaseList() {
  if (typeof baseFileArg === "string") {
    return await readJson(path.resolve(repoRoot, String(baseFileArg)));
  }
  if (baseRef) {
    const repoRelative = path.relative(repoRoot, packagesFile).replaceAll("\\", "/");
    const { stdout } = await run("git", ["show", `${baseRef}:${repoRelative}`], { cwd: repoRoot });
    return JSON.parse(stdout);
  }
  return [];
}

function normalizeList(rawList, label) {
  if (!Array.isArray(rawList)) {
    throw new Error(`[npm] ${label} must be a JSON array of package specs`);
  }
  const byName = new Map();
  const ordered = [];
  for (const value of rawList) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`[npm] ${label} contains a non-string package spec`);
    }
    const parsed = parsePackageSpec(value);
    if (byName.has(parsed.name)) {
      throw new Error(`[npm] ${label} contains duplicate npm package name: ${parsed.name}`);
    }
    byName.set(parsed.name, parsed);
    ordered.push(parsed);
  }
  return { ordered, byName };
}

function buildChanges(baseList, headList) {
  const added = [];
  const updated = [];
  const removed = [];

  for (const head of headList.ordered) {
    const previous = baseList.byName.get(head.name);
    if (!previous) {
      added.push({ next: head });
      continue;
    }
    if (previous.spec !== head.spec) {
      updated.push({ previous, next: head });
    }
  }

  for (const previous of baseList.ordered) {
    if (!headList.byName.has(previous.name)) {
      removed.push({ previous });
    }
  }

  return { added, updated, removed };
}

function makeSummary({ baseRefLabel, changes, catalog, results }) {
  const lines = [
    "# Official Catalog PR Check",
    "",
    `- packages file: \`${path.relative(repoRoot, packagesFile).replaceAll("\\", "/")}\``,
    `- base: ${baseRefLabel ? `\`${baseRefLabel}\`` : "(none)"}`,
    `- registry: \`${registry}\``,
    "",
    "## Changes",
    "",
  ];

  if (changes.added.length === 0 && changes.updated.length === 0 && changes.removed.length === 0) {
    lines.push("- no effective package changes detected");
  } else {
    for (const item of changes.added) {
      lines.push(`- added: \`${item.next.spec}\``);
    }
    for (const item of changes.updated) {
      lines.push(`- updated: \`${item.previous.spec}\` -> \`${item.next.spec}\``);
    }
    for (const item of changes.removed) {
      lines.push(`- removed: \`${item.previous.spec}\``);
    }
  }

  const changedNames = new Set([
    ...changes.added.map((item) => item.next.name),
    ...changes.updated.map((item) => item.next.name),
  ]);
  const changedEntries = Array.isArray(catalog?.packages)
    ? catalog.packages.filter((entry) => changedNames.has(String(entry?.npm?.name ?? "")))
    : [];

  if (changedEntries.length > 0) {
    lines.push("", "## Validated Entries", "");
    for (const entry of changedEntries) {
      const runtimePermissions = Array.isArray(entry.runtimePermissions) ? entry.runtimePermissions.join(", ") || "(empty)" : "(missing)";
      const platforms = Array.isArray(entry.platforms) ? entry.platforms.join(", ") || "(empty)" : "(missing)";
      lines.push(`### \`${entry.npm?.name}@${entry.version}\``);
      lines.push(`- kitId: \`${entry.kitId}\``);
      lines.push(`- name: ${entry.name}`);
      lines.push(`- platforms: ${platforms}`);
      lines.push(`- runtimePermissions: ${runtimePermissions}`);
      lines.push(`- tarball: ${entry.dist?.tarball ?? "(missing)"}`);
      lines.push("");
    }
  }

  lines.push("## Result", "");
  for (const item of results) {
    lines.push(`- ${item.level.toUpperCase()}: ${item.label}${item.detail ? ` - ${item.detail}` : ""}`);
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const results = [];
  const baseRaw = await readBaseList();
  const headRaw = await readJson(packagesFile);
  const baseList = normalizeList(baseRaw, "base packages");
  const headList = normalizeList(headRaw, "head packages");
  const changes = buildChanges(baseList, headList);

  push(results, "note", "packages file", path.relative(repoRoot, packagesFile));
  if (baseRef) {
    push(results, "note", "base ref", baseRef);
  } else if (typeof baseFileArg === "string") {
    push(results, "note", "base file", String(baseFileArg));
  } else {
    push(results, "warn", "base comparison", "not provided; only full catalog generation will be checked");
  }

  if (changes.added.length === 0 && changes.updated.length === 0 && changes.removed.length === 0) {
    push(results, "warn", "catalog changes", "no effective package diff detected");
  } else {
    push(results, "pass", "catalog changes", `added=${changes.added.length} updated=${changes.updated.length} removed=${changes.removed.length}`);
  }

  if (changes.removed.length > 0 && !allowRemovals) {
    push(
      results,
      "fail",
      "package removals",
      changes.removed.map((item) => item.previous.spec).join(", ")
    );
  } else if (changes.removed.length > 0) {
    push(results, "warn", "package removals", changes.removed.map((item) => item.previous.spec).join(", "));
  }

  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(outRoot, { recursive: true });

  try {
    await run("node", [
      path.join(repoRoot, "scripts", "npm", "generate-catalog-from-registry.mjs"),
      "--registry",
      registry,
      "--packages-file",
      packagesFile,
      "--out-file",
      generatedCatalogPath,
      "--assets-dir",
      generatedAssetsDir,
      "--no-include-downloads",
    ]);
    push(results, "pass", "generate catalog", path.relative(repoRoot, generatedCatalogPath));
  } catch (error) {
    push(results, "fail", "generate catalog", String(error?.message || error));
  }

  let catalog = null;
  if (await fs.access(generatedCatalogPath).then(() => true).catch(() => false)) {
    catalog = await readJson(generatedCatalogPath);
    const changedNames = new Set([
      ...changes.added.map((item) => item.next.name),
      ...changes.updated.map((item) => item.next.name),
    ]);
    for (const item of changedNames) {
      const found = Array.isArray(catalog.packages) && catalog.packages.some((entry) => String(entry?.npm?.name ?? "") === item);
      push(results, found ? "pass" : "fail", `catalog entry ${item}`, found ? "present" : "missing after generation");
    }
  }

  const status = results.some((item) => item.level === "fail") ? "fail" : "pass";
  const summary = makeSummary({
    baseRefLabel: baseRef || (typeof baseFileArg === "string" ? String(baseFileArg) : ""),
    changes,
    catalog,
    results,
  });

  await writeJson(reportJsonPath, {
    generatedAt: new Date().toISOString(),
    status,
    packagesFile: path.relative(repoRoot, packagesFile),
    baseRef: baseRef || null,
    baseFile: typeof baseFileArg === "string" ? String(baseFileArg) : null,
    changes: {
      added: changes.added.map((item) => item.next.spec),
      updated: changes.updated.map((item) => ({ previous: item.previous.spec, next: item.next.spec })),
      removed: changes.removed.map((item) => item.previous.spec),
    },
    results,
  });
  await fs.writeFile(summaryPath, summary, "utf8");

  printResults(results);
  console.log(`[npm] report : ${path.relative(repoRoot, reportJsonPath)}`);
  console.log(`[npm] summary: ${path.relative(repoRoot, summaryPath)}`);

  process.exit(status === "fail" ? 1 : 0);
}

await main();
