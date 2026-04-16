import fs from "node:fs/promises";
import path from "node:path";
import {
  artifactsRoot,
  computeTarballDist,
  ensureCleanDir,
  parseArgs,
  readJson,
  resolveKitTarget,
  resolvePackageName,
  run,
  safeText,
  writeJson,
} from "./_workspace-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run catalog:check -- [--kit <kitId>] [--scope yourscope] [--package-name @scope/name] [--version 0.1.0]",
      "",
      "Purpose:",
      "  Verify that the published npm package is ready for official catalog submission.",
      "",
      "Output:",
      "  artifacts/catalog/<kitId>.catalog-check.json",
      "  artifacts/catalog/<kitId>.catalog-entry.md",
    ].join("\n")
  );
}

if (args.get("help")) {
  usage();
  process.exit(0);
}

function fileSafe(value) {
  return String(value).replaceAll("/", "__").replaceAll("@", "_").replaceAll(":", "_");
}

function normalizeRelativePackagePath(raw) {
  const normalized = String(raw ?? "")
    .replaceAll("\\", "/")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^package\//, "");
  if (!normalized) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

function collectIconPaths(manifest) {
  const paths = new Set();
  const explicit = normalizeRelativePackagePath(manifest?.icon);
  if (explicit) paths.add(explicit);
  const icons = manifest?.icons;
  if (icons && typeof icons === "object" && !Array.isArray(icons)) {
    for (const value of Object.values(icons)) {
      const normalized = normalizeRelativePackagePath(value);
      if (normalized) paths.add(normalized);
    }
  }
  return [...paths];
}

function collectBundlePaths(manifest) {
  const bundle = manifest?.entry?.bundle;
  if (!bundle || typeof bundle !== "object") return [];
  return [bundle.html, bundle.script, bundle.style].map(normalizeRelativePackagePath).filter(Boolean);
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`[starter] download failed: ${res.status} ${res.statusText}: ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
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

function makeMarkdown({ kit, packageName, version, registry, meta, publishedManifest, results }) {
  const runtimePermissions = Array.isArray(publishedManifest.runtimePermissions)
    ? publishedManifest.runtimePermissions.join(", ")
    : "(none)";
  const platforms = Array.isArray(publishedManifest.platforms) ? publishedManifest.platforms.join(", ") : "(none)";
  const failures = results.filter((item) => item.level === "fail").length;
  const warnings = results.filter((item) => item.level === "warn").length;

  return [
    "# Official Catalog Submission",
    "",
    `- npm package: \`${packageName}@${version}\``,
    `- kitId: \`${kit.kitId}\``,
    `- name: ${safeText(publishedManifest.name) || kit.kitId}`,
    `- description: ${safeText(publishedManifest.description) || "(missing)"}`,
    `- platforms: ${platforms}`,
    `- runtimePermissions: ${runtimePermissions}`,
    `- registry: ${registry}`,
    `- tarball: ${safeText(meta?.dist?.tarball)}`,
    "",
    "## Check Result",
    "",
    `- failures: ${failures}`,
    `- warnings: ${warnings}`,
    "",
    "## Add To official.packages.json",
    "",
    "```json",
    JSON.stringify(`${packageName}@${version}`),
    "```",
    "",
  ].join("\n");
}

async function main() {
  const kit = await resolveKitTarget(args.get("kit"));
  const scope = safeText(args.get("scope"));
  const prefix = safeText(args.get("prefix")) || "keyflow-kit-";
  const packageName = resolvePackageName({
    scope,
    prefix,
    kitId: kit.kitId,
    packageName: args.get("package-name"),
  });
  const version = safeText(args.get("version")) || safeText(kit.manifest.version);
  const registry = safeText(args.get("registry")) || "https://registry.npmjs.org/";
  const outRoot = path.resolve(path.join(artifactsRoot, ".."), safeText(args.get("out")) || path.join(artifactsRoot, "catalog"));
  const outputPath = path.join(outRoot, `${kit.kitId}.catalog-check.json`);
  const markdownPath = path.join(outRoot, `${kit.kitId}.catalog-entry.md`);
  const cacheDir = path.join(outRoot, "cache", fileSafe(`${packageName}@${version}`));
  const results = [];

  push(results, "note", "Package", `${packageName}@${version}`);

  if (!version) {
    push(results, "fail", "version", "manifest.version is missing; pass --version or bump manifest.version.");
  } else if (version === "0.0.0") {
    push(results, "fail", "version", "0.0.0 is not suitable for official catalog submission.");
  } else {
    push(results, "pass", "version", version);
  }

  let meta = null;
  let publishedManifest = null;
  let packageJson = null;
  let dist = null;

  try {
    const { stdout } = await run("npm", ["view", `${packageName}@${version}`, "--registry", registry, "--json"]);
    meta = JSON.parse(stdout);
    push(results, "pass", "npm package exists", `${meta.name}@${meta.version}`);
  } catch (error) {
    push(results, "fail", "npm package exists", String(error?.message || error));
  }

  if (meta?.dist?.tarball && meta?.dist?.integrity) {
    await ensureCleanDir(cacheDir);
    const tgzPath = path.join(cacheDir, `${fileSafe(`${packageName}@${version}`)}.tgz`);
    try {
      await downloadToFile(String(meta.dist.tarball), tgzPath);
      dist = await computeTarballDist(tgzPath);
      push(results, "pass", "tarball download", meta.dist.tarball);
      if (dist.integrity === String(meta.dist.integrity)) {
        push(results, "pass", "dist.integrity", dist.integrity);
      } else {
        push(results, "fail", "dist.integrity", `expected=${meta.dist.integrity} actual=${dist.integrity}`);
      }

      const { stdout: tarList } = await run("tar", ["-tf", tgzPath]);
      const files = new Set(tarList.split(/\r?\n/).filter(Boolean));
      for (const required of ["package/package.json", "package/manifest.json"]) {
        push(results, files.has(required) ? "pass" : "fail", required, files.has(required) ? "present" : "missing");
      }

      const extractDir = path.join(cacheDir, "extract");
      await ensureCleanDir(extractDir);
      await run("tar", ["-xzf", tgzPath, "-C", extractDir, "package/package.json", "package/manifest.json"]);
      packageJson = await readJson(path.join(extractDir, "package", "package.json"));
      publishedManifest = await readJson(path.join(extractDir, "package", "manifest.json"));

      const bundlePaths = collectBundlePaths(publishedManifest);
      if (bundlePaths.length === 0) {
        push(results, "fail", "entry.bundle", "missing html/script/style bundle paths");
      } else {
        for (const bundlePath of bundlePaths) {
          const packagePath = `package/${bundlePath}`;
          push(results, files.has(packagePath) ? "pass" : "fail", `bundle file ${bundlePath}`, files.has(packagePath) ? "present" : "missing");
        }
      }

      const iconPaths = collectIconPaths(publishedManifest);
      if (iconPaths.length === 0) {
        push(results, "warn", "manifest icons", "no icon/icon paths declared; official catalog listing will look unfinished.");
      } else {
        for (const iconPath of iconPaths) {
          const packagePath = `package/${iconPath}`;
          push(results, files.has(packagePath) ? "pass" : "fail", `icon file ${iconPath}`, files.has(packagePath) ? "present" : "missing");
        }
      }
    } catch (error) {
      push(results, "fail", "tarball verification", String(error?.message || error));
    }
  } else if (meta) {
    push(results, "fail", "npm dist metadata", "missing dist.tarball or dist.integrity");
  }

  if (publishedManifest) {
    push(results, publishedManifest.id === kit.kitId ? "pass" : "fail", "manifest.id", `published=${publishedManifest.id} local=${kit.kitId}`);
    push(results, publishedManifest.version === version ? "pass" : "fail", "manifest.version", `published=${publishedManifest.version} expected=${version}`);
    push(results, safeText(publishedManifest.name) ? "pass" : "fail", "manifest.name", safeText(publishedManifest.name) || "<missing>");
    push(results, safeText(publishedManifest.description) ? "pass" : "fail", "manifest.description", safeText(publishedManifest.description) || "<missing>");
    push(results, publishedManifest?.entry?.type === "browser-app" ? "pass" : "fail", "manifest.entry.type", safeText(publishedManifest?.entry?.type) || "<missing>");
    push(
      results,
      Array.isArray(publishedManifest.platforms) && publishedManifest.platforms.length > 0 ? "pass" : "warn",
      "manifest.platforms",
      Array.isArray(publishedManifest.platforms) ? publishedManifest.platforms.join(", ") : "<missing>"
    );
    push(
      results,
      Array.isArray(publishedManifest.runtimePermissions) ? "pass" : "warn",
      "manifest.runtimePermissions",
      Array.isArray(publishedManifest.runtimePermissions) ? publishedManifest.runtimePermissions.join(", ") || "(empty)" : "<missing>"
    );
    if (safeText(kit.manifest.name) && safeText(kit.manifest.name) !== safeText(publishedManifest.name)) {
      push(results, "warn", "local manifest.name", `local=${kit.manifest.name} published=${publishedManifest.name}`);
    }
    if (safeText(kit.manifest.description) && safeText(kit.manifest.description) !== safeText(publishedManifest.description)) {
      push(results, "warn", "local manifest.description", "local workspace differs from the published npm package");
    }
    if (safeText(kit.manifest.version) && safeText(kit.manifest.version) !== version) {
      push(results, "warn", "local manifest.version", `local=${kit.manifest.version} checked=${version}`);
    }
  }

  if (packageJson) {
    push(results, packageJson.name === packageName ? "pass" : "fail", "package.json name", `published=${packageJson.name} expected=${packageName}`);
    push(results, packageJson.version === version ? "pass" : "fail", "package.json version", `published=${packageJson.version} expected=${version}`);
    push(results, packageJson?.keyflow?.kind === "function-kit" ? "pass" : "fail", "package.json keyflow.kind", safeText(packageJson?.keyflow?.kind) || "<missing>");
    push(results, packageJson?.keyflow?.kitId === kit.kitId ? "pass" : "fail", "package.json keyflow.kitId", safeText(packageJson?.keyflow?.kitId) || "<missing>");
  }

  const status = results.some((item) => item.level === "fail") ? "fail" : "pass";
  await writeJson(outputPath, {
    generatedAt: new Date().toISOString(),
    status,
    kitId: kit.kitId,
    packageName,
    version,
    registry,
    npm: meta
      ? {
          name: meta.name,
          version: meta.version,
          dist: meta.dist ?? null,
        }
      : null,
    dist,
    results,
  });

  if (publishedManifest && meta) {
    await fs.mkdir(path.dirname(markdownPath), { recursive: true });
    await fs.writeFile(markdownPath, makeMarkdown({ kit, packageName, version, registry, meta, publishedManifest, results }), "utf8");
  }

  printResults(results);
  console.log(`[starter] catalog check file: ${outputPath}`);
  if (publishedManifest && meta) console.log(`[starter] catalog entry md : ${markdownPath}`);

  process.exit(status === "fail" ? 1 : 0);
}

await main();
