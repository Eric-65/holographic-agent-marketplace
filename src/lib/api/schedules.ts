import { db } from "../db/client";
import type { DbPaymentSchedule, DbScheduleOccurrence, ScheduleFrequency, ApprovalMode } from "../db/schema";
import { advanceAfterOccurrence, canTransitionSchedule, isOccurrenceDue, occurrenceKeyFor } from "../treasury/schedule";
import { getDeploymentById } from "./deployments";
import { getActivePolicyByDeployment } from "./policies";
import { createExecutionRequest, computeSpentToday } from "./executions";
import { evaluateBudget, recordBudgetUsage } from "./budgets";
import { getAutomationControl } from "./automation";
import { intentToAgentAction } from "../execution/privateTransfer";
import { validateAction } from "../policy/validateAction";
import { makeTransferIntent } from "../intent/model";
import { poseidonish } from "../hash";
import type { Hex } from "../types";

/**
 * POST /treasury/schedules
 * POST /treasury/schedules/:id/pause | /resume | /cancel
 * (worker) tick → evaluateAndFireOccurrence
 *
 * The scheduler NEVER signs anything. It only ever produces a future intent,
 * evaluates it against the CURRENT policy and budget, and — at best — leaves
 * an execution request sitting at POLICY_APPROVED/AWAITING_USER for the
 * user's own wallet to authorize. See src/lib/scheduler/worker.ts for the
 * boundary this is called from.
 */

export function createSchedule(
  userId: string,
  agentDeploymentId: string,
  params: {
    asset: string;
    recipient: string;
    amount: number;
    reason: string;
    frequency: ScheduleFrequency;
    customIntervalDays?: number;
    startDate: number;
    endDate?: number;
    maxOccurrences?: number;
    approvalMode: ApprovalMode;
    budgetId?: string;
  },
): DbPaymentSchedule {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  const deployment = getDeploymentById(agentDeploymentId, userId);
  if (!deployment) throw new Error("Deployment not found");
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) throw new Error("Amount must be a positive integer (minor units)");
  if (!params.recipient) throw new Error("Recipient required");
  if (params.endDate && params.endDate < params.startDate) throw new Error("endDate must be after startDate");

  return db.create<DbPaymentSchedule>("payment_schedules", {
    userId,
    agentDeploymentId,
    asset: params.asset,
    recipient: params.recipient,
    amount: params.amount,
    reason: params.reason || "Scheduled treasury payment",
    frequency: params.frequency,
    customIntervalDays: params.customIntervalDays,
    startDate: params.startDate,
    endDate: params.endDate,
    maxOccurrences: params.maxOccurrences,
    approvalMode: params.approvalMode,
    budgetId: params.budgetId,
    status: "ACTIVE",
    nextOccurrenceAt: params.startDate,
    occurrenceCount: 0,
    updatedAt: Date.now(),
  });
}

export function getSchedulesByUser(userId: string): DbPaymentSchedule[] {
  return db.find<DbPaymentSchedule>("payment_schedules", (s) => s.userId === userId);
}

export function getScheduleById(id: string, userId?: string): DbPaymentSchedule | null {
  const schedule = db.getById<DbPaymentSchedule>("payment_schedules", id);
  if (!schedule) return null;
  if (userId && schedule.userId !== userId) throw new Error("Unauthorized: schedule does not belong to user");
  return schedule;
}

function transition(id: string, userId: string, to: DbPaymentSchedule["status"], extra: Record<string, unknown> = {}): DbPaymentSchedule {
  const schedule = getScheduleById(id, userId);
  if (!schedule) throw new Error("Schedule not found");
  if (!canTransitionSchedule(schedule.status, to)) {
    throw new Error(`Cannot transition schedule from ${schedule.status} to ${to}`);
  }
  return db.update<DbPaymentSchedule>("payment_schedules", id, { status: to, ...extra })!;
}

export function pauseSchedule(id: string, userId: string): DbPaymentSchedule {
  return transition(id, userId, "PAUSED", { pausedAt: Date.now() });
}

export function resumeSchedule(id: string, userId: string): DbPaymentSchedule {
  return transition(id, userId, "ACTIVE");
}

export function cancelSchedule(id: string, userId: string): DbPaymentSchedule {
  return transition(id, userId, "CANCELLED", { cancelledAt: Date.now() });
}

export function getOccurrencesBySchedule(scheduleId: string): DbScheduleOccurrence[] {
  return db.find<DbScheduleOccurrence>("schedule_occurrences", (o) => o.scheduleId === scheduleId).sort((a, b) => b.occurrenceAt - a.occurrenceAt);
}

export function getOccurrencesByUser(userId: string): DbScheduleOccurrence[] {
  return db.find<DbScheduleOccurrence>("schedule_occurrences", (o) => o.userId === userId).sort((a, b) => b.occurrenceAt - a.occurrenceAt);
}

/** All ACTIVE schedules for a user with an occurrence due right now. */
export function getDueSchedules(userId: string, now: number = Date.now()): DbPaymentSchedule[] {
  return getSchedulesByUser(userId).filter((s) => isOccurrenceDue(s, now));
}

function notify(userId: string, type: any, title: string, message: string, relatedId?: string) {
  try {
    db.create("notifications", { userId, type, title, message, read: false, relatedId, createdAt: Date.now() });
  } catch {}
}

/**
 * Fires ONE due occurrence of a schedule. Idempotent on
 * `${scheduleId}:${occurrenceAt}` — a retried tick returns the existing
 * occurrence rather than re-evaluating or double-creating an execution
 * request (req: scheduled-execution idempotency).
 *
 * Every safety condition (agent status, current policy version, budget,
 * automation pause) is re-checked HERE, at fire time — never assumed from
 * when the schedule was created.
 */
export function evaluateAndFireOccurrence(schedule: DbPaymentSchedule, occurrenceAt: number): DbScheduleOccurrence {
  const occurrenceKey = occurrenceKeyFor(schedule.id, occurrenceAt);
  const existing = db.find<DbScheduleOccurrence>("schedule_occurrences", (o) => o.occurrenceKey === occurrenceKey)[0];
  if (existing) return existing;

  const occurrence = db.create<DbScheduleOccurrence>("schedule_occurrences", {
    scheduleId: schedule.id,
    userId: schedule.userId,
    occurrenceKey,
    occurrenceAt,
    status: "DUE",
    updatedAt: Date.now(),
  });

  const block = (reason: string): DbScheduleOccurrence =>
    db.update<DbScheduleOccurrence>("schedule_occurrences", occurrence.id, { status: "BLOCKED", blockedReason: reason })!;

  const automation = getAutomationControl(schedule.userId);
  if (automation.paused) {
    notify(schedule.userId, "policy_blocked_payment", "Scheduled payment blocked", `${schedule.reason} — automation is paused (${automation.pausedReason ?? "manual pause"})`, schedule.id);
    return block(`Automation paused: ${automation.pausedReason ?? "manual pause"}`);
  }

  const deployment = getDeploymentById(schedule.agentDeploymentId);
  if (!deployment || deployment.userId !== schedule.userId) return block("Agent deployment not found");
  if (deployment.status !== "ACTIVE" && deployment.status !== "active") return block(`Agent deployment is ${deployment.status} — not active`);

  const policy = getActivePolicyByDeployment(schedule.agentDeploymentId);
  if (!policy) return block("No active policy bound to this deployment");
  if (!policy.doc.allowedAssets.includes(schedule.asset)) return block(`Asset ${schedule.asset} not in current policy scope`);

  if (schedule.approvalMode === "MANUAL_ONLY") {
    const updated = db.update<DbScheduleOccurrence>("schedule_occurrences", occurrence.id, {
      status: "AWAITING_USER_INITIATION",
      policyVersionUsed: policy.version,
    })!;
    notify(schedule.userId, "schedule_payment_due", "Scheduled payment due", `${schedule.reason} — manual initiation required`, schedule.id);
    return updated;
  }

  return fireAgainstPolicy(schedule, occurrence, policy);
}

/** Shared evaluation path for both automatic firing and manual-initiation proposal. */
function fireAgainstPolicy(schedule: DbPaymentSchedule, occurrence: DbScheduleOccurrence, policy: ReturnType<typeof getActivePolicyByDeployment> & {}): DbScheduleOccurrence {
  if (!policy) throw new Error("Policy required");

  const intent = makeTransferIntent({
    id: `SCH-${occurrence.occurrenceKey}`,
    agentId: policy.agentId,
    asset: schedule.asset,
    recipient: schedule.recipient,
    amount: schedule.amount,
    action: "transfer",
    reason: schedule.reason,
    requestedAt: occurrence.occurrenceAt,
    metadata: { venue: "STRK20 Pool", scheduleId: schedule.id, occurrenceKey: occurrence.occurrenceKey, automationSource: "schedule" },
  });

  const spentToday = computeSpentToday(schedule.agentDeploymentId, schedule.asset, occurrence.occurrenceAt);
  const action = intentToAgentAction(intent, spentToday);
  const policyVerdict = validateAction(action, policy.doc);

  let budgetResult: ReturnType<typeof evaluateBudget> | null = null;
  if (schedule.budgetId) {
    budgetResult = evaluateBudget(schedule.budgetId, schedule.amount, occurrence.occurrenceAt);
  }

  const combinedReasons = [...policyVerdict.reasons];
  if (budgetResult && !budgetResult.allowed && budgetResult.reason) combinedReasons.push(`E_BUDGET_EXCEEDED: ${budgetResult.reason}`);
  const combinedAllowed = policyVerdict.allowed && (!budgetResult || budgetResult.allowed);
  const requiresHumanApproval = combinedAllowed && (policyVerdict.requiresHumanApproval || schedule.approvalMode === "REQUIRE_APPROVAL");

  const policyHash = poseidonish(policy.doc) as Hex;
  const intentHash = poseidonish({ agentId: intent.agentId, asset: intent.asset, amount: intent.amount, id: intent.id }) as Hex;

  const req = createExecutionRequest(schedule.userId, schedule.agentDeploymentId, policy.id, intent, {
    allowed: combinedAllowed,
    reasons: combinedReasons,
    requiresHumanApproval,
    policyHash,
    intentHash,
    evaluatedAt: Date.now(),
  });

  const updated = db.update<DbScheduleOccurrence>("schedule_occurrences", occurrence.id, {
    status: req.status === "BLOCKED" ? "BLOCKED" : "READY",
    executionRequestId: req.id,
    policyVersionUsed: policy.version,
    blockedReason: req.status === "BLOCKED" ? combinedReasons.join("; ") : undefined,
  })!;

  if (req.status === "BLOCKED") {
    notify(schedule.userId, budgetResult && !budgetResult.allowed ? "budget_exceeded" : "policy_blocked_payment", "Scheduled payment blocked", `${schedule.reason}: ${combinedReasons[0] ?? "policy rejected"}`, schedule.id);
  } else {
    if (requiresHumanApproval) {
      notify(schedule.userId, "approval_required", "Approval required", `${schedule.reason} requires your approval before authorization`, schedule.id);
    } else {
      notify(schedule.userId, "payment_ready", "Payment ready", `${schedule.reason} passed policy — ready for wallet authorization`, schedule.id);
    }
    if (schedule.budgetId) recordBudgetUsage(schedule.budgetId, schedule.userId, schedule.amount, req.id, occurrence.occurrenceAt);
  }

  return updated;
}

/** User-initiated firing for a MANUAL_ONLY occurrence. Re-checks everything again at click-time. */
export function proposeManualOccurrence(occurrenceId: string, userId: string): DbScheduleOccurrence {
  const occurrence = db.getById<DbScheduleOccurrence>("schedule_occurrences", occurrenceId);
  if (!occurrence) throw new Error("Occurrence not found");
  if (occurrence.userId !== userId) throw new Error("Unauthorized");
  if (occurrence.status !== "AWAITING_USER_INITIATION") return occurrence;

  const schedule = getScheduleById(occurrence.scheduleId, userId);
  if (!schedule) throw new Error("Schedule not found");

  const automation = getAutomationControl(userId);
  if (automation.paused) {
    return db.update<DbScheduleOccurrence>("schedule_occurrences", occurrence.id, { status: "BLOCKED", blockedReason: "Automation paused" })!;
  }

  const policy = getActivePolicyByDeployment(schedule.agentDeploymentId);
  if (!policy) return db.update<DbScheduleOccurrence>("schedule_occurrences", occurrence.id, { status: "BLOCKED", blockedReason: "No active policy" })!;

  return fireAgainstPolicy(schedule, occurrence, policy);
}

/**
 * Advances a schedule's pointer after an occurrence has been generated —
 * called once per fired occurrence by the worker tick, never twice for the
 * same occurrence (the idempotency check in evaluateAndFireOccurrence
 * already guarantees that upstream).
 */
export function advanceSchedule(schedule: DbPaymentSchedule, occurrenceAt: number): DbPaymentSchedule {
  const advanced = advanceAfterOccurrence(schedule, occurrenceAt);
  return db.update<DbPaymentSchedule>("payment_schedules", schedule.id, {
    nextOccurrenceAt: advanced.nextOccurrenceAt,
    occurrenceCount: advanced.occurrenceCount,
    status: advanced.status,
    lastOccurrenceAt: occurrenceAt,
  })!;
}
