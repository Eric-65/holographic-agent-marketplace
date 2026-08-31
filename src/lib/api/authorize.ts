import { db } from "../db/client";
import type { DbExecutionRequest, DbPolicy, DbAgent } from "../db/schema";
import { executePrivateTransfer } from "../execution/privateTransfer";
import { markExecuted, markFailed, markExecuting, createExecutionResult, createExecutionReceipt, approveExecutionRequest } from "./executions";
import { completeWorkflowExecutionStep } from "./workflows";
import { poseidonish } from "../hash";

const SEPOLIA = "0x534e5f5345504f4c4941";

export interface AuthorizeResult {
  status: "success" | "failed";
  txHash: string;
  bucket: string;
  error?: string;
}

/**
 * Shared "authorize" boundary for any persisted execution request — whether
 * it came from a scheduled payment, a batch item, a payment request, or a
 * workflow run. This is the ONLY place any of those flows may reach the
 * wallet, and it is the exact same executePrivateTransfer call the manual
 * Treasury transfer form uses. If the request originated from a workflow
 * run, the run is advanced to ATTESTATION (success) or FAILED (failure).
 */
export async function authorizeExecutionRequest(requestId: string, userId: string, isDemo: boolean): Promise<AuthorizeResult> {
  const req = db.getById<DbExecutionRequest>("execution_requests", requestId);
  if (!req) throw new Error("Execution request not found");
  if (req.userId !== userId) throw new Error("Unauthorized");
  if (req.status === "COMPLETED" || req.status === "executed") throw new Error("Already completed");
  if (req.status === "BLOCKED" || req.status === "FAILED") throw new Error("Request was blocked or failed — cannot authorize");

  if (req.status === "AWAITING_USER") {
    if (!req.approvedByUser) throw new Error("Human approval required before wallet authorization");
    approveExecutionRequest(req.id, userId);
  }

  const policy = db.getById<DbPolicy>("policies", req.policyId);
  if (!policy) throw new Error("Policy not found for this request");

  markExecuting(req.id);
  const runId = req.intent.metadata?.workflowRunId as string | undefined;

  try {
    const result = await executePrivateTransfer(req.intent, policy.doc, {
      expectedChainId: SEPOLIA,
      allowConfirmationBypass: true,
    });

    markExecuted(req.id);
    const provider: "mock" | "strk20" = isDemo ? "mock" : "strk20";
    const execResult = createExecutionResult(req.id, userId, result.txHash, "success", provider, result.bucket, result.proofVerified, result.latencyMs);
    const agentName = db.getById<DbAgent>("agents", req.intent.agentId)?.name ?? req.intent.agentId;
    createExecutionReceipt(
      userId,
      req.id,
      execResult.id,
      req.intent.agentId,
      agentName,
      policy.id,
      result.intentHash,
      result.policyHash,
      result.traceHash ?? (poseidonish(req.verdict.reasons) as any),
      result.txHash,
      "executed",
      execResult.provider,
      result.bucket,
      isDemo,
    );

    if (runId) completeWorkflowExecutionStep(runId, userId, "success");

    return { status: "success", txHash: result.txHash, bucket: result.bucket };
  } catch (e: any) {
    const message = e?.message ?? String(e);
    const code = e?.code ?? "UNKNOWN";
    markFailed(req.id);
    createExecutionResult(req.id, userId, "NOT AVAILABLE", "failed", "mock", "—", false, undefined, message, code);
    if (runId) completeWorkflowExecutionStep(runId, userId, "failed", `${code}: ${message}`);
    return { status: "failed", txHash: "NOT AVAILABLE", bucket: "—", error: `${code}: ${message}` };
  }
}
