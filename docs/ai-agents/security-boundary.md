# AI Agent Layer — Security Boundary

This document exists to make one claim checkable: **the AI can propose, and
can never authorize.** Every subsection below names the exact code that
enforces it and the exact test that verifies it.

## Claim → code → test

| Claim | Enforced by | Verified by |
|---|---|---|
| The AI can never pick a recipient address itself | `resolveRecipientReference` / `resolveRawAddress` in `src/lib/ai/tools.ts` only ever return an address already in the user's own `approved_recipients` table | `security.test.ts` — "the AI can never choose its own recipient address" |
| A malformed/invented action is rejected, not repaired | `validateAIIntent` in `src/lib/ai/schema.ts` | `security.test.ts` — "rejects an invented action string outright" |
| Amounts are never floating-point, never negative, never "infinite" | `parseAmount` in `src/lib/ai/parseAmount.ts` | `evaluation.test.ts` (parseAmount suite) + `security.test.ts` (nonsense-amount suite) |
| Text fields (reason/explanation) are never parsed as instructions | Nothing in the codebase reads those fields as control flow — by construction | `security.test.ts` — "prompt injection has zero effect on policy or authorization" |
| The policy engine, not the AI, makes every allow/deny call | `requestExecution` calls the exact same `validateAction()` every other flow uses | `security.test.ts` — "the deterministic engine is always the one that blocks" |
| The AI can never reach the wallet | `requestExecution.ts` imports neither `executePrivateTransfer` nor `authorizeExecutionRequest` | `security.test.ts` — asserts `execution_results`/`execution_receipts` stay empty after every `requestExecution` call |
| One user's data never leaks to another | Every `tools.ts` function and `requestExecution` itself take and check `userId` | `security.test.ts` — "cross-tenant isolation" (both directions) |
| An AI-created schedule can never auto-authorize | `requestExecution` hardcodes `approvalMode: "REQUIRE_APPROVAL"` for `SCHEDULE_PAYMENT`, regardless of what the model said | `evaluation.test.ts` — "creates a SCHEDULE_PAYMENT as REQUIRE_APPROVAL regardless of amount" |

## Tool permission model

`src/lib/ai/tools.ts` functions are all READ or PROPOSE — none of them
mutate policy, budgets, or wallet state:

- **READ**: `findEligibleDeployments`, `getDeploymentContext`,
  `resolveRecipientReference`, `resolveRawAddress`, `listApprovedRecipients`,
  `getBudgetsSummary`, `getPendingApprovalsSummary`, `getStatusByReference`,
  `explainExecutionDecision`, `listSchedulesForUser`.
- **PROPOSE** (creates a row that still requires policy validation and,
  separately, wallet authorization before anything executes):
  `requestExecution` itself — the only function in the AI layer with any
  write capability toward execution/schedule/payment-request state, and
  even it never signs or moves funds.

There is no EXECUTE or SIGN capability anywhere in the AI layer. The
existing `executePrivateTransfer` / `authorizeExecutionRequest` functions
(pre-dating this milestone) remain the sole path to the wallet, reachable
only from the pre-existing `ApprovalDialog` / `ExecutionRequestCard` UI
behind an explicit user click.

## What a compromised or malicious model could still do

Worth stating plainly: if `OPENAI_API_KEY` pointed at a fully adversarial
model, that model could still cause `requestExecution` to be *called* with
a fabricated intent (e.g. claiming a huge amount to a resolvable
recipient). What it cannot do is make that call succeed — the transaction
limit, daily limit, recipient allowlist, and approval threshold are all
re-evaluated by the same `validateAction()` every manually-typed transfer
goes through, using the CURRENT policy, not anything cached from the
conversation. The worst a malicious model can do is generate a proposal a
human then has to look at and reject — never move money unilaterally.
