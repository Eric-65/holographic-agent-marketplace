# AI Agent Layer — Evaluation

Two automated suites, both run against `MockAIProvider` (deterministic,
zero network calls, no API key required) via the project's existing
zero-dependency test harness (`src/lib/policy/testKit.ts`), the same one
every prior milestone's tests use. Both are wired into the in-browser
conformance runner at `/policies` (`src/components/EngineConformance.tsx`)
alongside every other suite in the repo.

## `src/lib/ai/evaluation.test.ts` — functional correctness

Covers, end to end through the real policy engine (not mocks of
Holographic's own code — only the LLM call is deterministic-by-construction):

- `parseAmount` / `parseSchedule` / `parseDate` unit behavior (numeric,
  dollar-sign, spelled-out amounts; precision rejection; relative dates).
- `validateAIIntent` structural gate (accepts well-formed input, rejects
  unknown actions, rejects a `SCHEDULE_PAYMENT` with no schedule).
- `MockAIProvider` interpretation: a clear payment request produces a
  `CLEAR` structured intent; a missing amount or recipient produces
  `AMBIGUOUS` with the correct `missingFields` — the provider asks rather
  than guesses.
- `previewIntent`: a known recipient name resolves and is marked ready to
  execute; an unknown name is `NOT_FOUND` and marked not ready — never
  silently treated as approved.
- `requestExecution` end to end: a within-limits transfer produces a live
  execution request; an amount above the approval threshold routes to
  `AWAITING_USER` (never auto-executed); an amount above the transaction
  limit is `BLOCKED` by the policy engine; a read-only action like
  `BUDGET_CHECK` is rejected at the execution boundary (it never should
  reach it); a schedule is always created `REQUIRE_APPROVAL`.

## `src/lib/ai/security.test.ts` — adversarial / prompt injection

Drives a scriptable `FakeProvider` (implements `AIProvider` directly) so
the test can make the "model" say anything — a malformed action, an
attacker-chosen address, an injected instruction — independent of whether
`MockAIProvider` itself would ever naturally produce that output. See
`/docs/ai-agents/security-boundary.md` for the full claim-to-test mapping.

## Results (this milestone)

Full existing suite + the two new AI suites, run headlessly (Node +
esbuild bundle + an in-memory `localStorage` shim, mirroring the pattern
used for every prior milestone's verification in this environment — no
browser automation tool is available here):

```
TOTAL: 134/137 passed, 3 failed
```

The 3 failures are the same pre-existing, unrelated status-casing bugs
documented in the treasury-automation and motion-system milestone reports
(`src/lib/api/deployments.ts`, `src/lib/api/executions.ts`,
`src/lib/api/paymentRequests.ts` — `"active"` vs `"ACTIVE"`,
`"rejected"` vs `"CANCELLED"`). Untouched by this milestone; not AI-related.

All AI-specific tests (evaluation + security, 32 cases) pass.

## What is not covered

- No live evaluation against the real OpenAI model — no API key was
  available in this environment. `RealAIProvider` is implemented and
  type-checked against the current Responses API / Structured Outputs
  shape, but has not been exercised end-to-end against a live key.
- No adversarial testing of an actual model's willingness to comply with
  the system prompt's instructions (e.g. resisting injected instructions
  itself) — the security suite instead verifies that Holographic's own
  code never depends on the model resisting anything, which is the
  property that actually matters (see security-boundary.md).
