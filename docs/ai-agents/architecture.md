# AI Agent Layer — Architecture

See `/AI_AGENT_SPEC.md` at the repo root for the canonical pipeline
description. This document covers the file layout and the client/server
split.

## File layout

```
src/lib/ai/
  types.ts             AIProvider interface, context/turn/explain types
  schema.ts            AIStructuredIntent + validateAIIntent() — client-safe, no zod
  parseAmount.ts        NL amount → integer minor units, no floating point
  parseSchedule.ts       NL date/schedule → { frequency, startDate, endDate }
  tools.ts              read/propose tool layer — every function userId-scoped
  MockAIProvider.ts      default provider, deterministic, zero network calls
  RealAIProvider.ts      calls /api/ai/* over fetch
  index.ts               orchestration: interpretMessage(), previewIntent(), getAIProvider()
  requestExecution.ts    the single gated execution boundary
  evaluation.test.ts     functional correctness suite (MockAIProvider)
  security.test.ts       adversarial/prompt-injection suite (scriptable fake provider)

src/lib/api/aiIntents.ts   "backend" persistence for ai_intents / ai_conversation_turns / ai_trace_events

api/_lib/
  openaiClient.ts         the ONLY place OPENAI_API_KEY is read — Responses API + Structured Outputs
  schemas.ts              server-side zod schemas (drives Structured Outputs; separate from src/lib/ai/schema.ts)
api/ai/
  interpret.ts            POST — generates a structured intent
  explain.ts              POST — plain-language explanation of a decision
  status.ts               GET — whether a real provider is configured (never leaks the key)

vite.apiBridge.ts          dev-server plugin — mounts /api/ai/* locally using the exact same handler modules

src/components/ai/
  CommandPanel.tsx         chat UI — sends messages, renders IntentPreview, "Why?" explanations
  IntentPreview.tsx        the confirmation card every money-moving proposal must pass through

src/app/assistant/page.tsx  route wiring
```

## Client/server split

Vite builds the entire client app to a single static `dist/index.html`
(`vite-plugin-singlefile`) — there has never been a real backend server in
this project. The `/api` directory is new for this milestone and is
**never** part of that client build: nothing under `src/` imports anything
under `api/` directly, only `RealAIProvider.ts` calls it over `fetch` at
runtime. This is what keeps `openai` and `OPENAI_API_KEY` out of the
browser bundle — confirmed by the production bundle size not increasing by
the `openai` package's footprint after it was added to `package.json`.

`api/ai/*.ts` handlers use the Web-standard `Request` → `Response`
signature (`export const config = { runtime: "edge" }`), matching Vercel
Edge Functions exactly. `vite.apiBridge.ts` is a Vite dev-server middleware
that intercepts `/api/*` locally, dynamically loads the same handler module
via `server.ssrLoadModule`, adapts the Node `IncomingMessage` to a Web
`Request`, calls the handler, and streams the `Response` back — so
`npm run dev` and the deployed Vercel functions run **identical code**,
not a parallel local-only implementation.

## Why Mock is the default provider

`MockAIProvider` is not a stand-in for testing only — it is the shipped
default. Reasons:

1. **No key required to use the app.** A user/judge/reviewer can exercise
   every AI-assisted flow with zero setup.
2. **The security property under test doesn't depend on model behavior.**
   "The model is not the authority" means the deterministic validation
   layer (`validateAIIntent`, `tools.ts`, `requestExecution`) must hold
   against *any* provider output — well-formed, ambiguous, or actively
   adversarial. A deterministic fake makes that reliably testable; a real
   model's non-determinism would make the same assertions flaky.
3. **Fail-closed, not fail-open.** If `OPENAI_API_KEY` isn't configured,
   `RealAIProvider` throws `AIUnavailableError` rather than silently
   degrading — the app never pretends a real model answered when it
   didn't.
