# AI Backend Schemas

These files define the host-side AI backend contract for Function Kits.

- `ai-backend-common.schema.json`
  Shared defs for execution modes, backend classes, backend hints, candidates, actions, tool calls, citations, usage, and errors.
- `ai-backend-request.schema.json`
  Request shape from the Function Kit host/router to an AI backend adapter.
- `ai-backend-response.schema.json`
  Response shape from an AI backend adapter back to the Function Kit host/router.

Suggested next integration points:

- Add `ai.executionMode` and `ai.backendHints` to each Function Kit manifest by referencing these schemas.
- Validate host-side adapter requests before calling a direct model backend or an external agent adapter.
- Add request/response fixture replay tests next to the existing Host Bridge contract tests.
