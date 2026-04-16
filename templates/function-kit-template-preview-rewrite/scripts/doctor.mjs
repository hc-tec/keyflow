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
      "  - manifest / entry bundle / icon paths",
      "  - vendored starter assets",
      "  - package.json -> keyflow.defaultKitId",
      "  - obvious runtimePermissions gaps from common API usage",
    ].join("\n")
  );
}

if (args.get("help")) {
  printUsage();
  process.exit(0);
}

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

  const sourceFiles = [];
  const bundleCandidates = [bundle?.html, bundle?.script, bundle?.style].map((value) => safeText(value)).filter(Boolean);
  for (const relativePath of bundleCandidates) {
    const resolved = path.join(kit.kitDir, relativePath);
    // eslint-disable-next-line no-await-in-loop
    if (await pathExists(resolved, "file")) {
      // eslint-disable-next-line no-await-in-loop
      sourceFiles.push(await fs.readFile(resolved, "utf8"));
    }
  }
  const combinedSource = sourceFiles.join("\n");
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
