/**
 * Agent health per TASK 18
 * Possible states: HEALTHY, DEGRADED, PAUSED, SUSPENDED, OFFLINE
 * Calculate using real runtime data — do not mark healthy simply because DB record exists
 */

import { db } from "../db/client";
import type { DbAgentDeployment } from "../db/schema";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "PAUSED" | "SUSPENDED" | "OFFLINE" | "NOT_DEPLOYED";

export interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

export interface AgentHealth {
  agentId: string;
  deploymentId?: string;
  status: HealthStatus;
  checks: HealthCheck[];
  lastChecked: number;
  metrics: {
    recentFailures: number;
    verificationCoverage: number;
    backendAvailable: boolean;
    strk20Available: boolean;
  };
}

export function calculateAgentHealth(agentId: string, userId?: string): AgentHealth {
  const checks: HealthCheck[] = [];
  let status: HealthStatus = "NOT_DEPLOYED";

  // Check 1: deployment exists?
  let deployment: DbAgentDeployment | null = null;
  if (userId) {
    const deployments = db.getDeploymentsByUser(userId);
    deployment = deployments.find((d: any) => d.agentId === agentId) ?? null;
  } else {
    const all = db.getAll<DbAgentDeployment>("agent_deployments");
    deployment = all.find((d) => d.agentId === agentId) ?? null;
  }

  if (!deployment) {
    checks.push({ name: "Deployment", status: "fail", message: "No deployment found — agent not deployed" });
    return {
      agentId,
      status: "NOT_DEPLOYED",
      checks,
      lastChecked: Date.now(),
      metrics: { recentFailures: 0, verificationCoverage: 0, backendAvailable: db.isAvailable(), strk20Available: false },
    };
  }

  // Check 2: deployment status
  if (deployment.status === "PAUSED" || deployment.status === "paused") {
    status = "PAUSED";
    checks.push({ name: "Deployment status", status: "warn", message: "Agent paused — no execution permitted" });
  } else if (deployment.status === "DISABLED" || deployment.status === "DECOMMISSIONED" || deployment.status === "quarantined") {
    status = deployment.status === "DISABLED" || deployment.status === "DECOMMISSIONED" ? "SUSPENDED" : "OFFLINE";
    checks.push({ name: "Deployment status", status: "fail", message: `Agent ${deployment.status} — no new executions` });
  } else if (deployment.status === "ACTIVE" || deployment.status === "active") {
    checks.push({ name: "Deployment status", status: "pass", message: "Deployment active" });
  } else {
    checks.push({ name: "Deployment status", status: "warn", message: `Deployment status ${deployment.status}` });
  }

  // Check 3: backend availability
  const backendAvailable = db.isAvailable();
  checks.push({
    name: "Backend availability",
    status: backendAvailable ? "pass" : "fail",
    message: backendAvailable ? "Backend available" : "Backend unavailable",
  });

  // Check 4: recent execution failures
  const executionRequests = db.getExecutionRequestsByDeployment(deployment.id);
  const recentFailures = executionRequests.filter((r: any) => r.status === "FAILED" || r.status === "failed").length;
  checks.push({
    name: "Recent execution failures",
    status: recentFailures === 0 ? "pass" : recentFailures < 3 ? "warn" : "fail",
    message: recentFailures === 0 ? "No recent failures" : `${recentFailures} recent failures`,
  });

  // Check 5: STRK20 availability (from diagnostic or mock)
  let strk20Available = false;
  try {
    const adapterKind = localStorage.getItem("holographic:wallet:adapter");
    const isReal = adapterKind === "ready" || adapterKind === "walletconnect" || adapterKind === "real";
    strk20Available = isReal;
  } catch {}
  checks.push({
    name: "STRK20 availability",
    status: strk20Available ? "pass" : "warn",
    message: strk20Available ? "STRK20 provider available via real wallet" : "Mock provider — STRK20 not yet verified or demo mode",
  });

  // Check 6: verification coverage
  const receipts = db.getAll<any>("execution_receipts").filter((r: any) => r.agentId === agentId);
  const verificationCoverage = receipts.length > 0 ? Math.round((receipts.filter((r: any) => r.status === "executed" || r.status === "COMPLETED").length / receipts.length) * 100) : 0;
  checks.push({
    name: "Verification coverage",
    status: verificationCoverage >= 80 ? "pass" : verificationCoverage >= 50 ? "warn" : "fail",
    message: receipts.length === 0 ? "No receipts yet" : `${verificationCoverage}% verified`,
  });

  // Final status calculation using real runtime data
  if (status !== "PAUSED" && status !== "SUSPENDED" && status !== "OFFLINE") {
    if (!backendAvailable) status = "OFFLINE";
    else if (recentFailures >= 3) status = "DEGRADED";
    else if (recentFailures > 0) status = "DEGRADED";
    else status = "HEALTHY";
  }

  return {
    agentId,
    deploymentId: deployment.id,
    status,
    checks,
    lastChecked: Date.now(),
    metrics: { recentFailures, verificationCoverage, backendAvailable, strk20Available },
  };
}

export function getAllAgentsHealth(userId: string): AgentHealth[] {
  const deployments = db.getDeploymentsByUser(userId);
  const agentIds = [...new Set(deployments.map((d: any) => d.agentId))];
  return agentIds.map((id) => calculateAgentHealth(id, userId));
}
