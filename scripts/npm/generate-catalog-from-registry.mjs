import fs from "node:fs/promises";
import path from "node:path";
import { downloadToFile, getRepoRoot, hashFile, parseArgs, readJson, run, writeJson } from "./_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");
const includeDownloads = args.get("include-downloads") !== false;
const downloadsApi = String(args.get("downloads-api") ?? "https://api.npmjs.org/");

const outFileArg = args.get("out-file");
const outFile = path.resolve(repoRoot, String(outFileArg ?? "catalog/official.catalog.json"));
const assetsDirArg = args.get("assets-dir");
const assetsDir = path.resolve(
  repoRoot,
  String(assetsDirArg ?? path.join(path.dirname(outFile), `${path.basename(outFile, path.extname(outFile))}.assets`))
);

const packagesFileArg = args.get("packages-file");
const packagesFile = packagesFileArg ? path.resolve(repoRoot, String(packagesFileArg)) : null;

const pkgArg = args.get("pkg");
const catalogPreviewIconSize = Number.parseInt(String(args.get("catalog-icon-size") ?? "128"), 10);

const pkgSpecs = [];
if (typeof pkgArg === "string") pkgSpecs.push(pkgArg);
pkgSpecs.push(...positional.filter((p) => typeof p === "string" && p.trim().length > 0));

if (packagesFile) {
  const list = await readJson(packagesFile);
  if (!Array.isArray(list)) {
    console.error(`[npm] ERROR: packages-file must be a JSON array of package specs: ${path.relative(repoRoot, packagesFile)}`);
    process.exit(2);
  }
  for (const v of list) {
    if (typeof v === "string" && v.trim().length > 0) pkgSpecs.push(v.trim());
  }
}

if (pkgSpecs.length === 0) {
  console.error(
    [
      "Usage:",
      "  node scripts/npm/generate-catalog-from-registry.mjs --packages-file catalog/official.packages.json",
      "  node scripts/npm/generate-catalog-from-registry.mjs --out-file catalog/my.catalog.json <pkg>@<ver> [more...]",
      "",
      "Options:",
      "  --registry <url>          npm registry (default: https://registry.npmjs.org/)",
      "  --packages-file <path>    JSON array of package specs",
      "  --out-file <path>         output catalog JSON path",
      "  --assets-dir <path>       output sidecar assets dir (default: sibling *.assets)",
      "  --catalog-icon-size <px>  one preview icon size to copy into catalog package (default: 128)",
      "  --include-downloads       fetch npm downloads (last-week) into downloads_last_week (default: true; use --no-include-downloads to disable)",
      "  --downloads-api <url>     npm downloads API base (default: https://api.npmjs.org/)",
    ].join("\n")
  );
  process.exit(2);
}

function fileSafe(s) {
  return String(s).replaceAll("/", "__").replaceAll("@", "_").replaceAll(":", "_");
}

function isNpmjsRegistryUrl(registryUrl) {
  try {
    const u = new URL(String(registryUrl));
    return u.hostname === "registry.npmjs.org" || u.hostname.endsWith(".npmjs.org") || u.hostname === "npmjs.org";
  } catch {
    return false;
  }
}

async function fetchNpmDownloadsLastWeek(pkgName) {
  if (!isNpmjsRegistryUrl(registry)) return null;
  if (!pkgName) return null;
  const encoded = encodeURIComponent(String(pkgName));
  const url = new URL(`downloads/point/last-week/${encoded}`, downloadsApi).toString();
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const downloads = Number(json?.downloads);
  return Number.isFinite(downloads) && downloads >= 0 ? downloads : null;
}

async function download(tarballUrl, tgzPath) {
  await downloadToFile(tarballUrl, tgzPath);
}

async function extractManifest(tgzPath, extractDir) {
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", tgzPath, "-C", extractDir]);
  return path.join(extractDir, "package", "manifest.json");
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

function collectManifestIconPaths(manifest) {
  const iconMap = new Map();
  const icons = manifest?.icons;
  if (icons && typeof icons === "object" && !Array.isArray(icons)) {
    for (const [sizeKey, value] of Object.entries(icons)) {
      const relative = normalizeRelativePackagePath(value);
      if (!relative) continue;
      iconMap.set(String(sizeKey), relative);
    }
  }

  const explicitIcon = normalizeRelativePackagePath(manifest?.icon);
  return {
    explicitIcon,
    icons: Object.fromEntries(iconMap),
  };
}

function selectCatalogPreviewIcon(iconRecord, targetSize) {
  const sized = Object.entries(iconRecord.icons)
    .map(([size, relative]) => ({ size: Number.parseInt(size, 10), relative }))
    .filter((entry) => Number.isFinite(entry.size) && entry.size > 0 && entry.relative);
  if (sized.length > 0) {
    sized.sort((left, right) => {
      const leftBucket = left.size >= targetSize ? 0 : 1;
      const rightBucket = right.size >= targetSize ? 0 : 1;
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;
      const leftDistance = Math.abs(left.size - targetSize);
      const rightDistance = Math.abs(right.size - targetSize);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return right.size - left.size;
    });
    return sized[0];
  }
  if (iconRecord.explicitIcon) return { size: targetSize, relative: iconRecord.explicitIcon };
  return null;
}

async function copyCatalogSidecarIcon({ extractDir, assetsDir, kitId, iconRecord, targetSize }) {
  const selected = selectCatalogPreviewIcon(iconRecord, targetSize);
  if (!selected) {
    return { explicitIcon: null, icons: {} };
  }

  const src = path.join(extractDir, "package", selected.relative);
  const destRelative = path.posix.join("icons", kitId, selected.relative.replaceAll("\\", "/"));
  const dest = path.join(assetsDir, destRelative);
  const exists = await fs.access(src).then(() => true).catch(() => false);
  if (!exists) {
    return { explicitIcon: null, icons: {} };
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);

  const sizeKey = String(selected.size || targetSize);
  return {
    explicitIcon: destRelative,
    icons: { [sizeKey]: destRelative },
  };
}

function parseUserFromPersonString(s) {
  // npm often returns "name <email>".
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const m = /^([^<]+)</.exec(raw);
  return (m ? m[1] : raw).trim() || null;
}

function listMaintainers(meta) {
  const v = meta?.maintainers;
  if (!v) return [];
  const out = [];
  if (Array.isArray(v)) {
    for (const m of v) {
      if (!m) continue;
      if (typeof m === "string") {
        const name = parseUserFromPersonString(m);
        if (name) out.push(name);
        continue;
      }
      if (typeof m === "object") {
        const name = String(m.name ?? "").trim();
        if (name) out.push(name);
      }
    }
  }
  return [...new Set(out)];
}

function parsePublisher(meta) {
  const u = meta?._npmUser;
  if (!u) return null;
  if (typeof u === "string") return parseUserFromPersonString(u);
  if (typeof u === "object") {
    const name = String(u.name ?? "").trim();
    if (name) return name;
  }
  return null;
}

function parseScope(pkgName) {
  const s = String(pkgName ?? "");
  if (!s.startsWith("@")) return null;
  const slash = s.indexOf("/");
  if (slash <= 1) return null;
  return s.slice(1, slash);
}

function collectBindingCategories(manifest) {
  const bindings = Array.isArray(manifest?.bindings) ? manifest.bindings : [];
  const set = new Set();
  for (const b of bindings) {
    const cats = Array.isArray(b?.categories) ? b.categories : [];
    for (const c of cats) {
      if (typeof c === "string" && c.trim()) set.add(c.trim());
    }
  }
  return [...set];
}

function collectSlashTags(manifest) {
  const tags = manifest?.discovery?.slash?.tags;
  if (!Array.isArray(tags)) return [];
  const set = new Set();
  for (const tag of tags) {
    if (typeof tag === "string" && tag.trim()) set.add(tag.trim());
  }
  return [...set];
}

function deriveTagsFromRuntimePermissions(runtimePermissions) {
  const list = Array.isArray(runtimePermissions) ? runtimePermissions : [];
  const tags = [];
  if (list.includes("ai.request")) tags.push("ai");
  if (list.includes("network.fetch")) tags.push("network");
  if (list.includes("storage.read") || list.includes("storage.write")) tags.push("system");
  if (list.includes("files.pick")) tags.push("files");
  return tags;
}

function collectCatalogTags(manifest, categories, runtimePermissions) {
  const set = new Set();
  for (const tag of [...collectSlashTags(manifest), ...categories, ...deriveTagsFromRuntimePermissions(runtimePermissions)]) {
    if (typeof tag === "string" && tag.trim()) set.add(tag.trim());
  }
  return [...set];
}

function validateKitIdOrThrow(kitId, pkg) {
  const id = String(kitId ?? "");
  if (!id || !id.trim()) throw new Error(`[npm] Invalid kitId (empty) for ${pkg}`);
  if (id !== id.trim()) throw new Error(`[npm] Invalid kitId (leading/trailing spaces) for ${pkg}: "${id}"`);
  if (id.includes("/") || id.includes("\\")) {
    throw new Error(`[npm] Invalid kitId (must not contain '/' or '\\\\') for ${pkg}: "${id}"`);
  }
  if (id.includes("..")) {
    throw new Error(`[npm] Invalid kitId (must not contain '..') for ${pkg}: "${id}"`);
  }
  if (id.includes(":")) {
    throw new Error(`[npm] Invalid kitId (must not contain ':') for ${pkg}: "${id}"`);
  }
  if (id.includes("@")) {
    throw new Error(`[npm] Invalid kitId (must not contain '@') for ${pkg}: "${id}"`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) {
    throw new Error(
      `[npm] Invalid kitId (allowed: lowercase letters, digits, '.', '_', '-') for ${pkg}: "${id}"`
    );
  }
}

async function main() {
  const entries = [];
  await fs.rm(assetsDir, { recursive: true, force: true });
  await fs.mkdir(assetsDir, { recursive: true });

  for (const spec of pkgSpecs) {
    const { stdout: viewOut } = await run("npm", ["view", spec, "--registry", registry, "--json"]);
    const meta = JSON.parse(viewOut);
    const dist = meta?.dist;

    const pkgName = String(meta?.name ?? "");
    const pkgVersion = String(meta?.version ?? "");
    if (!pkgName || !pkgVersion) throw new Error(`[npm] Invalid npm metadata for ${spec}`);
    if (!dist?.tarball || !dist?.integrity) {
      throw new Error(`[npm] Missing dist.tarball/dist.integrity for ${spec}`);
    }

    let downloadsLastWeek = null;
    if (includeDownloads) {
      try {
        // eslint-disable-next-line no-await-in-loop
        downloadsLastWeek = await fetchNpmDownloadsLastWeek(pkgName);
      } catch (e) {
        console.warn(`[npm] WARN: failed to fetch downloads for ${pkgName}: ${e?.message ?? e}`);
        downloadsLastWeek = null;
      }
    }

    const tarballUrl = String(dist.tarball);
    const expectedIntegrity = String(dist.integrity);

    const cacheDir = path.join(repoRoot, "artifacts", "npm", "catalog-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const tgzPath = path.join(cacheDir, `${fileSafe(`${pkgName}@${pkgVersion}`)}.tgz`);
    await download(tarballUrl, tgzPath);

    const actual = await hashFile(tgzPath);
    if (actual.integrity !== expectedIntegrity) {
      throw new Error(
        `[npm] Integrity mismatch for ${pkgName}@${pkgVersion}\nexpected=${expectedIntegrity}\nactual=${actual.integrity}`
      );
    }

    const extractDir = path.join(cacheDir, `${fileSafe(`${pkgName}@${pkgVersion}`)}.extract`);
    const manifestPath = await extractManifest(tgzPath, extractDir);
    const manifest = await readJson(manifestPath);

    const kitId = String(manifest?.id ?? "");
    if (!kitId) throw new Error(`[npm] Missing manifest.id in ${pkgName}@${pkgVersion}`);
    validateKitIdOrThrow(kitId, `${pkgName}@${pkgVersion}`);

    const manifestVersion = manifest?.version != null ? String(manifest.version) : null;
    if (manifestVersion && manifestVersion !== pkgVersion) {
      throw new Error(
        `[npm] Version mismatch for ${pkgName}@${pkgVersion}: manifest.version=${manifestVersion} npm.version=${pkgVersion}`
      );
    }

    const categories = collectBindingCategories(manifest);
    const platforms = Array.isArray(manifest?.platforms) ? manifest.platforms.map((p) => String(p)) : null;
    const runtimePermissions = Array.isArray(manifest?.runtimePermissions)
      ? manifest.runtimePermissions.map((p) => String(p))
      : null;
    const iconRecord = collectManifestIconPaths(manifest);
    const copiedIconRecord = await copyCatalogSidecarIcon({
      extractDir,
      assetsDir,
      kitId,
      iconRecord,
      targetSize: Number.isFinite(catalogPreviewIconSize) && catalogPreviewIconSize > 0 ? catalogPreviewIconSize : 128,
    });
    const tags = collectCatalogTags(manifest, categories, runtimePermissions);
    const primaryTag = tags[0] ?? null;

    const publisher = parsePublisher(meta);
    const maintainers = listMaintainers(meta);
    const scope = parseScope(pkgName);

    const publishedAt = meta?.time?.[pkgVersion] ? String(meta.time[pkgVersion]) : null;

    entries.push({
      kitId,
      name: String(manifest?.name ?? kitId),
      description: String(manifest?.description ?? meta?.description ?? ""),
      version: pkgVersion,
      downloads_last_week: downloadsLastWeek,
      npm: {
        name: pkgName,
        version: pkgVersion,
        scope,
        keywords: Array.isArray(meta?.keywords) ? meta.keywords.map((k) => String(k)) : null,
        publisher,
        maintainers,
        publishedAt,
      },
      platforms,
      runtimePermissions,
      categories,
      tag: primaryTag,
      tags,
      icons: Object.keys(copiedIconRecord.icons).length > 0 ? copiedIconRecord.icons : null,
      icon: copiedIconRecord.explicitIcon ?? null,
      bindingCount: Array.isArray(manifest?.bindings) ? manifest.bindings.length : null,
      links: {
        homepage: meta?.homepage ? String(meta.homepage) : null,
        repository:
          typeof meta?.repository === "string"
            ? String(meta.repository)
            : meta?.repository?.url
              ? String(meta.repository.url)
              : null,
        bugs:
          typeof meta?.bugs === "string" ? String(meta.bugs) : meta?.bugs?.url ? String(meta.bugs.url) : null,
      },
      dist: {
        tarball: tarballUrl,
        integrity: expectedIntegrity,
        sha256: actual.sha256,
        sizeBytes: actual.sizeBytes,
        unpackedSize: dist?.unpackedSize ?? null,
        fileCount: dist?.fileCount ?? null,
      },
    });
  }

  // Ensure no collisions inside one catalog.
  const byKitId = new Map();
  const byNpmName = new Map();
  for (const e of entries) {
    const kitKey = String(e.kitId);
    const npmKey = String(e?.npm?.name ?? "");
    const npmSpec = `${npmKey}@${String(e?.npm?.version ?? "")}`;
    byKitId.set(kitKey, [...(byKitId.get(kitKey) ?? []), npmSpec]);
    byNpmName.set(npmKey, [...(byNpmName.get(npmKey) ?? []), npmSpec]);
  }

  const kitIdDups = [...byKitId.entries()].filter(([, list]) => list.length > 1);
  if (kitIdDups.length > 0) {
    console.error("[npm] ERROR: kitId collision(s) detected inside this catalog:");
    for (const [kitId, specs] of kitIdDups) {
      console.error(`  - kitId="${kitId}" used by: ${specs.join(", ")}`);
    }
    console.error('[npm] Fix: ensure each kit has a globally-unique manifest.id (recommended: "<publisher>.<kitName>").');
    process.exit(1);
  }

  const npmNameDups = [...byNpmName.entries()].filter(([, list]) => list.length > 1);
  if (npmNameDups.length > 0) {
    console.error("[npm] ERROR: duplicate npm package(s) detected inside this catalog (multiple versions listed):");
    for (const [name, specs] of npmNameDups) {
      console.error(`  - npm.name="${name}" specs: ${specs.join(", ")}`);
    }
    console.error("[npm] Fix: keep only ONE version per npm package in packages-file.");
    process.exit(1);
  }

  // Deterministic order for stable diffs.
  entries.sort((a, b) => String(a.kitId).localeCompare(String(b.kitId)));

  const catalog = {
    kind: "keyflow.npm.catalog.v0",
    generatedAt: new Date().toISOString(),
    registry,
    packages: entries,
  };

  await writeJson(outFile, catalog);
  console.log(`[npm] wrote: ${path.relative(repoRoot, outFile)}`);
  console.log(`[npm] assets: ${path.relative(repoRoot, assetsDir)}`);
  console.log(`[npm] packages: ${entries.length}`);
}

await main();
