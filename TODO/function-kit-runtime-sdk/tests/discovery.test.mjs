import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDiscoveryIndex,
  matchDiscoveryEntries,
  normalizeDiscoveryManifest,
  parseSlashTrigger,
  resolveDiscoveryQuery
} from "../src/discovery.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

test("parseSlashTrigger detects a slash token at the current token boundary", () => {
  const parsed = parseSlashTrigger("Need a quick draft /reply");

  assert.deepEqual(parsed, {
    active: true,
    mode: "slash-searching",
    raw: "/reply",
    query: "reply",
    tokenStart: 19,
    tokenEnd: 25,
    replacementRange: {
      start: 19,
      end: 25
    }
  });
});

test("parseSlashTrigger ignores URLs, paths and fraction-like text", () => {
  assert.equal(parseSlashTrigger("https://function-kit.local"), null);
  assert.equal(parseSlashTrigger("/sdcard/Download"), null);
  assert.equal(parseSlashTrigger("ratio 1/2"), null);
});

test("normalizeDiscoveryManifest keeps chat-auto-reply slash metadata deterministic", () => {
  const manifest = readJson("TODO/function-kits/chat-auto-reply/manifest.json");
  const normalized = normalizeDiscoveryManifest(manifest);

  assert.equal(normalized.id, "chat-auto-reply");
  assert.equal(normalized.discovery.launchMode, "quick-action");
  assert.deepEqual(normalized.discovery.slash.commands, ["reply"]);
  assert.deepEqual(normalized.discovery.slash.aliases, [
    "auto-reply",
    "chat-reply",
    "wx-reply"
  ]);
  assert.equal(normalized.discovery.slash.matchers[0].pattern, "^wx([_-]?reply)?$");
});

test("matchDiscoveryEntries ranks exact commands ahead of aliases and blocked entries", () => {
  const index = buildDiscoveryIndex([
    {
      id: "chat-auto-reply",
      name: "Chat Auto Reply",
      description: "Generate candidate chat replies.",
      runtimePermissions: ["context.read"],
      triggers: {
        contextTypes: ["chat"]
      },
      discovery: {
        launchMode: "quick-action",
        slash: {
          commands: ["reply"],
          aliases: ["chat-reply"],
          tags: ["chat"]
        }
      }
    },
    {
      id: "team-reply-panel",
      name: "Team Reply Panel",
      description: "Open a full reply panel.",
      runtimePermissions: ["context.read", "input.replace"],
      discovery: {
        launchMode: "panel-first",
        slash: {
          aliases: ["reply"],
          tags: ["message"]
        }
      }
    }
  ]);

  const matches = matchDiscoveryEntries(index, "reply", {
    contextType: "chat",
    availablePermissions: ["context.read"],
    pinnedKitIds: ["chat-auto-reply"]
  });

  assert.equal(matches[0].id, "chat-auto-reply");
  assert.equal(matches[0].match.kind, "command-exact");
  assert.equal(matches[0].available, true);

  assert.equal(matches[1].id, "team-reply-panel");
  assert.equal(matches[1].match.kind, "alias-exact");
  assert.deepEqual(matches[1].blockedPermissions, ["input.replace"]);
});

test("resolveDiscoveryQuery bridges slash parsing and discovery search", () => {
  const manifest = readJson("TODO/function-kits/chat-auto-reply/manifest.json");
  const result = resolveDiscoveryQuery([manifest], "Draft /wxreply");

  assert.equal(result.token?.query, "wxreply");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, "chat-auto-reply");
  assert.equal(result.matches[0].match.kind, "regex");
});
