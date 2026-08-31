import { db } from "../db/client";
import type { DbPaymentBatch, DbBatchItem } from "../db/schema";
import { getDeploymentById } from "./deployments";
import { getActivePolicyByDeployment } from "./policies";
import { createExecutionRequest, computeSpentToday } from "./executions";
import { recordBudgetUsage, usedInCurrentPeriod } from "./budgets";
import { checkBudget } from "../treasury/budget";
import { getAutomationControl } from "./automation";
import { intentToAgentAction } from "../execution/privateTransfer";
import { validateAction } from "../policy/validateAction";
import { makeTransferIntent } from "../intent/model";
import { poseidonish } from "../hash";
import type { Hex } from "../types";

export interface BatchItemInput {
  recipient: string;
  asset: string;
  amount: number;
  reason: string;
}

export interface BatchReviewSummary {
  total: number;
  approved: number;
  requiresApproval: number;
  blocked: number;
}

/**
 * Prepares a payment batch: validates every item against the CURRENT policy
 * and budget, tracking a running total so item N sees the budget consumption
 * of items 1..N-1 in the same batch. Nothing here signs anything — each
 * approved/requires-approval item becomes its own execution request the
 * user authorizes individually through the wallet, exactly like a single
 * transfer. No custom multi-payment protocol is introduced.
 */
export function createBatch(userId: string, agentDeploymentId: string, name: string, items: BatchItemInput[], budgetId?: string): DbPaymentBatch {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  if (items.length === 0) throw new Error("Batch must contain at least one payment");

  const automation = getAutomationControl(userId);
  if (items.length > automation.maxBatchSize) {
    throw new Error(`Batch size ${items.length} exceeds emergency limit of ${automation.maxBatchSize}`);
  }
  const uniqueRecipients = new Set(items.map((i) => i.recipient.toLowerCase()));
  if (uniqueRecipients.size > automation.maxRecipients) {
    throw new Error(`Batch has ${uniqueRecipients.size} distinct recipients, exceeding emergency limit of ${automation.maxRecipients}`);
  }

  const deployment = getDeploymentById(agentDeploymentId, userId);
  if (!deployment) throw new Error("Deployment not found");
  const policy = getActivePolicyByDeployment(agentDeploymentId, userId);
  if (!policy) throw new Error("No active policy bound to this deployment");

  const batch = db.create<DbPaymentBatch>("payment_batches", {
    userId,
    agentDeploymentId,
    budgetId,
    name: name || "Payment batch",
    items: [],
    status: "DRAFT",
    updatedAt: Date.now(),
  });

  const spentByAsset = new Map<string, number>();
  let budgetUsedSoFar: number | undefined;

  const resolvedItems: DbBatchItem[] = items.map((input, idx) => {
    const itemId = `${batch.id}_item_${idx}`;

    if (automation.paused) {
      return { id: itemId, ...input, status: "BLOCKED", blockedReason: "Automation paused", requiresHumanApproval: false };
    }

    const priorSpent = spentByAsset.get(input.asset) ?? computeSpentToday(agentDeploymentId, input.asset);
    const intent = makeTransferIntent({
      id: `BATCH-${itemId}`,
      agentId: policy.agentId,
      asset: input.asset,
      recipient: input.recipient,
      amount: input.amount,
      action: "transfer",
      reason: input.reason,
      requestedAt: Date.now(),
      metadata: { venue: "STRK20 Pool", batchId: batch.id },
    });
    const verdict = validateAction(intentToAgentAction(intent, priorSpent), policy.doc);
    spentByAsset.set(input.asset, priorSpent + input.amount);

    let budgetOk = true;
    let budgetReason: string | undefined;
    if (budgetId) {
      const projectedUsed = budgetUsedSoFar ?? 0;
      const cumulativeCheck = evaluateBudgetCumulative(budgetId, projectedUsed, input.amount);
      budgetOk = cumulativeCheck.allowed;
      budgetReason = cumulativeCheck.reason;
      budgetUsedSoFar = projectedUsed + (budgetOk ? input.amount : 0);
    }

    if (!verdict.allowed || !budgetOk) {
      const reasons = [...verdict.reasons];
      if (!budgetOk && budgetReason) reasons.push(`E_BUDGET_EXCEEDED: ${budgetReason}`);
      return { id: itemId, ...input, status: "BLOCKED", blockedReason: reasons.join("; "), requiresHumanApproval: false };
    }

    const policyHash = poseidonish(policy.doc) as Hex;
    const intentHash = poseidonish({ agentId: intent.agentId, asset: intent.asset, amount: intent.amount, id: intent.id }) as Hex;
    const req = createExecutionRequest(userId, agentDeploymentId, policy.id, intent, {
      allowed: true,
      reasons: [],
      requiresHumanApproval: verdict.requiresHumanApproval,
      policyHash,
      intentHash,
      evaluatedAt: Date.now(),
    });

    if (budgetId && !verdict.requiresHumanApproval) {
      recordBudgetUsage(budgetId, userId, input.amount, req.id);
    }

    return {
      id: itemId,
      ...input,
      status: verdict.requiresHumanApproval ? "REQUIRES_APPROVAL" : "APPROVED",
      requiresHumanApproval: verdict.requiresHumanApproval,
      executionRequestId: req.id,
    };
  });

  return db.update<DbPaymentBatch>("payment_batches", batch.id, { items: resolvedItems, status: "REVIEWED", reviewedAt: Date.now() })!;
}

/** Checks a candidate amount against a budget's remaining room, accounting for what earlier items in THIS batch already reserved. */
function evaluateBudgetCumulative(budgetId: string, alreadyReservedInBatch: number, amount: number) {
  const budget = db.getById<any>("budgets", budgetId);
  if (!budget) return { allowed: false, reason: "Budget not found" };
  const persistedUsed = usedInCurrentPeriod(budgetId);
  return checkBudget(budget, persistedUsed + alreadyReservedInBatch, amount);
}

export function getBatchesByUser(userId: string): DbPaymentBatch[] {
  return db.find<DbPaymentBatch>("payment_batches", (b) => b.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function getBatchById(id: string, userId?: string): DbPaymentBatch | null {
  const batch = db.getById<DbPaymentBatch>("payment_batches", id);
  if (!batch) return null;
  if (userId && batch.userId !== userId) throw new Error("Unauthorized");
  return batch;
}

export function summarizeBatch(batch: DbPaymentBatch): BatchReviewSummary {
  return {
    total: batch.items.length,
    approved: batch.items.filter((i) => i.status === "APPROVED").length,
    requiresApproval: batch.items.filter((i) => i.status === "REQUIRES_APPROVAL").length,
    blocked: batch.items.filter((i) => i.status === "BLOCKED").length,
  };
}

export function cancelBatch(id: string, userId: string): DbPaymentBatch {
  const batch = getBatchById(id, userId);
  if (!batch) throw new Error("Batch not found");
  return db.update<DbPaymentBatch>("payment_batches", id, { status: "CANCELLED" })!;
}

/** Marks a batch item's local status once its linked execution request completes/fails (called after wallet authorization). */
export function syncBatchItemStatus(batchId: string, userId: string): DbPaymentBatch {
  const batch = getBatchById(batchId, userId);
  if (!batch) throw new Error("Batch not found");

  const items = batch.items.map((item) => {
    if (!item.executionRequestId) return item;
    const req = db.getById<any>("execution_requests", item.executionRequestId);
    if (!req) return item;
    if (req.status === "COMPLETED" || req.status === "executed") return { ...item, status: "COMPLETED" as const };
    if (req.status === "FAILED" || req.status === "failed") return { ...item, status: "FAILED" as const };
    return item;
  });

  const allTerminal = items.every((i) => i.status === "COMPLETED" || i.status === "FAILED" || i.status === "BLOCKED");
  const anyCompleted = items.some((i) => i.status === "COMPLETED");
  const anyPending = items.some((i) => i.status === "APPROVED" || i.status === "REQUIRES_APPROVAL");
  const status: DbPaymentBatch["status"] = anyPending
    ? "EXECUTING"
    : allTerminal
      ? anyCompleted
        ? items.every((i) => i.status === "COMPLETED" || i.status === "BLOCKED")
          ? "COMPLETED"
          : "PARTIALLY_COMPLETED"
        : "PARTIALLY_COMPLETED"
      : batch.status;

  return db.update<DbPaymentBatch>("payment_batches", batchId, { items, status })!;
}
