import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const discoverySourcePath = path.join(projectRoot, "src", "discovery.mjs");
const indexSourcePath = path.join(projectRoot, "src", "index.js");
const outputPath = path.join(projectRoot, "dist", "function-kit-runtime.js");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripDiscoveryModule(source) {
  return source.replace(/^export\s+(?=const|function)/gm, "");
}

function stripIndexModule(source) {
  return source
    .replace(/^\s*import\s*\{[\s\S]*?\}\s*from "\.\/discovery\.mjs";\r?\n\r?\n/, "")
    .replace(/^\s*export\s*\{[\s\S]*?\}\s*from "\.\/discovery\.mjs";\r?\n\r?\n/, "")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+function\s+/gm, "function ")
    .replace(/^export\s+const\s+/gm, "const ");
}

function indentBlock(source) {
  return source
    .trim()
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}

const discoverySource = stripDiscoveryModule(readUtf8(discoverySourcePath));
const indexSource = stripIndexModule(readUtf8(indexSourcePath));

const bundle = `(function (globalObject) {
${indentBlock(discoverySource)}

${indentBlock(indexSource)}

  globalObject.FunctionKitRuntimeSDK = FunctionKitRuntimeSDK;
})(globalThis);
`;

fs.writeFileSync(outputPath, bundle, "utf8");
console.log(`Updated browser bundle: ${path.relative(projectRoot, outputPath)}`);
