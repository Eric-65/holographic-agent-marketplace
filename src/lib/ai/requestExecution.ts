/**
 * The single gated boundary between an AI-produced intent and Holographic's
 * real execution pipeline.
 *
 * requestExecution(intentId) is the ONLY function any AI-facing code path
 * may call to turn a persisted AIStructuredIntent into money movement. It
 * never signs anything and never talks to a wallet — it re-derives the
 * deployment, capability, recipient, and amount FROM SCRATCH (never trusting
 * whatever was cached on the intent record) and then hands off to the exact
 * same createExecutionRequest / createSchedule / createPaymentRequest calls
 * every other part of the app uses. The result always lands in the normal
 * execution_requests queue — POLICY_APPROVED, AWAITING_USER, or BLOCKED —
 * where the existing ApprovalDialog / ExecutionRequestCard UI and the human
 * holding the wallet take over. There is no code path from here to
 * executePrivateTransfer/authorizeExecutionRequest; that stays behind the
 * user's own click, exactly as it does for every non-AI flow.
 */

import { db } from "../db/client";
import type { DbAIIntent, DbExecutionRequest, DbPaymentRequest, DbPaymentSchedule } from "../db/schema";
import { makeTransferIntent } from "../intent/model";
import { intentToAgentAction } from "../execution/privateTransfer";
import { validateAction } from "../policy/validateAction";
import { REASON } from "../policy/model";
import { createExecutionRequest, computeSpentToday } from "../api/executions";
import { createSchedule } from "../api/schedules";
import { createPaymentRequest } from "../api/paymentRequests";
import { flagNewRecipientReview } from "../api/newRecipientReviews";
import { poseidonish } from "../hash";
import type { Hex } from "../types";
import { parseAmount } from "./parseAmount";
import { findEligibleDeployments, checkCapability, resolveRecipientReference, resolveRawAddress, type RecipientResolution } from "./tools";
import { recordAITraceEvent, updateAIIntentStatus } from "../api/aiIntents";

export interface ExecutionRequestOutcome {
  kind: "execution_request";
  executionRequest: DbExecutionRequest;
}
export interface ScheduleOutcome {
  kind: "schedule";
  schedule: DbPaymentSchedule;
}
export interface PaymentRequestOutcome {
  kind: "payment_request";
  paymentRequest: DbPaymentRequest;
}
export interface RequestExecutionRejected {
  kind: "rejected";
  reason: string;
}
export type RequestExecutionResult = ExecutionRequestOutcome | ScheduleOutcome | PaymentRequestOutcome | RequestExecutionRejected;

function reject(intentId: string, reason: string): RequestExecutionRejected {
  recordAITraceEvent(intentId, "capability_validation", reason, false);
  updateAIIntentStatus(intentId, "BLOCKED", reason);
  return { kind: "rejected", reason };
}

function resolveRecipient(userId: string, intent: DbAIIntent["structuredIntent"]): RecipientResolution | null {
  const structured = intent as Record<string, unknown> | null;
  if (!structured) return null;
  if (typeof structured.rawRecipientAddress === "string" && structured.rawRecipientAddress) {
    return resolveRawAddress(userId, structured.rawRecipientAddress);
  }
  if (typeof structured.recipientReference === "string" && structured.recipientReference) {
    return resolveRecipientReference(userId, structured.recipientReference);
  }
  return null;
}

/**
 * The gated boundary. Re-validates everything fresh; never proceeds on the
 * strength of anything the AI said earlier in the conversation.
 */
export function requestExecution(intentId: string, userId: string): RequestExecutionResult {
  const stored = db.getById<DbAIIntent>("ai_intents", intentId);
  if (!stored) return { kind: "rejected", reason: "Intent not found" };
  if (stored.userId !== userId) return { kind: "rejected", reason: "Unauthorized" };
  if (stored.status !== "VALIDATED") return { kind: "rejected", reason: `Intent is ${stored.status}, not ready for execution` };

  const structured = stored.structuredIntent as Record<string, unknown> | null;
  if (!structured || typeof structured.action !== "string") {
    return reject(intentId, "Intent has no structured content");
  }
  const action = structured.action as string;
  if (action !== "PRIVATE_TRANSFER" && action !== "SCHEDULE_PAYMENT" && action !== "PAYMENT_REQUEST") {
    return reject(intentId, `${action} does not move money — it is not executable through this boundary`);
  }

  // 1. Re-derive the deployment/agent/policy from scratch.
  const eligible = findEligibleDeployments(userId, action as never).filter((d) => d.agent.id === stored.agentId);
  if (eligible.length === 0) {
    return reject(intentId, "No active, policy-bound agent deployment currently supports this action");
  }
  const { deployment, agent, policy } = eligible[0];

  const capability = checkCapability(agent, action as never);
  recordAITraceEvent(intentId, "capability_validation", capability.allowed ? "capability check passed" : capability.reason!, capability.allowed);
  if (!capability.allowed) return reject(intentId, capability.reason!);

  // 2. Re-resolve the recipient fresh — never trust a cached address.
  const recipientResolution = resolveRecipient(userId, structured);
  if (!recipientResolution || recipientResolution.status !== "RESOLVED") {
    return reject(intentId, "Recipient could not be freshly resolved to one of your approved recipients");
  }

  // 3. Re-parse the amount fresh — never trust a cached numeric amount.
  const amountText = typeof structured.amountText === "string" ? structured.amountText : "";
  const parsedAmount = parseAmount(amountText);
  if (!parsedAmount.ok) {
    return reject(intentId, `Amount could not be freshly re-parsed: ${parsedAmount.reason}`);
  }

  const reason = typeof structured.reason === "string" && structured.reason ? structured.reason : "AI-assisted payment";

  if (action === "PAYMENT_REQUEST") {
    const paymentRequest = createPaymentRequest(
      userId,
      deployment.id,
      recipientResolution.address,
      parsedAmount.asset,
      parsedAmount.amountMinor,
      reason,
      recipientResolution.name,
    );
    updateAIIntentStatus(intentId, "EXECUTED", undefined, { executionRequestId: undefined });
    recordAITraceEvent(intentId, "policy_decision", "payment request created — sender approval still required", true);
    return { kind: "payment_request", paymentRequest };
  }

  if (action === "SCHEDULE_PAYMENT") {
    const scheduleSpec = structured.schedule as { frequency: string; startDate: string; endDate: string | null } | null;
    if (!scheduleSpec) return reject(intentId, "Schedule details missing");
    const schedule = createSchedule(userId, deployment.id, {
      asset: parsedAmount.asset,
      recipient: recipientResolution.address,
      amount: parsedAmount.amountMinor,
      reason,
      frequency: scheduleSpec.frequency as DbPaymentSchedule["frequency"],
      startDate: new Date(scheduleSpec.startDate).getTime(),
      endDate: scheduleSpec.endDate ? new Date(scheduleSpec.endDate).getTime() : undefined,
      // AI-originated schedules always require explicit human approval at
      // fire time — never auto-authorized, regardless of amount.
      approvalMode: "REQUIRE_APPROVAL",
    });
    updateAIIntentStatus(intentId, "EXECUTED", undefined, { scheduleId: schedule.id });
    recordAITraceEvent(intentId, "policy_decision", "schedule created (REQUIRE_APPROVAL)", true);
    return { kind: "schedule", schedule };
  }

  // PRIVATE_TRANSFER — immediate policy/budget-gated execution request.
  const intent = makeTransferIntent({
    id: `AI-${stored.id}`,
    agentId: policy.agentId,
    asset: parsedAmount.asset,
    recipient: recipientResolution.address,
    amount: parsedAmount.amountMinor,
    action: "transfer",
    reason,
    requestedAt: Date.now(),
    metadata: { venue: "STRK20 Pool", aiIntentId: stored.id, automationSource: "ai_agent" },
  });

  const spentToday = computeSpentToday(deployment.id, parsedAmount.asset);
  const verdict = validateAction(intentToAgentAction(intent, spentToday), policy.doc);
  const policyHash = poseidonish(policy.doc) as Hex;
  const intentHash = poseidonish({ agentId: intent.agentId, asset: intent.asset, amount: intent.amount, id: intent.id }) as Hex;

  if (verdict.reasons.some((r) => r.includes(REASON.RECIPIENT_NOT_APPROVED))) {
    flagNewRecipientReview(userId, policy.id, recipientResolution.address, parsedAmount.asset, "ai_intent", stored.id);
  }

  recordAITraceEvent(intentId, "policy_decision", verdict.allowed ? "policy allowed" : `policy rejected: ${verdict.reasons.join("; ")}`, verdict.allowed);

  const executionRequest = createExecutionRequest(userId, deployment.id, policy.id, intent, {
    allowed: verdict.allowed,
    reasons: verdict.reasons,
    requiresHumanApproval: verdict.requiresHumanApproval,
    policyHash,
    intentHash,
    evaluatedAt: Date.now(),
  });

  updateAIIntentStatus(intentId, executionRequest.status === "BLOCKED" ? "BLOCKED" : "EXECUTING", undefined, { executionRequestId: executionRequest.id });

  return { kind: "execution_request", executionRequest };
}
