const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const serviceRoot = path.resolve(__dirname, "..");
const config = {
  host: process.env.FUNCTION_KIT_HOST_HOST || "127.0.0.1",
  port: readInt(process.env.FUNCTION_KIT_HOST_PORT, 18789),
  authToken: clean(process.env.FUNCTION_KIT_HOST_AUTH_TOKEN),
  bodyLimitBytes: readInt(process.env.FUNCTION_KIT_HOST_BODY_LIMIT_BYTES, 262144),
  renderTimeoutMs: readInt(process.env.FUNCTION_KIT_OPENCLAW_RENDER_TIMEOUT_MS, 120000),
  statusTimeoutMs: readInt(process.env.FUNCTION_KIT_OPENCLAW_STATUS_TIMEOUT_MS, 30000),
  openclawRepo: path.resolve(
    process.env.FUNCTION_KIT_OPENCLAW_REPO ||
      path.resolve(__dirname, "..", "..", "ime-research", "repos", "openclaw")
  ),
  agentId: process.env.FUNCTION_KIT_OPENCLAW_AGENT_ID || "main",
  schemaPath: path.resolve(
    __dirname,
    "..",
    "..",
    "function-kits",
    "chat-auto-reply",
    "tools",
    "reply-generator",
    "output.schema.json"
  )
};
const outputSchema = JSON.parse(fs.readFileSync(config.schemaPath, "utf8"));
const serviceVersion = JSON.parse(fs.readFileSync(path.resolve(serviceRoot, "package.json"), "utf8")).version;
try {
  assertStartupConfig();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error: {
        code: "invalid_host_service_config",
        message: error?.message || "Invalid host service configuration.",
        retryable: false,
        details: {
          host: config.host,
          port: config.port,
          authRequired: !isLoopbackHost(config.host)
        }
      }
    })}\n`
  );
  process.exit(1);
}

class AppError extends Error {
  constructor(statusCode, code, message, retryable, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => sendError(response, asAppError(error)));
});

server.on("error", (error) => {
  process.stderr.write(
    `${JSON.stringify({
      error: {
        code: error?.code || "server_listen_failed",
        message: error?.message || "Server failed to start.",
        retryable: false,
        details: {
          host: config.host,
          port: config.port
        }
      }
    })}\n`
  );
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  process.stdout.write(
    `${JSON.stringify({
      service: "function-kit-host-service",
      version: serviceVersion,
      bind: `${config.host}:${config.port}`,
      authRequired: Boolean(config.authToken),
      openclawRepo: config.openclawRepo,
      agentId: config.agentId
    })}\n`
  );
});

async function handleRequest(request, response) {
  addHeaders(response);
  const url = new URL(request.url || "/", `http://${request.headers.host || `${config.host}:${config.port}`}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    const authorized = isAuthorizedRequest(request);
    const payload = {
      ok: true,
      service: "function-kit-host-service",
      version: serviceVersion,
      timestamp: new Date().toISOString(),
      authRequired: Boolean(config.authToken),
      authorized,
      bind: { host: config.host, port: config.port },
      routes: {
        health: "/health",
        openclawStatus: "/v1/openclaw/status",
        render: "/v1/function-kits/chat-auto-reply/render"
      }
    };
    if (authorized) {
      payload.dependencies = {
        openclawRepo: config.openclawRepo,
        openclawRepoExists: fs.existsSync(config.openclawRepo),
        outputSchemaPath: config.schemaPath
      };
    }
    return sendJson(response, 200, payload);
  }

  if (request.method === "GET" && url.pathname === "/v1/openclaw/status") {
    ensureAuthorizedRequest(request);
    return sendJson(response, 200, await getOpenClawStatus());
  }

  if (request.method === "POST" && url.pathname === "/v1/function-kits/chat-auto-reply/render") {
    ensureAuthorizedRequest(request);
    const body = await readJsonBody(request, config.bodyLimitBytes);
    return sendJson(response, 200, await renderChatAutoReply(body));
  }

  throw new AppError(404, "not_found", `Unsupported route: ${request.method || "UNKNOWN"} ${url.pathname}`, false, {
    method: request.method || "UNKNOWN",
    path: url.pathname
  });
}

function addHeaders(response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Function-Kit-Token");
}

function assertStartupConfig() {
  if (!isLoopbackHost(config.host) && !config.authToken) {
    throw new Error("FUNCTION_KIT_HOST_AUTH_TOKEN is required when binding the host service to a non-loopback address.");
  }
}

function isLoopbackHost(value) {
  const host = clean(value).toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isAuthorizedRequest(request) {
  if (!config.authToken) {
    return true;
  }
  return presentedAuthToken(request) === config.authToken;
}

function ensureAuthorizedRequest(request) {
  if (isAuthorizedRequest(request)) {
    return;
  }
  throw new AppError(401, "unauthorized", "Missing or invalid host service token.", false, {
    acceptedHeaders: ["Authorization: Bearer <token>", "X-Function-Kit-Token: <token>"]
  });
}

function presentedAuthToken(request) {
  const authorization = clean(request.headers?.authorization);
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return clean(request.headers?.["x-function-kit-token"]);
}

async function getOpenClawStatus() {
  const command = await runPnpm(
    ["openclaw", "models", "status", "--agent", config.agentId, "--json"],
    config.statusTimeoutMs,
    "openclaw_status_failed"
  );
  return extractJson(command.combined, "openclaw_status_invalid_json");
}

async function renderChatAutoReply(body) {
  const normalized = normalizeRequest(body);
  const prompt = buildPrompt(normalized);
  const command = await runPnpm(
    [
      "openclaw",
      "agent",
      "--local",
      "--agent",
      config.agentId,
      "--message",
      prompt,
      "--thinking",
      "low",
      "--json"
    ],
    config.renderTimeoutMs,
    "openclaw_render_failed"
  );
  const envelope = extractJson(command.combined, "openclaw_render_invalid_json");
  const text = extractAssistantText(envelope);
  const rawResult = extractJson(text, "openclaw_output_parse_failed");
  const result = normalizeReply(rawResult, normalized);

  return {
    requestContext: normalized.requestContext,
    result,
    uiHints: {
      allowRegenerate: true,
      emptyStateLabel: "暂无候选"
    },
    meta: {
      executionModeRequested: normalized.routing.requestedExecutionMode,
      resolvedExecutionMode: "remote-openclaw",
      backendClass: "external-agent-adapter",
      preferredBackendClass: normalized.routing.preferredBackendClass,
      preferredAdapter: normalized.routing.preferredAdapter,
      latencyBudgetMs: normalized.routing.latencyBudgetMs,
      agentId: config.agentId,
      provider: envelope?.meta?.agentMeta?.provider || null,
      model: envelope?.meta?.agentMeta?.model || null,
      durationMs: envelope?.meta?.durationMs || null,
      sessionId: envelope?.meta?.agentMeta?.sessionId || null,
      usage: envelope?.meta?.agentMeta?.usage || null
    }
  };
}

function buildPrompt(normalized) {
  return JSON.stringify({
    role: "reply-generator",
    instruction: "Return exactly one JSON object and nothing else. Do not output markdown, code fences, analysis, or extra keys.",
    rules: [
      `Produce between 1 and ${normalized.constraints.candidateCount} candidates.`,
      `Keep each candidate text within ${normalized.constraints.maxCharsPerCandidate} characters when practical.`,
      "Match the language used by the source message.",
      "Be conservative about promises, dates, delivery commitments, and unsupported facts.",
      "If context is missing, keep replies safe and add stable strings to missing_context.",
      'Every candidate must include an actions array containing at least {"type":"insert","label":"插入"}.',
      'You may add {"type":"replace","label":"替换"} or {"type":"regenerate","label":"换一批"} when appropriate.'
    ],
    output_schema: outputSchema,
    normalized_tool_input: normalized.toolInput,
    host_context: {
      requestContext: normalized.requestContext,
      preferredTone: normalized.preferredTone,
      modifiers: normalized.modifiers,
      reason: normalized.reason,
      routing: normalized.routing,
      manifest: normalized.manifest,
      slash: normalized.slash
    }
  });
}

function normalizeRequest(body) {
  if (!isObject(body)) {
    throw new AppError(400, "invalid_request", "Request body must be a JSON object.", false, null);
  }

  const context = pickObject(body.requestContext, body.context);
  const request = pickObject(body.request);
  const currentMessage = pickObject(body.current_message, body.currentMessage);
  const conversation = pickObject(body.conversation_context, body.conversationContext);
  const persona = pickObject(body.persona);
  const constraints = pickObject(body.constraints);
  const manifest = pickObject(body.manifest);
  const routing = pickObject(body.routing, body.ai);
  const sourceMessage = pickString(currentMessage.text, currentMessage.content, context.sourceMessage, body.sourceMessage);

  if (!sourceMessage) {
    throw new AppError(400, "invalid_request", "Missing source message.", false, {
      expectedFields: [
        "current_message.text",
        "currentMessage.text",
        "requestContext.sourceMessage",
        "context.sourceMessage",
        "sourceMessage"
      ]
    });
  }

  const modifiers = uniq([
    ...pickArray(request.modifiers, body.modifiers).map(clean),
    ...pickArray(body.modifierChips).map(clean)
  ]);
  const preferredTone = pickString(persona.tone, request.preferredTone, body.preferredTone, body.tone) || "balanced";
  const contactProfile = {
    ...pickObject(conversation.contact_profile, conversation.contactProfile, body.contactProfile)
  };
  const recentMessages = normalizeMessages(
    pickArray(
      conversation.recent_messages,
      conversation.recentMessages,
      body.recent_messages,
      body.recentMessages,
      context.recentMessages
    )
  );
  const personaChips = uniq([
    ...pickArray(context.personaChips, body.personaChips).map(clean),
    ...pickArray(contactProfile.prefers, contactProfile.persona_chips, contactProfile.personaChips).map(clean)
  ]);
  const forbiddenPromises = uniq(
    pickArray(persona.forbidden_promises, persona.forbiddenPromises, body.forbiddenPromises).map(clean)
  );
  const mustInclude = uniq([
    ...pickArray(persona.must_include, persona.mustInclude, body.mustInclude).map(clean),
    ...modifiers
  ]);
  const candidateCount = clamp(readNumber(constraints.candidate_count, constraints.candidateCount, body.candidateCount), 3, 1, 8);
  const maxCharsPerCandidate = clamp(
    readNumber(constraints.max_chars_per_candidate, constraints.maxCharsPerCandidate, body.maxCharsPerCandidate),
    120,
    1,
    500
  );
  const conversationSummary =
    pickString(
      context.conversationSummary,
      body.conversationSummary,
      contactProfile.conversation_summary,
      contactProfile.conversationSummary,
      conversation.summary
    ) || buildSummary(recentMessages, contactProfile, modifiers);

  if (conversationSummary && !contactProfile.conversation_summary && !contactProfile.conversationSummary) {
    contactProfile.conversation_summary = conversationSummary;
  }
  if (personaChips.length && !contactProfile.persona_chips && !contactProfile.personaChips) {
    contactProfile.persona_chips = personaChips;
  }
  if (modifiers.length) {
    contactProfile.modifiers = modifiers;
  }

  const toolInput = {
    current_message: {
      sender_role: normalizeRole(pickString(currentMessage.sender_role, currentMessage.senderRole, body.senderRole) || "other"),
      text: sourceMessage
    },
    conversation_context: {
      recent_messages: recentMessages
    },
    persona: {
      tone: preferredTone
    },
    constraints: {
      candidate_count: candidateCount,
      max_chars_per_candidate: maxCharsPerCandidate
    }
  };
  const timestamp = pickString(currentMessage.timestamp, body.timestamp);
  if (timestamp) {
    toolInput.current_message.timestamp = timestamp;
  }
  if (Object.keys(contactProfile).length) {
    toolInput.conversation_context.contact_profile = contactProfile;
  }
  if (forbiddenPromises.length) {
    toolInput.persona.forbidden_promises = forbiddenPromises;
  }
  if (mustInclude.length) {
    toolInput.persona.must_include = mustInclude;
  }

  return {
    reason: pickString(body.reason, request.reason) || "render",
    preferredTone,
    modifiers,
    manifest,
    slash: pickObject(body.routing?.slash, body.slash),
    routing: {
      requestedExecutionMode: pickString(routing.requestedExecutionMode, routing.executionMode, body.ai?.executionMode) || "unspecified",
      preferredBackendClass:
        pickString(routing.preferredBackendClass, routing.backendHints?.preferredBackendClass, body.ai?.preferredBackendClass) || null,
      preferredAdapter:
        pickString(routing.preferredAdapter, routing.backendHints?.preferredAdapter, body.ai?.preferredAdapter) || null,
      latencyBudgetMs: readNumber(routing.latencyBudgetMs, routing.backendHints?.latencyBudgetMs, body.ai?.latencyBudgetMs)
    },
    constraints: {
      candidateCount,
      maxCharsPerCandidate
    },
    requestContext: {
      sourceMessage,
      personaChips,
      conversationSummary
    },
    toolInput
  };
}

function normalizeReply(value, normalized) {
  if (!isObject(value)) {
    throw new AppError(502, "openclaw_output_invalid", "Model output must be a JSON object.", true, null);
  }
  const rawCandidates = pickArray(value.candidates);
  if (!rawCandidates.length) {
    throw new AppError(502, "openclaw_output_invalid", "Model output did not contain any candidates.", true, {
      keys: Object.keys(value)
    });
  }

  const seenIds = new Set();
  const candidates = rawCandidates
    .slice(0, normalized.constraints.candidateCount)
    .map((candidate, index) => normalizeCandidate(candidate, index, seenIds, normalized));

  return {
    candidates,
    missing_context: uniq(pickArray(value.missing_context, value.missingContext).map(clean))
  };
}

function normalizeCandidate(value, index, seenIds, normalized) {
  if (!isObject(value)) {
    throw new AppError(502, "openclaw_output_invalid", "Candidate must be an object.", true, { index });
  }
  const text = clean(value.text);
  if (!text) {
    throw new AppError(502, "openclaw_output_invalid", "Candidate text must not be empty.", true, { index });
  }

  const risk = clean(value.risk).toLowerCase();
  const allowedRisk = risk === "low" || risk === "medium" || risk === "high" ? risk : "medium";
  return {
    id: uniqueId(clean(value.id) || `candidate-${index + 1}`, seenIds),
    text,
    tone: clean(value.tone) || normalized.preferredTone,
    risk: allowedRisk,
    rationale: clean(value.rationale) || "根据当前上下文生成。",
    actions: normalizeActions(value.actions)
  };
}

function normalizeActions(value) {
  const allowed = new Set(["insert", "replace", "regenerate"]);
  const seen = new Set();
  const actions = [];

  for (const item of pickArray(value)) {
    const type = clean(typeof item === "string" ? item : item?.type).toLowerCase();
    if (!allowed.has(type) || seen.has(type)) {
      continue;
    }
    actions.push({
      type,
      label: clean(typeof item === "string" ? "" : item?.label) || actionLabel(type)
    });
    seen.add(type);
  }

  if (!seen.has("insert")) {
    actions.unshift({ type: "insert", label: "插入" });
  }
  return actions;
}

function actionLabel(type) {
  if (type === "replace") return "替换";
  if (type === "regenerate") return "换一批";
  return "插入";
}

function normalizeMessages(values) {
  return pickArray(values)
    .slice(0, 20)
    .map((item) =>
      isObject(item)
        ? {
            sender_role: normalizeRole(pickString(item.sender_role, item.senderRole) || "other"),
            text: pickString(item.text, item.content)
          }
        : null
    )
    .filter((item) => item && item.text);
}

function buildSummary(recentMessages, contactProfile, modifiers) {
  const parts = [];
  if (recentMessages.length) {
    parts.push(`最近消息 ${recentMessages.slice(-2).map((item) => `${item.sender_role}:${item.text}`).join(" | ")}`);
  }
  if (clean(contactProfile.relationship)) {
    parts.push(`关系 ${clean(contactProfile.relationship)}`);
  }
  if (Array.isArray(contactProfile.prefers) && contactProfile.prefers.length) {
    parts.push(`偏好 ${contactProfile.prefers.map(clean).filter(Boolean).join("、")}`);
  }
  if (modifiers.length) {
    parts.push(`即时指令 ${modifiers.join("；")}`);
  }
  return parts.join("；");
}

async function readJsonBody(request, limitBytes) {
  const body = await readBody(request, limitBytes);
  if (!body.length) {
    return {};
  }
  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw new AppError(400, "invalid_json", `Request body is not valid JSON: ${error.message}`, false, null);
  }
}

function readBody(request, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new AppError(413, "request_body_too_large", `Request body exceeds ${limitBytes} bytes.`, false, null));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", (error) => reject(new AppError(400, "request_body_read_failed", error.message, true, null)));
  });
}

function runPnpm(args, timeoutMs, code) {
  if (!fs.existsSync(config.openclawRepo)) {
    throw new AppError(503, "openclaw_repo_missing", `OpenClaw repo directory does not exist: ${config.openclawRepo}`, false, null);
  }

  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const child = isWindows
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm", ...args], {
          cwd: config.openclawRepo,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        })
      : spawn("pnpm", args, {
          cwd: config.openclawRepo,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        });
    let stdout = "";
    let stderr = "";
    let done = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new AppError(503, "openclaw_command_unavailable", `Failed to start pnpm: ${error.message}`, false, { args }));
    });
    child.on("close", (exitCode) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (timedOut) {
        reject(new AppError(504, "openclaw_timeout", `OpenClaw command timed out after ${timeoutMs} ms.`, true, { args }));
        return;
      }
      if (exitCode !== 0) {
        reject(
          new AppError(502, code, "OpenClaw command failed.", true, {
            args,
            exitCode,
            stdout: detailText(stdout),
            stderr: detailText(stderr)
          })
        );
        return;
      }
      resolve({ stdout, stderr, combined: `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() });
    });
  });
}

function extractAssistantText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (!isObject(value)) {
    throw new AppError(502, "openclaw_output_invalid", "OpenClaw envelope is not an object.", true, null);
  }

  const payloads = pickArray(value.payloads)
    .map((item) => (typeof item === "string" ? item : typeof item?.text === "string" ? item.text : ""))
    .map((item) => item.trim())
    .filter(Boolean);
  if (payloads.length) {
    return payloads.join("\n\n");
  }
  if (typeof value.text === "string" && value.text.trim()) {
    return value.text;
  }
  throw new AppError(502, "openclaw_output_missing", "OpenClaw response did not contain assistant text payloads.", true, null);
}

function extractJson(text, code) {
  const raw = clean(text);
  if (!raw) {
    throw new AppError(502, code, "Expected JSON content but received an empty response.", true, null);
  }
  const direct = tryJson(raw);
  if (direct.ok) {
    return direct.value;
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const parsed = tryJson(fenced[1].trim());
    if (parsed.ok) {
      return parsed.value;
    }
  }
  let bestParsed = null;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "{" && raw[index] !== "[") continue;
    const end = jsonEnd(raw, index);
    if (end === -1) continue;
    const parsed = tryJson(raw.slice(index, end + 1));
    if (parsed.ok) {
      const size = end - index + 1;
      if (!bestParsed || size > bestParsed.size) {
        bestParsed = {
          size,
          value: parsed.value
        };
      }
    }
  }
  if (bestParsed) {
    return bestParsed.value;
  }
  throw new AppError(502, code, "Failed to extract JSON from upstream output.", true, {
    snippet: detailText(raw)
  });
}

function jsonEnd(text, start) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) {
        return -1;
      }
      if (!stack.length) {
        return index;
      }
    }
  }
  return -1;
}

function tryJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  sendJson(response, error.statusCode, {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details || null
    }
  });
}

function asAppError(error) {
  return error instanceof AppError
    ? error
    : new AppError(500, "internal_error", error?.message || "Unexpected server error.", true, null);
}

function readInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function clamp(value, fallback, min, max) {
  const parsed = Number.isFinite(value) ? Math.trunc(value) : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function pickObject(...values) {
  for (const value of values) {
    if (isObject(value)) return value;
  }
  return {};
}

function pickArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function pickString(...values) {
  for (const value of values) {
    const result = clean(value);
    if (result) return result;
  }
  return "";
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniq(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const item = clean(value);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function normalizeRole(value) {
  const role = clean(value).toLowerCase();
  return role === "self" || role === "system" ? role : "other";
}

function uniqueId(base, seenIds) {
  let value = base;
  let suffix = 2;
  while (seenIds.has(value)) {
    value = `${base}-${suffix}`;
    suffix += 1;
  }
  seenIds.add(value);
  return value;
}

function detailText(value) {
  const text = clean(value);
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
