import { db } from "../db/client";
import type { DbExecutionRequest, DbExecutionResult, DbExecutionReceipt, DbPolicyDecision } from "../db/schema";
import type { TreasuryTransferIntent } from "../intent/model";
import type { ValidationResult } from "../policy/model";
import type { Hex } from "../types";
import { poseidonish } from "../hash";

/**
 * POST /executions/propose
 * POST /executions/:id/approve
 * POST /executions/:id/reject
 * GET /activity
 * GET /receipts/:id
 */

export function createExecutionRequest(
  userId: string,
  agentDeploymentId: string,
  policyId: string,
  intent: TreasuryTransferIntent,
  verdict: ValidationResult & { policyHash: Hex; intentHash: Hex; traceHash?: Hex; trace?: any[]; evaluatedAt: number },
): DbExecutionRequest {
  if (!db.isAvailable()) throw new Error("Backend unavailable");

  const dep = db.getDeploymentById(agentDeploymentId);
  if (!dep) throw new Error("Deployment not found");
  if (dep.userId !== userId) throw new Error("Unauthorized: deployment does not belong to user");

  // Check agent paused — if paused, all intents must be rejected per TASK 15
  if (dep.status === "PAUSED" || dep.status === "paused") {
    // Create blocked request directly
    const blockedVerdict = {
      allowed: false,
      reasons: ["E_AGENT_PAUSED: agent is paused"],
      requiresHumanApproval: false,
      policyHash: verdict.policyHash,
      intentHash: verdict.intentHash,
      evaluatedAt: Date.now(),
    };
    const req = db.create<DbExecutionRequest>("execution_requests", {
      userId,
      agentDeploymentId,
      policyId,
      intent,
      intentHash: verdict.intentHash,
      policyHash: verdict.policyHash,
      status: "BLOCKED",
      verdict: {
        ...blockedVerdict,
        trace: [{ id: "R12", outcome: "fail", observed: "paused", bound: "active" }],
        policyHash: verdict.policyHash,
        intentHash: verdict.intentHash,
        evaluatedAt: Date.now(),
      },
      requiresHumanApproval: false,
      updatedAt: Date.now(),
    });

    // Also create policy decision
    try {
      db.create<DbPolicyDecision>("policy_decisions", {
        executionRequestId: req.id,
        userId,
        policyId,
        policyVersion: 1,
        intentHash: verdict.intentHash,
        verdict: blockedVerdict,
        ruleTrace: [{ id: "R12", outcome: "fail", observed: "paused", bound: "active" }],
        timestamp: Date.now(),
      });
    } catch {}

    return req;
  }

  const requiresHumanApproval = verdict.requiresHumanApproval;
  let status: DbExecutionRequest["status"] = "PROPOSED";
  if (!verdict.allowed) {
    status = "BLOCKED";
  } else if (requiresHumanApproval) {
    status = "AWAITING_USER";
  } else {
    status = "POLICY_APPROVED";
  }

  // Idempotency: check duplicate by intentHash + deploymentId
  const existing = db.getAll<DbExecutionRequest>("execution_requests").find((r: any) => r.intentHash === verdict.intentHash && r.agentDeploymentId === agentDeploymentId);
  if (existing) {
    // If already completed, return existing result
    if (existing.status === "COMPLETED" || existing.status === "executed" || existing.status === "BLOCKED" || existing.status === "FAILED") {
      return existing;
    }
  }

  const req = db.create<DbExecutionRequest>("execution_requests", {
    userId,
    agentDeploymentId,
    policyId,
    intent,
    intentHash: verdict.intentHash,
    policyHash: verdict.policyHash,
    status,
    verdict: {
      ...verdict,
      trace: verdict.trace ?? verdict.reasons.map((r, i) => ({ id: `R${i}`, outcome: "fail", observed: r, bound: "" })),
      policyHash: verdict.policyHash,
      intentHash: verdict.intentHash,
      evaluatedAt: verdict.evaluatedAt ?? Date.now(),
    },
    requiresHumanApproval,
    updatedAt: Date.now(),
  });

  // Create policy decision record
  try {
    db.create<DbPolicyDecision>("policy_decisions", {
      executionRequestId: req.id,
      userId,
      policyId,
      policyVersion: 1,
      intentHash: verdict.intentHash,
      verdict: { allowed: verdict.allowed, reasons: verdict.reasons, requiresHumanApproval: verdict.requiresHumanApproval },
      ruleTrace: verdict.trace ?? [],
      timestamp: Date.now(),
    });
  } catch {}

  return req;
}

export function approveExecutionRequest(id: string, userId: string): DbExecutionRequest | null {
  const req = db.getById<DbExecutionRequest>("execution_requests", id);
  if (!req) throw new Error("Execution request not found");
  if (req.userId !== userId) throw new Error("Unauthorized");
  if (req.status !== "AWAITING_USER" && req.status !== "awaiting_confirmation") throw new Error("Request not awaiting confirmation");
  return db.update<DbExecutionRequest>("execution_requests", id, {
    status: "POLICY_APPROVED",
    approvedByUser: true,
    approvedAt: Date.now(),
  });
}

export function rejectExecutionRequest(id: string, userId: string): DbExecutionRequest | null {
  const req = db.getById<DbExecutionRequest>("execution_requests", id);
  if (!req) throw new Error("Execution request not found");
  if (req.userId !== userId) throw new Error("Unauthorized");
  if (req.status === "COMPLETED" || req.status === "executed") throw new Error("Already completed execution");
  return db.update<DbExecutionRequest>("execution_requests", id, {
    status: "CANCELLED",
    approvedByUser: false,
    rejectedAt: Date.now(),
  });
}

export function markExecuting(id: string): DbExecutionRequest | null {
  return db.update<DbExecutionRequest>("execution_requests", id, { status: "EXECUTING" });
}

export function markExecuted(id: string): DbExecutionRequest | null {
  return db.update<DbExecutionRequest>("execution_requests", id, { status: "COMPLETED" });
}

export function markFailed(id: string): DbExecutionRequest | null {
  return db.update<DbExecutionRequest>("execution_requests", id, { status: "FAILED" });
}

export function createExecutionResult(
  executionRequestId: string,
  userId: string,
  txHash: Hex | "NOT AVAILABLE",
  status: "success" | "failed" | "COMPLETED" | "FAILED",
  provider: "mock" | "strk20",
  bucket: string,
  proofVerified: boolean,
  latencyMs?: number,
  error?: string,
  errorCode?: string,
  block?: number,
): DbExecutionResult {
  const req = db.getById<DbExecutionRequest>("execution_requests", executionRequestId);
  if (req && req.userId !== userId) throw new Error("Unauthorized");

  return db.create<DbExecutionResult>("execution_results", {
    executionRequestId,
    userId,
    txHash,
    block,
    proofVerified,
    latencyMs,
    status: status === "COMPLETED" ? "success" : status === "FAILED" ? "failed" : status,
    provider,
    bucket,
    error,
    errorCode,
  } as any);
}

export function createExecutionReceipt(
  userId: string,
  executionRequestId: string,
  executionResultId: string,
  agentId: string,
  agentName: string,
  policyId: string,
  intentHash: Hex,
  policyHash: Hex,
  traceHash: Hex,
  txHash: Hex | "NOT AVAILABLE",
  status: DbExecutionReceipt["status"],
  provider: "mock" | "strk20",
  bucket: string,
  isDemo: boolean,
): DbExecutionReceipt {
  const req = db.getById<DbExecutionRequest>("execution_requests", executionRequestId);
  if (req && req.userId !== userId) throw new Error("Unauthorized");

  return db.create<DbExecutionReceipt>("execution_receipts", {
    userId,
    executionRequestId,
    executionResultId,
    agentId,
    agentName,
    policyId,
    intentHash,
    policyHash,
    traceHash,
    txHash,
    attestationSig: poseidonish({ txHash, policyHash }) as Hex,
    status,
    provider,
    bucket,
    isDemo,
  } as any);
}

export function getExecutionRequestsByUser(userId: string): DbExecutionRequest[] {
  return db.getExecutionRequestsByUser(userId);
}

export function getPendingApprovalsByUser(userId: string): DbExecutionRequest[] {
  return db.getPendingApprovalsByUser(userId);
}

export function getReceiptsByUser(userId: string): DbExecutionReceipt[] {
  return db.getReceiptsByUser(userId);
}

export function getExecutionRequestById(id: string, userId?: string): DbExecutionRequest | null {
  const req = db.getById<DbExecutionRequest>("execution_requests", id);
  if (!req) return null;
  if (userId && req.userId !== userId) throw new Error("Unauthorized");
  return req;
}

export function getReceiptById(id: string, userId?: string): DbExecutionReceipt | null {
  const receipt = db.getById<DbExecutionReceipt>("execution_receipts", id);
  if (!receipt) return null;
  if (userId && receipt.userId !== userId) throw new Error("Unauthorized");
  return receipt;
}

/**
 * Rolling 24h spend for a single (deployment, asset) binding, computed from
 * persisted execution requests that reached an executed/approved state today.
 * Injected into validateAction's `spentToday` so the daily-cap rule is
 * evaluated against real history rather than a client-side counter that
 * resets on refresh.
 */
export function computeSpentToday(agentDeploymentId: string, asset: string, now: number = Date.now()): number {
  const since = now - 24 * 60 * 60 * 1000;
  return db
    .getAll<DbExecutionRequest>("execution_requests")
    .filter(
      (r) =>
        r.agentDeploymentId === agentDeploymentId &&
        r.intent?.asset === asset &&
        r.createdAt >= since &&
        (r.status === "COMPLETED" || r.status === "executed" || r.status === "POLICY_APPROVED" || r.status === "AWAITING_USER" || r.status === "EXECUTING"),
    )
    .reduce((sum, r) => sum + (r.intent?.amount ?? 0), 0);
}
