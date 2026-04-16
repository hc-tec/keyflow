import fs from "node:fs/promises";
import path from "node:path";
import {
  packageRoot,
  parseArgs,
  pathExists,
  readJson,
  resolveKitTarget,
  safeText,
} from "./_workspace-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run doctor -- [--kit <kitId>]",
      "",
      "Checks:",
      "  - manifest metadata / entry bundle / icon paths",
      "  - vendored starter assets",
      "  - package.json -> keyflow.defaultKitId",
      "  - obvious runtimePermissions gaps from common API usage",
      "  - host-incompatible browser APIs such as DOM Storage or external scripts",
    ].join("\n")
  );
}

if (args.get("help")) {
  printUsage();
  process.exit(0);
}

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const capabilityHints = [
  { permission: "context.read", patterns: [/kit\.context\b/, /["']context\.read["']/] },
  { permission: "input.insert", patterns: [/kit\.input\.insert\b/, /["']input\.insert["']/] },
  { permission: "input.replace", patterns: [/kit\.input\.replace\b/, /["']input\.replace["']/] },
  { permission: "storage.read", patterns: [/kit\.storage\.(get|read)\b/, /["']storage\.read["']/] },
  { permission: "storage.write", patterns: [/kit\.storage\.(set|write)\b/, /["']storage\.write["']/] },
  { permission: "settings.open", patterns: [/kit\.settings\.open\b/, /["']settings\.open["']/] },
  { permission: "network.fetch", patterns: [/kit\.network\.fetch\b/, /["']network\.fetch["']/] },
  { permission: "ai.request", patterns: [/kit\.ai\.request\b/, /["']ai\.request["']/] },
  { permission: "files.pick", patterns: [/kit\.files\.pick\b/, /["']files\.pick["']/] },
];

const sourceHazards = [
  {
    level: "fail",
    label: "DOM storage API",
    detail:
      "Detected localStorage/sessionStorage/indexedDB/document.cookie. Android Host does not support DOM Storage; use kit.storage.* instead.",
    patterns: [/\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bdocument\.cookie\b/],
  },
  {
    level: "fail",
    label: "external script src",
    detail: "Detected remote <script src>. Android Host CSP blocks external scripts; vendor the script locally instead.",
    patterns: [/<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i],
  },
  {
    level: "warn",
    label: "direct browser network API",
    detail:
      "Detected fetch/XMLHttpRequest/WebSocket/EventSource/sendBeacon. Prefer kit.network.fetch (or equivalent host bridge API) for predictable host behavior.",
    patterns: [
      /\b(?:globalThis|window|self)\.fetch\s*\(/,
      /(?:^|[^\w$.])fetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bEventSource\b/,
      /\bnavigator\.sendBeacon\b/,
    ],
  },
  {
    level: "warn",
    label: "window.open / multi-window API",
    detail: "Detected window.open. Android Host does not support in-WebView multi-window flows.",
    patterns: [/\bwindow\.open\b/],
  },
  {
    level: "warn",
    label: "dynamic code execution",
    detail: "Detected eval/new Function. Avoid dynamic code execution inside Function Kits.",
    patterns: [/\beval\s*\(/, /\bnew Function\s*\(/],
  },
  {
    level: "warn",
    label: "remote JS module import",
    detail: "Detected JS import from an http(s) URL. Ship module code with the kit instead of loading it remotely.",
    patterns: [/\bfrom\s+["']https?:\/\//, /\bimport\s*\(\s*["']https?:\/\//],
  },
  {
    level: "warn",
    label: "files.download / files.getUrl",
    detail:
      "Detected files.download/files.getUrl. Android Host does not generally implement these yet; verify the real host path before shipping.",
    patterns: [/\bkit\.files\.(download|getUrl)\b/, /["']files\.(download|getUrl)["']/],
  },
];

function pushResult(results, level, label, detail) {
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
    if (item.detail) {
      console.log(`       ${item.detail}`);
    }
  }
}

function formatManifestField(value) {
  return value ? value : "<missing>";
}

function extractHtmlExecutableContent(content) {
  const snippets = [];
  for (const match of content.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    snippets.push(match[1] || "");
  }
  for (const match of content.matchAll(/\son[a-z0-9_-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    snippets.push(match[1] || match[2] || "");
  }
  return snippets.join("\n");
}

function createSourceEntry(relativePath, content) {
  if (/\.html?$/i.test(relativePath)) {
    return {
      relativePath,
      rawContent: content,
      analysisContent: extractHtmlExecutableContent(content),
    };
  }
  return {
    relativePath,
    rawContent: content,
    analysisContent: content,
  };
}

function findHazardMatches(sourceEntries, patterns) {
  const matchedFiles = [];
  for (const entry of sourceEntries) {
    const haystack = entry.analysisContent || "";
    if (patterns.some((pattern) => pattern.test(haystack))) {
      matchedFiles.push(entry.relativePath);
    }
  }
  return matchedFiles;
}

function findRawHazardMatches(sourceEntries, patterns) {
  const matchedFiles = [];
  for (const entry of sourceEntries) {
    const haystack = entry.rawContent || "";
    if (patterns.some((pattern) => pattern.test(haystack))) {
      matchedFiles.push(entry.relativePath);
    }
  }
  return matchedFiles;
}

const results = [];

try {
  const kit = await resolveKitTarget(args.get("kit"));
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = (await pathExists(packageJsonPath, "file")) ? await readJson(packageJsonPath) : null;
  const defaultKitId = safeText(packageJson?.keyflow?.defaultKitId);

  pushResult(results, "note", "Kit", `${kit.kitId} (${kit.kitDir})`);

  if (defaultKitId === kit.kitId) {
    pushResult(results, "pass", "package.json keyflow.defaultKitId", defaultKitId);
  } else if (defaultKitId) {
    pushResult(results, "warn", "package.json keyflow.defaultKitId", `current=${defaultKitId}, selected=${kit.kitId}`);
  } else {
    pushResult(results, "warn", "package.json keyflow.defaultKitId", "not set");
  }

  if (safeText(kit.manifest.id) === kit.kitId) {
    pushResult(results, "pass", "manifest id matches directory", kit.kitId);
  } else {
    pushResult(results, "fail", "manifest id matches directory", `manifest.id=${kit.manifest.id ?? "<missing>"}`);
  }

  const manifestName = safeText(kit.manifest?.name);
  const manifestVersion = safeText(kit.manifest?.version);
  const manifestDescription = safeText(kit.manifest?.description);
  const manifestEntryType = safeText(kit.manifest?.entry?.type);
  const manifestPlatforms = Array.isArray(kit.manifest?.platforms)
    ? kit.manifest.platforms.map((item) => safeText(item)).filter(Boolean)
    : [];

  pushResult(results, manifestName ? "pass" : "fail", "manifest.name", formatManifestField(manifestName));
  pushResult(results, manifestDescription ? "pass" : "fail", "manifest.description", formatManifestField(manifestDescription));

  if (!manifestVersion) {
    pushResult(results, "fail", "manifest.version", "<missing>");
  } else if (!semverPattern.test(manifestVersion)) {
    pushResult(results, "fail", "manifest.version", `${manifestVersion} (expected semver like 0.1.0)`);
  } else if (manifestVersion === "0.0.0") {
    pushResult(results, "warn", "manifest.version", "0.0.0 (bump before publishing)");
  } else {
    pushResult(results, "pass", "manifest.version", manifestVersion);
  }

  if (manifestEntryType === "browser-app") {
    pushResult(results, "pass", "manifest.entry.type", manifestEntryType);
  } else {
    pushResult(results, "fail", "manifest.entry.type", formatManifestField(manifestEntryType));
  }

  if (manifestPlatforms.length > 0) {
    pushResult(results, "pass", "manifest.platforms", manifestPlatforms.join(", "));
  } else {
    pushResult(results, "warn", "manifest.platforms", "empty or missing");
  }

  const bundle = kit.manifest?.entry?.bundle;
  if (!bundle || typeof bundle !== "object") {
    pushResult(results, "fail", "manifest entry.bundle", "missing browser-app bundle definition");
  } else {
    const bundleChecks = [
      ["html", safeText(bundle.html)],
      ["script", safeText(bundle.script)],
      ["style", safeText(bundle.style)],
    ];
    for (const [field, relativePath] of bundleChecks) {
      const targetPath = relativePath ? path.join(kit.kitDir, relativePath) : "";
      // eslint-disable-next-line no-await-in-loop
      if (relativePath && (await pathExists(targetPath, "file"))) {
        pushResult(results, "pass", `entry.bundle.${field}`, relativePath);
      } else {
        pushResult(results, "fail", `entry.bundle.${field}`, relativePath || "<missing>");
      }
    }
  }

  const iconPaths = new Set();
  if (typeof kit.manifest?.icon === "string") {
    iconPaths.add(kit.manifest.icon);
  }
  if (kit.manifest?.icons && typeof kit.manifest.icons === "object") {
    Object.values(kit.manifest.icons).forEach((value) => {
      if (typeof value === "string" && value.trim()) {
        iconPaths.add(value);
      }
    });
  }
  if (iconPaths.size === 0) {
    pushResult(results, "warn", "manifest icons", "no icon paths declared");
  } else {
    for (const iconPath of iconPaths) {
      const resolved = path.join(kit.kitDir, iconPath);
      // eslint-disable-next-line no-await-in-loop
      if (await pathExists(resolved, "file")) {
        pushResult(results, "pass", "icon path", iconPath);
      } else {
        pushResult(results, "fail", "icon path", iconPath);
      }
    }
  }

  const vendorChecks = [
    "ui/vendor/function-kit-runtime.js",
    "ui/vendor/petite-vue.iife.js",
    "ui/vendor/kit-shadcn.css",
  ];
  for (const relativePath of vendorChecks) {
    const resolved = path.join(kit.kitDir, relativePath);
    // eslint-disable-next-line no-await-in-loop
    if (await pathExists(resolved, "file")) {
      pushResult(results, "pass", "vendored asset", relativePath);
    } else {
      pushResult(results, "warn", "vendored asset", `${relativePath} (missing; fine only if you intentionally switched away from vendored mode)`);
    }
  }

  const declaredPermissions = Array.isArray(kit.manifest?.runtimePermissions)
    ? kit.manifest.runtimePermissions.map((item) => safeText(item)).filter(Boolean)
    : [];
  if (declaredPermissions.length > 0) {
    pushResult(results, "pass", "runtimePermissions", declaredPermissions.join(", "));
  } else {
    pushResult(results, "warn", "runtimePermissions", "empty or missing");
  }
  const duplicatePermissions = declaredPermissions.filter((item, index) => declaredPermissions.indexOf(item) !== index);
  if (duplicatePermissions.length > 0) {
    pushResult(results, "warn", "runtimePermissions duplicates", [...new Set(duplicatePermissions)].join(", "));
  }

  const sourceEntries = [];
  const bundleCandidates = [bundle?.html, bundle?.script, bundle?.style].map((value) => safeText(value)).filter(Boolean);
  for (const relativePath of bundleCandidates) {
    const resolved = path.join(kit.kitDir, relativePath);
    // eslint-disable-next-line no-await-in-loop
    if (await pathExists(resolved, "file")) {
      // eslint-disable-next-line no-await-in-loop
      sourceEntries.push({
        ...createSourceEntry(relativePath, await fs.readFile(resolved, "utf8")),
      });
    }
  }
  const combinedSource = sourceEntries.map((item) => item.analysisContent).join("\n");
  const inferredPermissions = capabilityHints
    .filter((item) => item.patterns.some((pattern) => pattern.test(combinedSource)))
    .map((item) => item.permission);
  const missingPermissions = inferredPermissions.filter((item) => !declaredPermissions.includes(item));

  if (missingPermissions.length === 0) {
    pushResult(results, "pass", "runtimePermissions heuristic", inferredPermissions.length > 0 ? "no obvious gaps" : "no common capability patterns detected");
  } else {
    pushResult(results, "fail", "runtimePermissions heuristic", `missing=${missingPermissions.join(", ")}`);
  }

  if (inferredPermissions.includes("network.fetch") && kit.manifest?.permissions?.needsNetwork !== true) {
    pushResult(results, "warn", "manifest.permissions.needsNetwork", "network.fetch detected but needsNetwork is not true");
  }
  if (inferredPermissions.includes("ai.request") && kit.manifest?.permissions?.needsAiAccess !== true) {
    pushResult(results, "warn", "manifest.permissions.needsAiAccess", "ai.request detected but needsAiAccess is not true");
  }

  for (const hazard of sourceHazards) {
    const matches =
      hazard.label === "external script src"
        ? findRawHazardMatches(sourceEntries, hazard.patterns)
        : findHazardMatches(sourceEntries, hazard.patterns);
    if (matches.length > 0) {
      pushResult(results, hazard.level, hazard.label, `${hazard.detail} Matched: ${matches.join(", ")}`);
    }
  }

  pushResult(
    results,
    "note",
    "Platform reminder",
    "KitStudio smoke passing does not guarantee Android Host parity. Re-check permissions, storage, file, network, and AI behavior on the real host. See docs/PLATFORM_COMPATIBILITY.md."
  );

  printResults(results);

  const hasFailure = results.some((item) => item.level === "fail");
  process.exit(hasFailure ? 1 : 0);
} catch (error) {
  pushResult(results, "fail", "doctor", String(error?.message || error));
  printResults(results);
  process.exit(2);
}
