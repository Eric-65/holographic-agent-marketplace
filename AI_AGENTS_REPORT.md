# Holographic AI Agents — Milestone Report

Financial agents in Holographic now have a real AI intelligence layer —
OpenAI's Responses API, server-side only, with a deterministic default
provider requiring no key. Nothing about the existing security
architecture changed to make room for it: AI proposes, the same
pre-existing policy engine, budget engine, recipient allowlist, and wallet
authorization step decide and execute, exactly as they did before this
milestone. See `AI_AGENT_SPEC.md` for the canonical pipeline description
and `/docs/ai-agents/` for the supporting architecture, security-boundary,
and evaluation documents.

## 1. What was built

- **Provider abstraction** (`src/lib/ai/types.ts`): `AIProvider` interface
  with two implementations. `MockAIProvider` — deterministic, rule-based,
  zero network calls — is the default, active provider; the app requires
  no API key to run or to exercise every AI-assisted flow.
  `RealAIProvider` calls server-side `/api/ai/*` functions over `fetch`.
- **Structured intent contract** (`src/lib/ai/schema.ts`): a hand-rolled,
  dependency-free `validateAIIntent()` — the first gate every provider
  output passes through. Rejects malformed/unknown output outright; never
  repairs it.
- **Deterministic NL parsing**: `parseAmount.ts` (integer minor-unit
  arithmetic only, rejects negative/infinite/imprecise amounts) and
  `parseSchedule.ts` (frequency + relative/absolute dates). Both are pure,
  synchronous, and re-run from scratch at the execution boundary — never
  trusted from an earlier turn.
- **Tool layer** (`src/lib/ai/tools.ts`): tenant-scoped read/propose
  functions — recipient resolution (only ever returns an address already
  in the user's own approved-recipient list), capability checks, budget
  and pending-approval summaries, status lookups. No function here writes
  to policy, budget, or execution state.
- **The execution boundary** (`src/lib/ai/requestExecution.ts`): the one
  function any AI-facing code may call to act on a validated intent. It
  re-derives the deployment/capability/recipient/amount from scratch and
  hands off to the exact same `createExecutionRequest` / `createSchedule` /
  `createPaymentRequest` / `validateAction` calls every non-AI flow already
  uses. It never imports `executePrivateTransfer` or
  `authorizeExecutionRequest` — the wallet call still only happens from the
  pre-existing `ApprovalDialog` / `ExecutionRequestCard` UI behind the
  user's own click.
- **Server-side AI calls**: `api/_lib/openaiClient.ts` (the only place
  `OPENAI_API_KEY` is read; uses the current Responses API with Structured
  Outputs — `client.responses.parse()` + `zodTextFormat`), `api/ai/interpret.ts`,
  `api/ai/explain.ts`, `api/ai/status.ts` — Web-standard `Request`/`Response`
  handlers matching the Vercel Edge Function convention, plus
  `vite.apiBridge.ts`, a Vite dev-server plugin that runs the exact same
  handler modules locally so `npm run dev` behaves identically to
  production.
- **UI**: a new `/assistant` route (`src/app/assistant/page.tsx`,
  `src/components/ai/CommandPanel.tsx`, `IntentPreview.tsx`) — a chat
  interface that answers informational questions from real tool data
  (never the model's own guess), and for money-moving proposals renders an
  explicit confirmation card the user must click before `requestExecution`
  is ever called. A "Why?" affordance calls `provider.explainDecision`
  with a sanitized evidence summary.
- **Persistence**: three new tables (`ai_intents`, `ai_conversation_turns`,
  `ai_trace_events`) and their API layer (`src/lib/api/aiIntents.ts`) —
  every provider call, validation outcome, and policy decision along the
  way is recorded for audit, with conversation history trimmed to 40 turns
  per session (never grows unbounded, never substitutes for policy).
- **Tests**: `src/lib/ai/evaluation.test.ts` (functional correctness
  against `MockAIProvider`) and `src/lib/ai/security.test.ts` (adversarial
  suite against a scriptable fake provider — malformed output, attacker
  addresses, prompt injection, cross-tenant access, nonsense amounts — all
  asserted to fail safely with zero wallet-facing side effects). Both
  wired into the existing in-browser conformance runner at `/policies`.

## 2. A real bug this milestone's own tests caught and fixed

Writing the security/evaluation suites surfaced two real gaps, fixed before
this report was written, not glossed over:

- `parseAmount("-50 USDC")` was silently parsed as **positive** 50 — the
  numeric regex had no anchor against a leading minus sign. Fixed with an
  explicit negative-amount guard; caught by `security.test.ts`.
- The existing capability-mapping helper (`validateIntentCapability` in
  `src/lib/agents/capabilities.ts`, pre-dating this milestone) had no entry
  for the AI action names `SCHEDULE_PAYMENT` / `PAYMENT_REQUEST` against
  their plural capability ids (`SCHEDULED_PAYMENTS` / `PAYMENT_REQUESTS`),
  so a correctly-authorized agent was being rejected as "not eligible."
  Fixed by adding the missing mapping entries (additive, does not change
  any existing mapping's behavior); caught by `evaluation.test.ts`.

## 3. Security architecture — unchanged, extended

Nothing about the pre-existing chain (structured intent → capability
validation → deterministic policy engine → budget/risk validation → human
approval if required → wallet authorization → STRK20 → receipt →
attestation → verification) was modified. The AI layer sits entirely in
front of it, at the "structured intent" stage, and every step downstream
of that re-validates independently rather than trusting anything the model
said. Full claim-by-claim mapping to code and tests is in
`/docs/ai-agents/security-boundary.md`.

## 4. Privacy / data minimization

The AI never sees seed phrases, private keys, viewing keys, wallet
credentials, or database credentials. Context sent to a provider is
limited to: an action list, the user's own recipient *names* (never
addresses), budget *names*, and capability list. `OPENAI_API_KEY` /
`AI_MODEL` are read only server-side and are deliberately not
`VITE_`-prefixed — confirmed absent from the production `dist/index.html`
bundle after `npm run build`.

## 5. Test and build results

- `npx tsc --noEmit` — zero errors (now also covers `api/` and
  `vite.apiBridge.ts`, added to `tsconfig.json`'s `include`, which
  previously only checked `src`).
- Full suite, headless (Node + esbuild bundle + in-memory `localStorage`
  shim, same harness pattern as every prior milestone in this
  environment): **134/137 passing**. The 3 failures are the same
  pre-existing, unrelated status-casing bugs already documented in the
  treasury-automation and motion-system reports — untouched by this work.
  All 32 AI-specific test cases (evaluation + security) pass.
- `npm run build` — succeeds. Production bundle: 1.56 MB / gzip 426 KB (up
  from 1.51 MB / 413 KB after the motion-system milestone) — the cost of
  the AI orchestration/UI code actually being included; the `openai` npm
  package itself is **not** in this bundle, since nothing under `src/`
  imports it — confirmed by the bundle size not growing by that package's
  footprint.
- Local dev smoke test: `npm run dev`, then `GET /api/ai/status` → `200
  {"configured":false,"model":null}` (correctly reports no key present);
  `POST /api/ai/interpret` → `503` (correctly fails closed rather than
  fabricating a response) — both against the `vite.apiBridge.ts` dev
  bridge, confirming it correctly mounts and routes to the same handler
  code that will run on Vercel.

## 6. Known limitations (disclosed, not hidden)

- **No live OpenAI evaluation.** `RealAIProvider` and the server-side
  Responses API integration are implemented against the current, verified
  API shape (fetched live from OpenAI's docs this session — Structured
  Outputs via `responses.parse()` + `zodTextFormat`, not the deprecated
  `response_format`), but no API key was available in this environment to
  exercise them end-to-end. Everything the security properties in this
  report depend on is verified against `MockAIProvider`, which is
  deliberately the shipped default regardless.
- **No browser/device testing.** The `/assistant` UI was verified via
  `tsc`, the headless test suite, a production build, and a local dev
  smoke test of the API bridge — not in an actual browser viewport. No
  browser-automation tool is available in this environment, the same
  disclosed gap carried from the treasury-automation and motion-system
  milestones.
- **Cairo contracts untouched, untested.** `scarb`/`snforge` are not
  installed in this sandboxed environment (no admin rights; no portable
  distribution fetched this session). This milestone did not modify
  anything under `contracts/`, so there is no regression risk specific to
  this work — but the tests were not re-run to confirm that independently.
- **Mobile nav crowding.** The desktop sidebar and mobile bottom nav share
  one list; adding "Assistant" brings the bottom nav to 10 items on a
  phone-width viewport, which was already a pre-existing density concern
  before this milestone (not solved here — a responsive nav redesign is
  out of scope for this change).
- **`EXECUTION_STATUS`/`VERIFICATION_STATUS` require an explicit reference
  ID** from the user; there's no fuzzy "the payment I made yesterday"
  matching.

## 7. Recommended next milestone

Close the two gaps this milestone's own disclosure flags as real and
load-bearing, in order: (1) a live OpenAI evaluation pass once a key is
available — confirm `RealAIProvider` actually round-trips through
`/api/ai/interpret` end to end, not just against the mocked 503 path; (2) a
genuine browser/device QA pass of `/assistant`, carried forward from two
prior milestones now three milestones deep as an open item.
