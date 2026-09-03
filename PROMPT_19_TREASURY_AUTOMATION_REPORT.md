# Prompt 19 — Advanced Treasury Automation, Gap-Fill Report

This report covers the delta on top of `TREASURY_AUTOMATION_REPORT.md` (this session's Prompt 18). The two documents together describe the full treasury-automation milestone; read this one for what changed and why.

## 1. Prompt 18 completion status

A preflight check was run before any new code, per this prompt's own instructions, because the text handed to me assumed a different history than this session actually has ("Prompt 18 is the agent-platform milestone, mobile UX is already fixed") — that framing doesn't match this conversation. What actually happened:

- **Treasury automation** (scheduled payments, budgets, batches, workflows, automation pause, notifications, idempotency): built in this session as its own milestone, verified with 93/96 tests passing (3 pre-existing, unrelated failures).
- **Mobile UX fixes**: not previously done in this session — genuinely incomplete going into this milestone. Partially addressed here (§14 below); not exhaustively verified across every breakpoint.
- **Agent SDK / manifest / capability / permission / runtime / versioning / lifecycle / marketplace / creator workflow / validation / health / suspension-deprecation**: pre-existing (from before this session). Spot-checked `health.ts` and `sdk.ts` directly — real DB-backed logic, not stubs.
- **Real wallet connect/disconnect, STRK20 execution, deterministic policy engine, AgentRegistry, PolicyCommitment, ExecutionAttestor, compliance, verification, audit, persistence**: unmodified by this milestone; still covered by the same test suite.

Nothing was silently rewritten to match the incoming prompt's assumptions — the actual gaps were identified and filled instead.

## 2. Scheduling architecture (delta)

Added schedule **editing with versioning**: `updateSchedule()` snapshots the pre-edit state into a new `schedule_versions` table before applying changes and bumps `schedule.version`. Already-fired occurrences keep the `policyVersionUsed` they recorded at fire time regardless of later edits — verified by test. Added `retryOccurrence()` so a `BLOCKED` occurrence (e.g. blocked on an unapproved recipient) can be manually re-evaluated once the user fixes the underlying cause, without waiting for the schedule's own cadence to reach a new occurrence.

## 3. Budget architecture (delta)

Schedules, batches, and workflow runs now accept **multiple simultaneous budgets** (`budgetIds: string[]`, with the old singular `budgetId` kept as a deprecated-but-supported alias). `checkBudgets()` (pure) and `evaluateBudgets()`/`recordBudgetsUsage()` (API) require every listed budget to independently allow the amount — no budget can override another, and all per-budget reasons are surfaced together, not just the first failure. Verified by test: an agent budget with room can still be blocked by a tighter treasury-wide budget in the same list.

## 4. Payment request architecture (delta)

Moved to its own route, `/treasury/payment-requests`, matching the prompt's route list. Logic unchanged from Prompt 18 — approving a request still runs the exact current policy check; a request can never self-authorize.

## 5. Batch architecture (delta)

Added an explicit **mode**: `INDEPENDENT` (default — each item stands alone, matches Prompt 18 behavior) or `ATOMIC` (any blocked item cancels every other item in the batch instead of letting the good ones through). Multi-budget support added the same way as schedules, with per-item cumulative reservation tracked against every applicable budget, not just one.

## 6. Workflow architecture (delta)

Same multi-budget treatment as schedules/batches. The `COMPLIANCE_CHECK` step and the `POLICY_EVALUATION` re-check both now flag a new-recipient review (§ below) instead of just failing opaquely when the block reason is specifically an unapproved recipient.

## 7. Multi-agent communication model

Unchanged from Prompt 18 — schema-validated, workflow-scoped, nonce-guarded `agent_messages`, never carrying private material, never granting execution authority. No new gaps identified here in the preflight check.

## 8. Worker architecture (delta)

`runSchedulerTick` now runs `checkEmergencyTriggers()` **before** touching any due schedule. If a trigger fires, it calls `triggerEmergencyStop()` first — so a breach detected this tick means nothing else fires this tick either. The worker itself remains the same plain, framework-free function described in Prompt 18 (see `src/lib/scheduler/worker.ts` for the full architectural note); this milestone did not change its deployment topology — see § Remaining limitations.

## 9. Idempotency strategy

Unchanged core mechanism (`${scheduleId}:${occurrenceAt}` deterministic keys, `executionRequestId`-keyed budget-usage rows). Extended to cover the new multi-budget usage recording (`recordBudgetsUsage` calls the same idempotent `recordBudgetUsage` per budget) and to the new-recipient-review flagging (`flagNewRecipientReview` is a no-op if a PENDING review for the same user/policy/recipient already exists, so a repeated block doesn't spam duplicate reviews).

## 10. Emergency controls (new this milestone)

Previously (Prompt 18): manual pause-all only. Added:
- **Automatic triggers**, evaluated every scheduler tick: `DAILY_SPEND_EXCEEDED` (per-asset automated spend vs. `maxDailyTreasurySpend`), `FAILURE_RATE_EXCEEDED` (failure rate over the trailing `failureRateWindow` executions vs. `maxFailureRate`), `STRK20_PROVIDER_FAILURE` and `POLICY_INTEGRITY_FAILURE` (surfaced via caller-supplied flags, since the DB-only evaluator can't see wallet/provider state itself).
- **`emergency_events`** log table recording every pause/resume, manual or automatic, with the exact trigger and detail.
- **`pausedByOwner`** flag distinguishes an owner's manual pause from an automatic one — verified by test that an automatic trigger never overwrites an existing manual pause's reason.
- New `/settings/automation` page: pause/resume, the emergency-limit editors, and the event log.

## 11. Security controls (delta)

- **New-recipient review**: any policy rejection specifically caused by `E_RECIPIENT_NOT_APPROVED` now creates a `new_recipient_reviews` row instead of just failing. The agent that proposed the payment has no path to resolve it — only an explicit human `approveNewRecipientReview()` call (from the UI, never from agent code) can, and that call updates the actual policy document's `approvedRecipients` array (not just the separate UI-facing recipient table — a real bug caught and fixed during testing, see below).
- Emergency-rule fields (`maxDailyTreasurySpend`, `maxBatchSize`, etc.) remain owner-only — no agent-facing function can read or write `automation_controls`.
- Multi-budget evaluation closes a gap where a schedule/batch/workflow with only one budget attached could be under-constrained relative to other applicable spending ceilings.

**Bug caught during testing, fixed before completion**: `approveNewRecipientReview` initially only added the recipient to the separate `approved_recipients` UI table, not to `policy.doc.approvedRecipients` — the array `validateAction` actually reads. Approving would have silently done nothing to unblock future evaluation. A test written specifically to check the recipient was usable after approval caught this immediately; both records are now updated together.

## 12. Database changes

Added: `schedule_versions`, `emergency_events`, `new_recipient_reviews`. Extended: `payment_schedules` (`budgetIds`, `version`), `payment_batches` (`budgetIds`, `mode`), `workflow_runs` (`budgetIds`), `automation_controls` (`pausedByOwner`, `maxFailureRate`, `failureRateWindow`), `notifications.type` (3 new event types). All additive — no existing field removed or repurposed, no migration required for the localStorage-backed store.

## 13. API changes

New: `updateSchedule`, `getScheduleVersions`, `retryOccurrence` (schedules.ts); `evaluateBudgets`, `recordBudgetsUsage` (budgets.ts); `checkEmergencyTriggers`, `triggerEmergencyStop`, `getEmergencyEvents` (automation.ts); the whole `newRecipientReviews.ts` module. Changed signatures (all call sites updated): `createBatch` and `startWorkflowRun` take `budgetIds: string[]` instead of a singular optional `budgetId`.

## 14. UI changes

- `/settings/automation` (new): pause/resume, emergency-limit editors, event log, new-recipient review queue.
- `/treasury/payment-requests` (new): payment requests moved out of `/treasury/payments` into their own route.
- Schedule/batch/workflow forms: single budget `<select>` replaced with a multi-select chip picker; schedules page gained inline editing (pre-fills the form, calls `updateSchedule`) and a version tag (`v2`, `v3`...) on each schedule; batch builder gained an "Atomic" checkbox; blocked occurrences gained a "Retry" button.
- `NewRecipientReviewPanel` (new, shared component) surfaces pending reviews on the Treasury overview and the automation-settings page.
- Mobile: the batch-row grid (previously a fixed `[1fr_90px_100px_1fr_auto]` grid with no small-screen fallback) now stacks 2-wide on mobile and only becomes the fixed row layout at `sm:`; the workflow step-detail row now wraps instead of forcing width. This was a **targeted** fix on the elements most likely to overflow at narrow widths, not an exhaustive pass across all 11 listed breakpoints — see Remaining limitations.

## 15. Tests

22 new test cases added to `src/lib/treasury/automation.test.ts` (multi-budget pure logic and API-level enforcement, schedule versioning/editing, new-recipient review end-to-end including the bug above, three emergency-trigger scenarios). Full suite run headlessly (Node + a Storage-API-accurate localStorage shim, esbuild-bundled) against the **entire** project, not just new code:

```
TOTAL 100/103 passed, 3 failed
```

All new tests pass. The 3 failures are the same pre-existing, unrelated ones already documented in the Prompt 18 report (status-string casing mismatches in `deployments.ts`/`executions.ts`, untouched by either milestone).

## 16. Build result

`npm run build` — succeeds (~1.34 MB single-file bundle, ~17–50s). `npx tsc --noEmit` — zero errors across the whole project.

## 17. Remaining limitations

- **No standalone backend process**, same as Prompt 18 — the scheduler tick still runs on a `setInterval` inside the page, not a real cron/worker. This milestone made the tick's safety logic (emergency triggers) run first, but did not change where it runs.
- **Mobile responsiveness was targeted, not exhaustive.** I do not have browser-automation tooling in this environment to actually render and check all 11 listed breakpoints (320px–1440px) across schedules/budgets/payments/batch-review/workflow-view/approval-dialogs/notifications/automation-controls. I fixed the two layout patterns most likely to overflow (a fixed-width batch-item grid, a fixed-width workflow-step label) based on code review, and the existing global `overflow-x: hidden` guard prevents page-level horizontal scroll regardless. This is a real gap against the prompt's explicit test list — flagging it plainly rather than claiming verification that didn't happen.
- **`payment_batch_items` and `workflow_versions` were not split into separate tables** as the prompt's database section lists — batch items stay an embedded array on the batch record, and workflow definitions keep a single `version` number without a history table. Functionally equivalent for this localStorage-backed store; a real relational backend would likely want the normalized form.
- **Batch state enum names differ slightly** from the prompt's list (`REVIEWED` vs. `REVIEW_REQUIRED`/`READY`, no separate `PARTIALLY_APPROVED`) — kept Prompt 18's existing enum rather than a pure renaming pass with no functional benefit.

## 18. Features requiring interactive wallet authorization

No change from Prompt 18: every AUTOMATIC-mode schedule, every batch item, every workflow run, and now every emergency-recovered/retried occurrence still stops at `POLICY_APPROVED`/`AWAITING_USER` and waits for the connected wallet. Nothing in this milestone signs anything or stores a key — `checkEmergencyTriggers`/`triggerEmergencyStop` only ever pause automation, never authorize a transaction.

## 19. Recommended Prompt 20 milestone

Two candidates, in priority order:

1. **A real mobile QA pass** using an actual browser/device — this milestone's gap here is honest but should be closed properly rather than carried forward again. Needs either a browser-automation tool in this environment or manual verification by the user against the 11 listed breakpoints.
2. **Account-abstraction-based delegated automation** (same recommendation as the Prompt 18 report, still the right next architectural step): a scoped session key or AA policy contract letting a user pre-authorize a *bounded* class of AUTOMATIC-mode payments (asset + recipient allowlist + per-tx/daily caps mirroring the existing policy engine), so unattended execution becomes possible without Holographic ever holding a general signing key — explicitly reviewed, per §35 of the original spec.
