# AI Backend Protocol

## Scope

This protocol is for the host-side boundary between a Function Kit host/router and an AI backend adapter.

It is not the browser `Host Bridge` protocol.
It exists so that browser UIs stay provider-agnostic, do not hold API keys, and do not directly call external AI services.

## Files

- `TODO/function-kit-runtime-sdk/schemas/ai-backend-common.schema.json`
- `TODO/function-kit-runtime-sdk/schemas/ai-backend-request.schema.json`
- `TODO/function-kit-runtime-sdk/schemas/ai-backend-response.schema.json`

## Backend Classes

- `direct-model`
  Default for fast text enhancement tasks such as rewrite, translate, summarize, and candidate reply generation.
- `bounded-tool-calling-agent`
  For explicit multi-step tasks with a bounded tool list, bounded reasoning, and user confirmation before risky actions.
- `external-agent-adapter`
  For integrating an external system such as OpenClaw or a future nanobot-style backend through a host-owned adapter layer.
- `local-demo`
  Preview and test mode only. This should not be treated as a production AI route.

## Execution Modes

- `local-demo`
  Local preview or fixture-driven mode.
- `direct-model`
  One-shot or low-step text generation path.
- `bounded-tool-calling-agent`
  Explicitly bounded session agent path.
- `external-agent-adapter`
  Generic route for a host-managed external agent backend.
- `remote-openclaw`
  Compatibility alias for current PoC/runtime labels already present elsewhere in the repo.
  New manifest-level declarations should prefer `external-agent-adapter` plus `backendHints.preferredAdapter = "openclaw"`.

## Backend Hints

`backendHints` is optional and gives the host/router a routing preference without hard-binding a kit to one backend implementation.

Useful fields:

- `preferredBackendClass`
- `preferredAdapter`
- `preferredModelFamily`
- `requiredCapabilities`
- `latencyTier`
- `latencyBudgetMs`
- `allowFallbacks`
- `allowBackgroundPreparation`
- `requireStructuredJson`
- `maxToolCalls`
- `maxReasoningSteps`

## Request Contract

The request schema carries:

- identity: `requestId`, `kitId`, `surface`
- routing context: `scene`
- text and cursor context: `inputContext`
- policy boundaries: `allowedTools`, `allowedPermissions`
- latency budget: `latencyBudgetMs`
- execution routing: `executionMode`, optional `backendHints`

This is the minimum host-owned envelope that lets the backend stay replaceable.

## Response Contract

The response schema carries:

- routing echo: `requestId`, `backendClass`, `executionMode`
- structured result mode: `mode`
- UI-renderable payloads: `candidates`, `actions`
- optional side channels: `toolCalls`, `citations`
- control flags: `requiresConfirmation`
- diagnostics: `usage`, `debugInfo`, `error`

The host should keep converting this response into Function Kit UI payloads such as `candidates.render` or host-side action cards.

## Suggested Manifest Integration

This change does not edit any kit manifest.
The intended future integration point is:

```json
{
  "ai": {
    "executionMode": "direct-model",
    "backendHints": {
      "preferredBackendClass": "direct-model",
      "preferredAdapter": "openclaw",
      "requiredCapabilities": ["structured-output"],
      "latencyTier": "interactive",
      "latencyBudgetMs": 1200,
      "requireStructuredJson": true,
      "allowFallbacks": true
    }
  }
}
```

## Routing Guidance

- `reply`, `rewrite`, `translate`, `summarize`
  Prefer `direct-model`.
- `schedule`, `task`, `memory-write`, explicit tool use
  Prefer `bounded-tool-calling-agent`.
- workspace-heavy or skills-heavy tasks
  Prefer `external-agent-adapter` with `preferredAdapter = "openclaw"`.

## Immediate Host Integration Points

- Validate outbound host requests against `ai-backend-request.schema.json`.
- Validate adapter results against `ai-backend-response.schema.json`.
- Keep adapter-specific details such as `openclaw agent --local --agent main --json` behind the host-owned adapter layer.
