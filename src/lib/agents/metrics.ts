/**
 * Agent execution telemetry per TASK 21 + operational metrics per TASK 16
 * Track: intent count, approved, blocked, human approvals, completed, failed,
 * average execution duration, policy rejection rate, verification coverage
 * Only collect data required for operational metrics, no private transaction info
 */

import { db } from "../db/client";
import type { DbAgentMetrics } from "../db/schema";

export interface ExecutionTelemetry {
  agentId: string;
  intentCount: number;
  approved: number;
  blocked: number;
  humanApprovals: number;
  completed: number;
  failed: number;
  averageExecutionDuration: number;
  policyRejectionRate: number;
  verificationCoverage: number;
  lastExecutionAt?: number;
}

export function calculateTelemetry(agentId: string, userId?: string): ExecutionTelemetry {
  let requests: any[] = [];
  if (userId) {
    requests = db.getExecutionRequestsByUser(userId).filter((r: any) => r.intent.agentId === agentId || r.agentId === agentId);
  } else {
    requests = db.getAll<any>("execution_requests").filter((r: any) => r.intent?.agentId === agentId || r.agentId === agentId);
  }

  const receipts = db.getAll<any>("execution_receipts").filter((r: any) => r.agentId === agentId && (!userId || r.userId === userId));

  const intentCount = requests.length;
  const approved = requests.filter((r: any) => r.verdict?.allowed).length;
  const blocked = requests.filter((r: any) => !r.verdict?.allowed).length;
  const humanApprovals = requests.filter((r: any) => r.approvedByUser).length;
  const completed = requests.filter((r: any) => r.status === "COMPLETED" || r.status === "executed").length;
  const failed = requests.filter((r: any) => r.status === "FAILED" || r.status === "failed").length;

  const latencies = db.getAll<any>("execution_results").filter((res: any) => {
    const req = requests.find((rq: any) => rq.id === res.executionRequestId);
    return !!req;
  }).map((res: any) => res.latencyMs).filter((n: any) => typeof n === "number") as number[];

  const averageExecutionDuration = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const policyRejectionRate = intentCount > 0 ? Math.round((blocked / intentCount) * 100) : 0;
  const verificationCoverage = receipts.length > 0 ? Math.round((receipts.filter((r: any) => r.status === "executed" || r.status === "COMPLETED").length / receipts.length) * 100) : 0;

  return {
    agentId,
    intentCount,
    approved,
    blocked,
    humanApprovals,
    completed,
    failed,
    averageExecutionDuration,
    policyRejectionRate,
    verificationCoverage,
    lastExecutionAt: requests.length > 0 ? Math.max(...requests.map((r: any) => r.createdAt)) : undefined,
  };
}

export function calculateOperationalMetrics(agentId: string, userId?: string): DbAgentMetrics {
  const telemetry = calculateTelemetry(agentId, userId);
  const now = Date.now();

  const existing = db.getAll<DbAgentMetrics>("agent_metrics").find((m) => m.agentId === agentId && (!userId || m.userId === userId));

  const metrics: DbAgentMetrics = {
    id: existing?.id ?? `met_${agentId}_${now}`,
    agentId,
    userId,
    executionCount: telemetry.intentCount,
    successfulExecutions: telemetry.completed,
    blockedRequests: telemetry.blocked,
    failedExecutions: telemetry.failed,
    policyViolations: telemetry.blocked,
    humanApprovals: telemetry.humanApprovals,
    humanApprovalRate: telemetry.intentCount > 0 ? Math.round((telemetry.humanApprovals / telemetry.intentCount) * 100) : 0,
    verificationCoverage: telemetry.verificationCoverage,
    policyBlockRate: telemetry.policyRejectionRate,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existing) {
    db.update("agent_metrics", existing.id, metrics);
  } else {
    db.create("agent_metrics", metrics);
  }

  return metrics;
}

export function getAllTelemetry(userId: string): ExecutionTelemetry[] {
  const deployments = db.getDeploymentsByUser(userId);
  const agentIds = [...new Set(deployments.map((d: any) => d.agentId))];
  return agentIds.map((id) => calculateTelemetry(id, userId));
}
