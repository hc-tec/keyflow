import path from "node:path";
import { getRepoRoot, parseArgs, writeJson } from "../npm/_lib.mjs";

const { args, positional } = parseArgs(process.argv.slice(2));

const repoArg = args.get("repo") ?? positional[0];
const repo = typeof repoArg === "string" ? repoArg.trim() : "";

if (!repo || !repo.includes("/")) {
  console.error(
    [
      "Usage:",
      "  node scripts/stats/fetch-github-release-downloads.mjs --repo <owner>/<repo> [--out tmp/stats/releases.json]",
      "",
      "Options:",
      "  --repo <slug>                   required, e.g. hc-tec/keyflow",
      "  --out <path>                    output JSON path (default: tmp/stats/releases.json)",
      "  --include-drafts                include draft releases (default: false)",
      "  --no-include-prereleases        exclude prereleases (default: include)",
    ].join("\n")
  );
  process.exit(2);
}

const repoRoot = getRepoRoot();
const outArg = args.get("out") ?? args.get("out-file") ?? "tmp/stats/releases.json";
const outFile = path.resolve(repoRoot, String(outArg));

const includeDrafts = args.get("include-drafts") === true;
const includePrereleases = args.get("include-prereleases") !== false;

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function safeString(value) {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function buildHeaders() {
  const token = String(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "keyflow-stats-script",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: buildHeaders(), redirect: "follow" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[stats] GitHub API failed: ${res.status} ${res.statusText}: ${url}\n${text}`.trim());
  }
  return await res.json();
}

async function fetchAllReleases(slug) {
  const releases = [];
  const perPage = 100;
  for (let page = 1; page <= 50; page++) {
    // 50 * 100 = 5000 releases (far beyond our needs), just a safety cap.
    const url = `https://api.github.com/repos/${slug}/releases?per_page=${perPage}&page=${page}`;
    // eslint-disable-next-line no-await-in-loop
    const batch = await fetchJson(url);
    if (!Array.isArray(batch) || batch.length === 0) break;
    releases.push(...batch);
    if (batch.length < perPage) break;
  }
  return releases;
}

function normalizeRelease(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const normalizedAssets = assets
    .map((asset) => {
      const name = safeString(asset?.name);
      if (!name) return null;
      return {
        id: numberOrNull(asset?.id),
        name,
        sizeBytes: numberOrNull(asset?.size),
        downloadCount: numberOrNull(asset?.download_count) ?? 0,
        contentType: safeString(asset?.content_type),
        createdAt: safeString(asset?.created_at),
        updatedAt: safeString(asset?.updated_at),
        browserDownloadUrl: safeString(asset?.browser_download_url),
      };
    })
    .filter(Boolean);

  const totalDownloads = normalizedAssets.reduce((sum, asset) => sum + (asset.downloadCount ?? 0), 0);

  return {
    id: numberOrNull(release?.id),
    tagName: safeString(release?.tag_name),
    name: safeString(release?.name),
    htmlUrl: safeString(release?.html_url),
    apiUrl: safeString(release?.url),
    draft: Boolean(release?.draft),
    prerelease: Boolean(release?.prerelease),
    createdAt: safeString(release?.created_at),
    publishedAt: safeString(release?.published_at),
    totalDownloads,
    assets: normalizedAssets,
  };
}

async function main() {
  const raw = await fetchAllReleases(repo);
  const normalized = raw
    .map((r) => normalizeRelease(r))
    .filter((r) => (includeDrafts ? true : !r.draft))
    .filter((r) => (includePrereleases ? true : !r.prerelease));

  normalized.sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

  const totals = normalized.reduce(
    (acc, r) => {
      acc.releases += 1;
      acc.assets += Array.isArray(r.assets) ? r.assets.length : 0;
      acc.downloads += numberOrNull(r.totalDownloads) ?? 0;
      return acc;
    },
    { releases: 0, assets: 0, downloads: 0 }
  );

  const report = {
    kind: "keyflow.github.release-downloads.v0",
    generatedAt: new Date().toISOString(),
    repo,
    totals,
    releases: normalized,
  };

  await writeJson(outFile, report);
  console.log(`[stats] wrote: ${path.relative(repoRoot, outFile)}`);
  console.log(`[stats] releases=${totals.releases} assets=${totals.assets} downloads=${totals.downloads}`);
}

await main();

