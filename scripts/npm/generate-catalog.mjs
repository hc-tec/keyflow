import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot, parseArgs, readJson, writeJson } from "./_lib.mjs";

const { args } = parseArgs(process.argv.slice(2));

const repoRoot = getRepoRoot();
const outRoot = path.resolve(repoRoot, String(args.get("out") ?? "artifacts/npm"));
const registry = String(args.get("registry") ?? "https://registry.npmjs.org/");

const metaPath = path.join(outRoot, "kit-packages.json");
const meta = await readJson(metaPath);
const kits = Array.isArray(meta?.kits) ? meta.kits : [];

const catalog = {
  kind: "keyflow.npm.catalog.v0",
  generatedAt: new Date().toISOString(),
  registry,
  packages: kits.map((k) => ({
    kitId: k.kitId,
    name: k.name,
    version: k.version,
    npm: { name: k.packageName, version: k.version },
    // Local pack metadata (useful for debugging; registry may differ after publish).
    dist: k.dist ?? null,
  })),
};

await writeJson(path.join(outRoot, "catalog.npm.json"), catalog);
console.log(`[npm] wrote: ${path.relative(repoRoot, path.join(outRoot, "catalog.npm.json"))}`);

