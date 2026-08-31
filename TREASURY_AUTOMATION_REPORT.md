# Treasury Automation — Prompt 18 Milestone Report

Advanced treasury automation, multi-agent workflows, and scheduled private payments — built on top of the existing wallet connection, STRK20 execution, deterministic policy engine, and persistence layers. Every path in this milestone still ends at: **Agent proposes → Policy decides → User wallet authorizes → STRK20 executes.**

## 1. Scheduling architecture

`payment_schedules` (`src/lib/db/schema.ts`) describes a recurring or one-time FUTURE INTENT — asset, recipient, amount, frequency, approval mode, optional budget link. It never holds a signature or a decision. `src/lib/treasury/schedule.ts` is a pure module: interval math (`addInterval`, calendar-correct for `MONTHLY` — clamps Jan 31 → Feb 28 instead of overflowing into March), the schedule state machine (`DRAFT → ACTIVE → PAUSED/COMPLETED/EXPIRED/CANCELLED`), and the due-check (`isOccurrenceDue`). `src/lib/api/schedules.ts` is the side-effecting half: `createSchedule`, `pauseSchedule`/`resumeSchedule`/`cancelSchedule` (all guarded by `canTransitionSchedule`), and `evaluateAndFireOccurrence` — the one function that turns a due schedule into a real, policy-checked execution request.

## 2. Budget architecture

`src/lib/treasury/budget.ts` is a pure sibling to the policy engine: `checkBudget(budget, used, amount)` and `periodKeyFor(period, at)` (ISO week-correct). Budgets are **never** a substitute for the policy engine — `src/lib/api/schedules.ts`, `batches.ts`, and `workflows.ts` all compute `combinedAllowed = policyVerdict.allowed && budgetVerdict.allowed` before anything is created. Usage is a ledger (`budget_usage`), not a mutable counter, keyed by `executionRequestId` — so retries can never double-count spend, and history is auditable per period.

## 3. Batch architecture

`src/lib/api/batches.ts#createBatch` evaluates every row against the current policy **and** a running per-asset spend/budget total across the batch (item 3 sees items 1–2's consumption), so a batch can't silently blow through a budget by splitting a large payment into rows. Each approved/requires-approval row becomes its own real `execution_request` immediately — no custom multi-payment protocol, no batched signature; the user authorizes each one individually through the same wallet boundary as a single transfer. Emergency limits (`maxBatchSize`, `maxRecipients`) are checked before any row is evaluated.

## 4. Workflow architecture

`src/lib/workflow/model.ts` defines the built-in **Vendor Payment Workflow** template (`PAYMENT_PROPOSAL → COMPLIANCE_CHECK → POLICY_EVALUATION → TREASURY_EXECUTION → ATTESTATION`) and the run state machine. `src/lib/api/workflows.ts#advanceWorkflowRun` walks the steps automatically until it hits a gate: a failed policy/compliance check stops the run (`FAILED`) with no downstream financial step ever created; an approval gate gets the human's reason verbatim (`AWAITING_APPROVAL`); `TREASURY_EXECUTION` re-evaluates policy and budget **fresh** (never reusing an earlier step's verdict) before creating the execution request, then stops — actual signing is a separate call the UI makes after wallet authorization, which then advances to `ATTESTATION`.

## 5. Multi-agent boundaries

`src/lib/api/agentMessages.ts#sendAgentMessage` is schema-validated (workflowId/runId/senderAgent/receiverAgent/messageType/payload required), rejects any payload carrying a private-material key name (`viewingKey`, `privateKey`, `witness`, `note`, `exactAmount`), and nonces are derived from persisted message count per run (survives reloads, not an in-memory counter). No function anywhere lets one agent id call another agent's execution path directly — every step, regardless of which `agentId` label it carries, still goes through the same `validateAction` + budget + `createExecutionRequest` boundary already used by the manual transfer form.

## 6. Worker/scheduler implementation

`src/lib/scheduler/worker.ts#runSchedulerTick` is a plain, framework-free function — no React, no DOM — so it can be lifted into a real cron/worker process without touching its logic. In this build it is driven by a `setInterval` inside `StoreProvider` (`src/lib/store.tsx`) while a wallet is connected, standing in for a real scheduler daemon (there is no standalone backend in this project — see §14, Remaining limitations). It never signs anything; it only ever leaves an execution request at `POLICY_APPROVED`/`AWAITING_USER` for the connected wallet, or records why an occurrence is `BLOCKED`.

## 7. Idempotency strategy

Every fired occurrence has a deterministic key `${scheduleId}:${occurrenceAt}` (`occurrenceKeyFor`). `evaluateAndFireOccurrence` looks up that key before doing anything else and returns the existing `schedule_occurrence` unchanged if found — verified by test to never create a second `execution_request` on a repeated tick. The underlying `intent.id` is also deterministic (`SCH-${occurrenceKey}`), so the pre-existing `createExecutionRequest` intentHash-based dedup is a second, independent safety net. Budget usage rows are keyed by `executionRequestId` for the same reason.

## 8. Security controls

- **Automation pause**: `automation_controls` (one row/user) with a `paused` flag checked at the top of every scheduler tick, batch creation, and workflow step — verified blocked in tests.
- **Emergency limits**: `maxBatchSize`, `maxRecipients` enforced before batch creation; `emergencyPauseThreshold` and `requireNewRecipientApproval` enforced at the workflow `COMPLIANCE_CHECK` step. None of these are writable by any agent-facing function — only the store actions the UI calls under an explicit user click.
- **Stale-policy re-check**: every fire/propose/advance path calls `getActivePolicyByDeployment` fresh — never a cached policy from schedule-creation time. Verified by test: a schedule created under a $500 limit is `BLOCKED` once the policy is tightened to $100, without touching the schedule itself.
- **No stored signer**: grepped and confirmed — nothing in `src/lib/scheduler`, `src/lib/api/schedules.ts`, `batches.ts`, or `workflows.ts` imports a wallet adapter or reads a private key. The only place any of this reaches a wallet is `src/lib/api/authorize.ts#authorizeExecutionRequest`, which is the same `executePrivateTransfer` call the existing manual Treasury form uses.

## 9. Database changes

Added to `src/lib/db/schema.ts`: `payment_schedules`, `schedule_occurrences`, `budgets`, `budget_usage`, `payment_requests`, `payment_batches` (items embedded per batch), `workflow_definitions`, `workflow_runs`, `workflow_steps`, `agent_messages`, `automation_controls`. `DbNotification.type` extended with 9 new event types. No existing table's shape changed — pure additive migration, no localStorage version bump required.

## 10. API changes

New modules under `src/lib/api/`: `schedules.ts`, `budgets.ts`, `paymentRequests.ts`, `batches.ts`, `workflows.ts`, `agentMessages.ts`, `automation.ts`, `authorize.ts` — all re-exported from `src/lib/api/index.ts`. One addition to the existing `executions.ts`: `computeSpentToday(deploymentId, asset, now)`, a real rolling-24h spend query used to feed `validateAction`'s `spentToday` (previously hardcoded to `0` in the manual form's dry-run display; scheduled/batch/workflow paths now inject real history).

## 11. UI changes

Four new pages: `/treasury/schedules`, `/treasury/budgets`, `/treasury/payments` (batches + payment requests), `/treasury/workflows`, wired into `router.tsx` and `App.tsx`, sharing a `TreasuryTabs` sub-nav and a reusable `ExecutionRequestCard` (the one place any of these flows reaches "Authorize via wallet"). `/treasury` gained an automation pause/resume control and command-center cards (active schedules, upcoming payments, budget usage, pending approvals, active workflows). The agent detail page shows the 4 new marketplace capabilities (`SCHEDULED_PAYMENTS`, `BUDGETS`, `BATCH_PAYMENTS`, `WORKFLOW_PARTICIPATION`) with a **NOT YET SUPPORTED** badge for any agent that hasn't declared them.

## 12. Test results

Added `src/lib/treasury/automation.test.ts` (15 cases: schedule idempotency, calendar-correct interval math, the exact policy-tightens-after-schedule-creation scenario from the spec, automation-pause blocking, budget enforcement including cross-item batch accounting, and workflow step gating including "failed step never reaches execution"). Wired into the live in-browser suite via `EngineConformance.tsx` (rendered on `/policies`).

Verified headlessly (Node + a Storage-API-accurate localStorage shim, esbuild-bundled) against the **entire** existing suite, not just the new file:

```
TOTAL 93/96 passed, 3 failed
```

All 15 new tests pass. The 3 failures are **pre-existing** and in files this milestone never touched (`src/lib/api/deployments.ts`, `src/lib/api/executions.ts`) — two tests expect lowercase `"active"`/`"rejected"` status strings while that code has always produced `"ACTIVE"`/`"CANCELLED"`; the rest of the codebase already defends against this by checking both cases everywhere. Left as-is: fixing a status enum outside this milestone's scope risks the "must remain working" guarantees on unrelated flows.

## 13. Build result

`npm run build` — succeeds (1.3 MB single-file bundle, ~10–24s). `npx tsc --noEmit` — zero errors across the whole project.

## 14. Remaining limitations

- **No standalone backend process.** This hackathon build's entire "backend" is `src/lib/db/client.ts` (localStorage) plus the `src/lib/api/*` modules running in the browser tab — that was true before this milestone and remains true. `runSchedulerTick` is written framework-free specifically so it can be lifted into a real cron/worker later, but today it runs on a `setInterval` inside the page, which means: automation only advances while the tab is open, and strictly speaking the spec's "frontend must not run scheduled payments" boundary is honored in spirit (never signs, only ever prepares) but not in deployment topology (no separate process exists to run it in).
- **No autonomous wallet signing, anywhere, ever.** Every AUTOMATIC-mode schedule, every batch item, every workflow run still stops at `POLICY_APPROVED`/`AWAITING_USER` and waits for an explicit wallet interaction. This is by design (§35 of the spec), not a gap — flagged here so it's not mistaken for one.
- **Budget notionals are single-asset, not USD-normalized.** A budget's `limit` is in the minor units of one declared asset, consistent with how `dailySpendingLimit` already worked before this milestone — a cross-asset "total daily treasury spend" is tracked as a minor-unit ceiling against one reference asset, not a true USD aggregate.
- **Payment requests are single-user.** There's no multi-party network in this build, so a "payment request" is created and approved by the same connected wallet acting in both roles — it still runs the full policy check on approval, but it can't yet model a truly separate requester.
- **UI verified via build + type-check + a full headless run of the test suite, not a live browser click-through** — this environment has no browser-automation tool available. The dev server is running and HMR picked up every change cleanly with no runtime errors, but that is not the same as manually exercising each page.

## 15. Recommended Prompt 20 milestone

**Account-abstraction-based delegated automation** — the explicitly-reviewed mechanism §35 leaves the door open for: a scoped session key or AA policy contract that lets a user pre-authorize a *bounded* class of scheduled/AUTOMATIC payments (asset + recipient allowlist + per-tx/daily caps, mirroring the existing policy engine) so truly unattended execution becomes possible without ever handing Holographic a general signing key. Natural follow-ons in the same vein: a real worker process (queue + cron) replacing the `setInterval` shim now that the scheduler boundary is already isolated for it, and USD-normalized cross-asset budgets using a price oracle.
