import { db } from "../db/client";
import type { DbPaymentRequest } from "../db/schema";
import { getDeploymentById } from "./deployments";
import { getActivePolicyByDeployment } from "./policies";
import { createExecutionRequest, computeSpentToday } from "./executions";
import { intentToAgentAction } from "../execution/privateTransfer";
import { validateAction } from "../policy/validateAction";
import { makeTransferIntent } from "../intent/model";
import { poseidonish } from "../hash";
import type { Hex } from "../types";

/**
 * Reusable payment-request system. An approved recipient can request a
 * payment; the SENDER still controls authorization — approving a request
 * runs the exact same policy engine as any other transfer, so a request can
 * never bypass the sender's policy just because the recipient asked for it.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createPaymentRequest(
  senderUserId: string,
  agentDeploymentId: string,
  recipientAddress: string,
  asset: string,
  amount: number,
  reason: string,
  recipientLabel?: string,
  ttlMs: number = DEFAULT_TTL_MS,
): DbPaymentRequest {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  const deployment = getDeploymentById(agentDeploymentId, senderUserId);
  if (!deployment) throw new Error("Deployment not found");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Amount must be a positive integer (minor units)");

  return db.create<DbPaymentRequest>("payment_requests", {
    senderUserId,
    agentDeploymentId,
    recipientAddress,
    recipientLabel,
    asset,
    amount,
    reason: reason || "Payment request",
    status: "PENDING",
    updatedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

export function getPaymentRequestsByUser(userId: string): DbPaymentRequest[] {
  const now = Date.now();
  return db.find<DbPaymentRequest>("payment_requests", (r) => r.senderUserId === userId).map((r) => {
    if (r.status === "PENDING" && r.expiresAt < now) {
      return db.update<DbPaymentRequest>("payment_requests", r.id, { status: "EXPIRED" })!;
    }
    return r;
  });
}

export function rejectPaymentRequest(id: string, userId: string): DbPaymentRequest {
  const req = db.getById<DbPaymentRequest>("payment_requests", id);
  if (!req) throw new Error("Payment request not found");
  if (req.senderUserId !== userId) throw new Error("Unauthorized");
  if (req.status !== "PENDING") throw new Error("Request is not pending");
  return db.update<DbPaymentRequest>("payment_requests", id, { status: "REJECTED" })!;
}

/**
 * Sender approves a request — this evaluates the SENDER's current policy
 * (never the recipient's wishes) and produces an execution request at
 * whatever state the policy verdict demands (BLOCKED / AWAITING_USER /
 * POLICY_APPROVED). The wallet still has to sign it.
 */
export function approvePaymentRequest(id: string, userId: string): DbPaymentRequest {
  const req = db.getById<DbPaymentRequest>("payment_requests", id);
  if (!req) throw new Error("Payment request not found");
  if (req.senderUserId !== userId) throw new Error("Unauthorized");
  if (req.status !== "PENDING") throw new Error("Request is not pending");
  if (req.expiresAt < Date.now()) {
    return db.update<DbPaymentRequest>("payment_requests", id, { status: "EXPIRED" })!;
  }

  const policy = getActivePolicyByDeployment(req.agentDeploymentId, userId);
  if (!policy) throw new Error("No active policy bound to this deployment");

  const intent = makeTransferIntent({
    id: `PREQ-${req.id}`,
    agentId: policy.agentId,
    asset: req.asset,
    recipient: req.recipientAddress,
    amount: req.amount,
    action: "transfer",
    reason: req.reason,
    requestedAt: Date.now(),
    metadata: { venue: "STRK20 Pool", paymentRequestId: req.id },
  });

  const spentToday = computeSpentToday(req.agentDeploymentId, req.asset);
  const verdict = validateAction(intentToAgentAction(intent, spentToday), policy.doc);
  const policyHash = poseidonish(policy.doc) as Hex;
  const intentHash = poseidonish({ agentId: intent.agentId, asset: intent.asset, amount: intent.amount, id: intent.id }) as Hex;

  const execReq = createExecutionRequest(userId, req.agentDeploymentId, policy.id, intent, {
    allowed: verdict.allowed,
    reasons: verdict.reasons,
    requiresHumanApproval: verdict.requiresHumanApproval,
    policyHash,
    intentHash,
    evaluatedAt: Date.now(),
  });

  return db.update<DbPaymentRequest>("payment_requests", id, {
    status: execReq.status === "BLOCKED" ? "REJECTED" : "APPROVED",
    executionRequestId: execReq.id,
  })!;
}
