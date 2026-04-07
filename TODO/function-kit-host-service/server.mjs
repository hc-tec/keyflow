import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");

const config = {
  host: process.env.FUNCTION_KIT_HOST_BIND || "127.0.0.1",
  port: Number(process.env.FUNCTION_KIT_HOST_PORT || "18789"),
  openclawRepoDir:
    process.env.FUNCTION_KIT_OPENCLAW_REPO_DIR ||
    path.join(workspaceRoot, "TODO", "ime-research", "repos", "openclaw"),
  openclawAgentId: process.env.FUNCTION_KIT_OPENCLAW_AGENT_ID || "main",
  openclawThinking: process.env.FUNCTION_KIT_OPENCLAW_THINKING || "low",
  requestTimeoutMs: Number(process.env.FUNCTION_KIT_OPENCLAW_TIMEOUT_MS || "45000"),
  requestBodyLimitBytes: Number(process.env.FUNCTION_KIT_REQUEST_BODY_LIMIT_BYTES || "1048576"),
};

let commandQueue = Promise.resolve();

function enqueueExclusive(task) {
  const pending = commandQueue.then(task, task);
  commandQueue = pending.catch(() => undefined);
  return pending;
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writeError(response, statusCode, code, message, retryable, details = {}) {
  writeJson(response, statusCode, {
    error: {
      code,
      message,
      retryable,
      details,
    },
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > config.requestBodyLimitBytes) {
      throw new Error("request body too large");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeRenderRequest(body) {
  const context = body?.context && typeof body.context === "object" ? body.context : {};
  const sourceMessage =
    (typeof context.sourceMessage === "string" && context.sourceMessage.trim()) ||
    (typeof body.sourceMessage === "string" && body.sourceMessage.trim()) ||
    "";
  const conversationSummary =
    (typeof context.conversationSummary === "string" && context.conversationSummary.trim()) ||
    (typeof body.conversationSummary === "string" && body.conversationSummary.trim()) ||
    "";
  const personaChips = normalizeStringArray(context.personaChips ?? body.personaChips);
  const modifiers = normalizeStringArray(body.modifiers);
  const preferredTone =
    (typeof body.preferredTone === "string" && body.preferredTone.trim()) || "balanced";
  const reason = (typeof body.reason === "string" && body.reason.trim()) || "function-kit-render";
  const constraints = body?.constraints && typeof body.constraints === "object" ? body.constraints : {};
  const candidateCount = clampInteger(constraints.candidateCount, 3, 1, 8);
  const maxCharsPerCandidate = clampInteger(constraints.maxCharsPerCandidate, 120, 12, 500);

  const requestContext = {
    sourceMessage:
      sourceMessage || "当前没有直接可用的原始消息，请根据摘要和 persona 生成候选回复。",
    conversationSummary,
    personaChips,
  };

  const recentMessages = [];
  if (conversationSummary) {
    recentMessages.push({ sender_role: "system", text: conversationSummary });
  }
  if (sourceMessage) {
    recentMessages.push({ sender_role: "other", text: sourceMessage });
  }
  if (recentMessages.length === 0) {
    recentMessages.push({
      sender_role: "system",
      text: "No conversation summary or source message was provided.",
    });
  }

  const toolInput = {
    current_message: {
      sender_role: "other",
      text: requestContext.sourceMessage,
    },
    conversation_context: {
      recent_messages: recentMessages,
      contact_profile: {
        persona_chips: personaChips,
        request_reason: reason,
        raw_context: context,
      },
    },
    persona: {
      tone: preferredTone,
      forbidden_promises: [],
      must_include: modifiers,
    },
    constraints: {
      candidate_count: candidateCount,
      max_chars_per_candidate: maxCharsPerCandidate,
    },
  };

  return {
    reason,
    preferredTone,
    modifiers,
    requestContext,
    toolInput,
    candidateCount,
    maxCharsPerCandidate,
  };
}

function buildAgentPrompt(normalizedRequest) {
  return [
    "You generate structured reply candidates for an IME Function Kit.",
    "Return ONLY one valid JSON object. Do not output markdown, code fences, or commentary.",
    "Output JSON schema:",
    JSON.stringify(
      {
        candidates: [
          {
            id: "candidate-1",
            text: "reply text",
            tone: "balanced",
            risk: "low",
            rationale: "why this candidate works",
            actions: [
              { type: "insert", label: "插入" },
              { type: "regenerate", label: "换一批" },
            ],
          },
        ],
        missing_context: [],
      },
      null,
      2,
    ),
    "Rules:",
    `- Produce exactly ${normalizedRequest.candidateCount} candidates unless the input clearly lacks context; then still produce your best effort candidates and list missing_context hints.`,
    `- Each candidate text must stay within ${normalizedRequest.maxCharsPerCandidate} characters.`,
    "- Use the same language as the input context. If the input is Chinese, reply in Chinese.",
    "- Keep candidates concise and directly sendable.",
    "- Do not invent facts, promises, or dates that are not supported by the input.",
    "- Keep risk strictly one of: low, medium, high.",
    "- Every candidate must include at least one insert action labeled 插入.",
    "Input JSON:",
    JSON.stringify(normalizedRequest.toolInput, null, 2),
  ].join("\n\n");
}

function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function tryExtractJsonObject(text) {
  const stripped = stripCodeFences(text);
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model output.");
  }
  return stripped.slice(firstBrace, lastBrace + 1);
}

function normalizeActions(actions, index) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return index === 0
      ? [{ type: "insert", label: "插入" }, { type: "regenerate", label: "换一批" }]
      : [{ type: "insert", label: "插入" }];
  }
  return actions
    .filter((action) => action && typeof action === "object")
    .map((action) => ({
      type: ["insert", "replace", "regenerate"].includes(action.type) ? action.type : "insert",
      label: typeof action.label === "string" && action.label.trim() ? action.label.trim() : "插入",
    }));
}

function normalizeModelOutput(parsed, normalizedRequest) {
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  if (candidates.length === 0) {
    throw new Error("Model output did not contain any candidates.");
  }

  const normalizedCandidates = candidates.slice(0, normalizedRequest.candidateCount).map((candidate, index) => {
    const text = typeof candidate?.text === "string" ? candidate.text.trim() : "";
    if (!text) {
      throw new Error(`Candidate ${index + 1} is missing text.`);
    }
    return {
      id:
        (typeof candidate?.id === "string" && candidate.id.trim()) || `candidate-${index + 1}`,
      text: text.slice(0, normalizedRequest.maxCharsPerCandidate),
      tone:
        (typeof candidate?.tone === "string" && candidate.tone.trim()) ||
        normalizedRequest.preferredTone,
      risk: ["low", "medium", "high"].includes(candidate?.risk) ? candidate.risk : "medium",
      rationale:
        (typeof candidate?.rationale === "string" && candidate.rationale.trim()) ||
        "模型未提供明确理由，按当前上下文做了保守生成。",
      actions: normalizeActions(candidate?.actions, index),
    };
  });

  return {
    candidates: normalizedCandidates,
    missing_context: normalizeStringArray(parsed?.missing_context),
  };
}

function runOpenClawJson(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-node.mjs", ...argumentsList], {
      cwd: config.openclawRepoDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeoutHandle = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`OpenClaw command timed out after ${config.requestTimeoutMs}ms.`));
    }, config.requestTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `OpenClaw exited with code ${code}.`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`OpenClaw returned invalid JSON: ${error.message}`));
      }
    });
  });
}

async function handleStatus(response) {
  try {
    const payload = await enqueueExclusive(() =>
      runOpenClawJson(["models", "status", "--agent", config.openclawAgentId, "--json"]),
    );
    writeJson(response, 200, payload);
  } catch (error) {
    writeError(response, 502, "openclaw_status_failed", error.message, true, {
      repoDir: config.openclawRepoDir,
      agentId: config.openclawAgentId,
    });
  }
}

async function handleRender(request, response) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    writeError(response, 400, "invalid_json_body", error.message, false);
    return;
  }

  let normalizedRequest;
  try {
    normalizedRequest = normalizeRenderRequest(body);
  } catch (error) {
    writeError(response, 400, "invalid_render_request", error.message, false);
    return;
  }

  try {
    const prompt = buildAgentPrompt(normalizedRequest);
    const agentPayload = await enqueueExclusive(() =>
      runOpenClawJson([
        "agent",
        "--local",
        "--agent",
        config.openclawAgentId,
        "--message",
        prompt,
        "--thinking",
        config.openclawThinking,
        "--json",
      ]),
    );

    const rawText =
      Array.isArray(agentPayload?.payloads) &&
      agentPayload.payloads.find((payload) => typeof payload?.text === "string")?.text;
    if (!rawText) {
      throw new Error("OpenClaw returned no text payload.");
    }

    const parsedModelOutput = JSON.parse(tryExtractJsonObject(rawText));
    const normalizedOutput = normalizeModelOutput(parsedModelOutput, normalizedRequest);

    writeJson(response, 200, {
      requestContext: normalizedRequest.requestContext,
      result: normalizedOutput,
      uiHints: {
        allowRegenerate: true,
      },
      meta: {
        provider: agentPayload?.meta?.agentMeta?.provider || null,
        model: agentPayload?.meta?.agentMeta?.model || null,
        durationMs: agentPayload?.meta?.durationMs || null,
        stopReason: agentPayload?.meta?.stopReason || null,
      },
    });
  } catch (error) {
    writeError(response, 502, "remote_render_failed", error.message, true, {
      repoDir: config.openclawRepoDir,
      agentId: config.openclawAgentId,
      endpoint: "/v1/function-kits/chat-auto-reply/render",
    });
  }
}

const server = http.createServer(async (request, response) => {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", `http://${request.headers.host || `${config.host}:${config.port}`}`);

  if (method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      ok: true,
      service: "function-kit-host-service",
      bind: `${config.host}:${config.port}`,
      openclawRepoDir: config.openclawRepoDir,
      agentId: config.openclawAgentId,
      queueMode: "serial",
    });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/openclaw/status") {
    await handleStatus(response);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/function-kits/chat-auto-reply/render") {
    await handleRender(request, response);
    return;
  }

  writeError(response, 404, "not_found", `No route for ${method} ${url.pathname}`, false);
});

server.listen(config.port, config.host, () => {
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "listening",
        bind: `${config.host}:${config.port}`,
        openclawRepoDir: config.openclawRepoDir,
        agentId: config.openclawAgentId,
        queueMode: "serial",
      },
      null,
      2,
    )}\n`,
  );
});
