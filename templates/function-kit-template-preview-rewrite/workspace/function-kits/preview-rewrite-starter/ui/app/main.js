const kitMeta = Object.freeze({
  kitId: "preview-rewrite-starter",
  displayName: "Preview Rewrite Starter",
  description: "Read current input, generate a preview, then replace only after confirmation.",
  surface: "panel",
});

const previewContext = Object.freeze({
  sourceMessage: "this sentence have a small mistake and needs fixing",
  sourcePackage: "preview.mock.host",
  selectedText: "this sentence have a small mistake and needs fixing",
});

const kit = globalThis.FunctionKitRuntimeSDK.createKit({
  kitId: kitMeta.kitId,
  surface: kitMeta.surface,
  connect: {
    timeoutMs: 20000,
    retries: 3,
  },
  preview: {
    grantAll: true,
    context: previewContext,
  },
});

document.title = kitMeta.displayName;

function safeText(value) {
  return typeof value === "string" ? value : "";
}

function trimText(value) {
  return safeText(value).trim();
}

function resolveRuntimeError(error) {
  if (!error) return { code: "", message: "unknown error" };
  if (typeof error === "string") return { code: "", message: error };
  return {
    code: safeText(error.code),
    message: trimText(error.message) || JSON.stringify(error),
  };
}

function formatAiError(error) {
  const resolved = resolveRuntimeError(error);
  if (resolved.code === "permission_denied") return "Missing required permission.";
  if (resolved.code === "ai_request_not_ready") return "Host AI is not configured yet.";
  return `Generate failed: ${resolved.message}`;
}

function extractContextText(context) {
  const ctx = context && typeof context === "object" ? context : {};
  const selected = trimText(ctx.selectedText);
  const sourceMessage = trimText(ctx.sourceMessage);
  const preedit = trimText(ctx.preeditText);
  const combined = trimText(`${safeText(ctx.beforeCursor)}${safeText(ctx.afterCursor)}`);
  return selected || sourceMessage || preedit || combined;
}

function extractInvocationText(invocation) {
  const contextText = extractContextText(invocation && invocation.context);
  const clipboardText = trimText(invocation && invocation.clipboardText);
  return contextText || clipboardText;
}

function normalizePreviewText(text) {
  return trimText(text).replace(/\r\n/g, "\n");
}

function hasPreviewChange(sourceText, outputText) {
  return normalizePreviewText(sourceText) !== normalizePreviewText(outputText);
}

function cleanAiText(text) {
  let value = trimText(text);
  if (!value) return "";
  value = value.replace(/^```[a-zA-Z]*\s*/g, "").replace(/```\s*$/g, "").trim();
  value = value.replace(/^(result|preview|rewritten|fixed)[:：]\s*/i, "").trim();
  value = value.replace(/^["“”']+/, "").replace(/["“”']+$/, "").trim();
  return value;
}

function extractStructuredText(outputJson) {
  if (!outputJson || typeof outputJson !== "object") return "";
  const directValues = [outputJson.text, outputJson.result, outputJson.previewText, outputJson.outputText];
  const resolved = directValues.find((value) => trimText(value));
  return cleanAiText(resolved);
}

function extractAiResult(response) {
  const payload = response && typeof response === "object" ? response : {};
  const output = payload.output && typeof payload.output === "object" ? payload.output : null;

  const directText = cleanAiText(output && output.text);
  if (directText) {
    return { ok: true, text: directText, message: "" };
  }

  const structured =
    output && output.type === "json" && output.json && typeof output.json === "object" ? output.json : null;
  const structuredText = extractStructuredText(structured);
  if (structuredText) {
    return { ok: true, text: structuredText, message: "" };
  }

  if (output && output.type === "json") {
    return {
      ok: false,
      text: "",
      message: "Host returned structured JSON, not a replacement text preview.",
    };
  }

  if (output && trimText(output.type)) {
    return {
      ok: false,
      text: "",
      message: `Host returned ${output.type}; expected text.`,
    };
  }

  return { ok: false, text: "", message: "Model did not return usable text." };
}

function buildPrompt(sourceText) {
  const systemPrompt =
    "You are a careful text replacement assistant. Return only the final replacement text. Do not explain, label, quote, or wrap the result.";

  const userPrompt =
    "Create a clean replacement preview for the text below. Keep the original meaning unless the product goal requires a change.\n\n" +
    `Text:\n${sourceText}`;

  return {
    systemPrompt,
    userPrompt,
    taskTitle: "Generate text preview",
    temperature: 0.15,
    maxTokens: Math.min(1200, Math.max(160, sourceText.length * 2 + 80)),
  };
}

function createPlainSegments(text) {
  const value = safeText(text);
  return value ? [{ text: value, className: "" }] : [];
}

function pushSegment(segments, text, className) {
  if (!text) return;
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.className === className) {
    lastSegment.text += text;
    return;
  }
  segments.push({ text, className });
}

function buildDiffSegments(sourceText, resultText) {
  const sourceChars = Array.from(safeText(sourceText));
  const resultChars = Array.from(safeText(resultText));
  const sourceLength = sourceChars.length;
  const resultLength = resultChars.length;

  if (!sourceLength && !resultLength) {
    return { original: [], result: [] };
  }

  if (sourceLength * resultLength > 180000) {
    return {
      original: createPlainSegments(sourceText),
      result: createPlainSegments(resultText),
    };
  }

  const dp = Array.from({ length: sourceLength + 1 }, () => new Array(resultLength + 1).fill(0));

  for (let sourceIndex = 1; sourceIndex <= sourceLength; sourceIndex += 1) {
    for (let resultIndex = 1; resultIndex <= resultLength; resultIndex += 1) {
      if (sourceChars[sourceIndex - 1] === resultChars[resultIndex - 1]) {
        dp[sourceIndex][resultIndex] = dp[sourceIndex - 1][resultIndex - 1] + 1;
      } else {
        dp[sourceIndex][resultIndex] = Math.max(dp[sourceIndex - 1][resultIndex], dp[sourceIndex][resultIndex - 1]);
      }
    }
  }

  const operations = [];
  let sourceIndex = sourceLength;
  let resultIndex = resultLength;

  while (sourceIndex > 0 || resultIndex > 0) {
    if (sourceIndex > 0 && resultIndex > 0 && sourceChars[sourceIndex - 1] === resultChars[resultIndex - 1]) {
      operations.push({
        type: "same",
        sourceChar: sourceChars[sourceIndex - 1],
        resultChar: resultChars[resultIndex - 1],
      });
      sourceIndex -= 1;
      resultIndex -= 1;
      continue;
    }

    if (
      resultIndex > 0 &&
      (sourceIndex === 0 || dp[sourceIndex][resultIndex - 1] >= dp[sourceIndex - 1][resultIndex])
    ) {
      operations.push({
        type: "insert",
        sourceChar: "",
        resultChar: resultChars[resultIndex - 1],
      });
      resultIndex -= 1;
      continue;
    }

    operations.push({
      type: "delete",
      sourceChar: sourceChars[sourceIndex - 1],
      resultChar: "",
    });
    sourceIndex -= 1;
  }

  operations.reverse();

  const originalSegments = [];
  const resultSegments = [];

  for (const operation of operations) {
    if (operation.type === "same") {
      pushSegment(originalSegments, operation.sourceChar, "");
      pushSegment(resultSegments, operation.resultChar, "");
      continue;
    }

    if (operation.type === "delete") {
      pushSegment(originalSegments, operation.sourceChar, "diff-mark--original");
      continue;
    }

    pushSegment(resultSegments, operation.resultChar, "diff-mark--result");
  }

  return {
    original: originalSegments,
    result: resultSegments,
  };
}

const app = globalThis.PetiteVue.reactive({
  busy: false,
  screen: "editor",
  sourceText: "",
  resultText: "",
  feedbackText: "",
  feedbackKind: "error",
  hasChanges: false,
  originalSegments: [],
  resultSegments: [],
  previewRevision: 0,
  bootstrapCompleted: false,
  lastInvocationId: "",
  caps: {
    canReadContext: false,
    canReplace: false,
    canAiRequest: false,
  },

  get canGenerate() {
    return !this.busy && trimText(this.sourceText).length > 0;
  },

  get canReplace() {
    return !this.busy && this.screen === "preview" && this.hasChanges && this.caps.canReplace;
  },

  syncCapabilities() {
    this.caps.canReadContext = kit.hasPermission("context.read");
    this.caps.canReplace = kit.hasPermission("input.replace");
    this.caps.canAiRequest = kit.hasPermission("ai.request");
  },

  setFeedback(text, kind = "error") {
    this.feedbackText = trimText(text);
    this.feedbackKind = kind;
  },

  clearFeedback() {
    this.feedbackText = "";
    this.feedbackKind = "error";
  },

  clearPreviewState() {
    this.resultText = "";
    this.hasChanges = false;
    this.originalSegments = [];
    this.resultSegments = [];
  },

  resetPreviewScroll() {
    requestAnimationFrame(() => {
      document.querySelectorAll(".compare-card__body").forEach((element) => {
        element.scrollTop = 0;
      });
    });
  },

  updateSource(value) {
    this.sourceText = safeText(value);
    this.screen = "editor";
    this.clearPreviewState();
    this.clearFeedback();
  },

  buildPreview(sourceText, resultText, hasChanges) {
    this.resultText = resultText;
    this.hasChanges = hasChanges;
    const segments = buildDiffSegments(sourceText, resultText);
    this.originalSegments = segments.original.length ? segments.original : createPlainSegments(sourceText);
    this.resultSegments = segments.result.length ? segments.result : createPlainSegments(resultText);
    this.previewRevision += 1;
    this.screen = "preview";
    this.resetPreviewScroll();
  },

  backToEditor() {
    this.screen = "editor";
    this.clearPreviewState();
    this.clearFeedback();
  },

  async loadFromContext({ silent = false } = {}) {
    if (!this.caps.canReadContext) {
      if (!silent) {
        this.setFeedback("Missing context.read permission.");
      }
      return false;
    }

    try {
      const context = await kit.context.refresh({ reason: "preview-rewrite-load-context" });
      const text = extractContextText(context);
      if (!trimText(text)) {
        if (!silent) {
          this.setFeedback("No input text found.");
        }
        return false;
      }
      this.updateSource(text);
      return true;
    } catch (error) {
      if (!silent) {
        const resolved = resolveRuntimeError(error);
        this.setFeedback(`Read failed: ${resolved.message}`);
      }
      return false;
    }
  },

  async handleInvocation(invocation) {
    const invocationId = trimText(invocation && invocation.invocationId);
    if (invocationId && invocationId === this.lastInvocationId) {
      return;
    }
    this.lastInvocationId = invocationId;

    const sourceText = extractInvocationText(invocation);
    if (trimText(sourceText)) {
      this.updateSource(sourceText);
      return;
    }

    await this.loadFromContext({ silent: true });
  },

  async generatePreview() {
    const text = safeText(this.sourceText);
    if (!trimText(text)) {
      this.setFeedback("No text to process.");
      return;
    }

    if (!this.caps.canAiRequest) {
      this.setFeedback("Host AI is not configured yet.");
      return;
    }

    this.busy = true;
    this.clearFeedback();
    this.clearPreviewState();
    try {
      const prompt = buildPrompt(text);
      const response = await kit.ai.request({
        task: { title: prompt.taskTitle },
        route: { kind: "host-shared" },
        systemPrompt: prompt.systemPrompt,
        prompt: prompt.userPrompt,
        messages: [{ role: "user", content: prompt.userPrompt }],
        input: {
          originalText: text,
          intent: "preview-rewrite",
        },
        response: { type: "text" },
        temperature: prompt.temperature,
        maxTokens: prompt.maxTokens,
      });

      const extracted = extractAiResult(response);
      if (!extracted.ok) {
        this.setFeedback(extracted.message);
        return;
      }

      const hasChanges = hasPreviewChange(text, extracted.text);
      this.buildPreview(text, hasChanges ? extracted.text : text, hasChanges);
    } catch (error) {
      this.setFeedback(formatAiError(error));
    } finally {
      this.busy = false;
    }
  },

  confirmReplace() {
    if (!this.canReplace) {
      return;
    }

    try {
      kit.input.replace({
        text: this.resultText,
        source: kitMeta.kitId,
        label: kitMeta.displayName,
      });
      this.sourceText = this.resultText;
      this.backToEditor();
    } catch (error) {
      const resolved = resolveRuntimeError(error);
      this.setFeedback(`Replace failed: ${resolved.message}`);
    }
  },
});

globalThis.PetiteVue.createApp(app).mount("#app");

kit.on("ready", () => {
  app.syncCapabilities();

  if (!app.bootstrapCompleted) {
    app.bootstrapCompleted = true;
    const lastInvocation = kit.state && kit.state.lastInvocation ? kit.state.lastInvocation : null;
    if (lastInvocation) {
      app.handleInvocation(lastInvocation);
      return;
    }
    app.loadFromContext({ silent: true });
  }
});

kit.on("permissions", () => {
  app.syncCapabilities();
});

kit.on("context", ({ context }) => {
  if (trimText(app.sourceText) || app.screen !== "editor" || app.busy) {
    return;
  }
  const text = extractContextText(context);
  if (trimText(text)) {
    app.updateSource(text);
  }
});

kit.on("error", ({ error }) => {
  const resolved = resolveRuntimeError(error);
  app.setFeedback(resolved.message);
});

kit.bindings.onInvoke(({ invocation }) => {
  app.handleInvocation(invocation);
});

kit.connect().catch((error) => {
  const resolved = resolveRuntimeError(error);
  app.setFeedback(`Host handshake failed: ${resolved.message}`);
});
