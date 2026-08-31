import { db } from "../db/client";
import type { DbAgentDeployment, DbPolicy, DbAgentVersion } from "../db/schema";
import type { AgentPolicy } from "../policy/model";
import { poseidonish } from "../hash";

/**
 * POST /agents/deploy
 * GET /agents
 * GET /agents/:id
 * POST /agents/:id/pause
 * POST /agents/:id/resume
 */

export function deployAgent(
  userId: string,
  walletId: string,
  agentId: string,
  agentVersion: string,
  policy: AgentPolicy,
  policyLabel: string,
): { deployment: DbAgentDeployment; policyRecord: DbPolicy } {
  if (!db.isAvailable()) throw new Error("Backend unavailable: database error");

  // Verify ownership — wallet must belong to user and be connected
  const wallet = db.getById<any>("wallets", walletId);
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.userId !== userId) throw new Error("Unauthorized: wallet does not belong to user");
  if (wallet.status !== "connected") throw new Error("Wallet disconnected — cannot deploy agent");

  // Verify agent exists
  const agent = db.getById<any>("agents", agentId);
  if (!agent) {
    // Allow deployment of known agents even if not in DB yet (seed will handle)
    // But we still create deployment
  }

  // Check for existing active deployment for same agent + user — prevent duplicate?
  // For idempotency, if same agentId already deployed active for user, return existing
  const existingActive = db.getDeploymentsByUser(userId).find((d: any) => d.agentId === agentId && (d.status === "ACTIVE" || d.status === "active"));
  if (existingActive) {
    const existingPolicy = db.getById<DbPolicy>("policies", existingActive.policyId);
    if (existingPolicy) {
      return { deployment: existingActive, policyRecord: existingPolicy };
    }
  }

  // Create deployment with DRAFT then ACTIVE
  const deployment = db.create<DbAgentDeployment>("agent_deployments", {
    userId,
    walletId,
    agentId,
    agentVersion,
    status: "ACTIVE",
    policyId: null,
    updatedAt: Date.now(),
  });

  // Create agent version record
  try {
    db.create<DbAgentVersion>("agent_versions", {
      agentId,
      version: agentVersion,
      manifestHash: `0x${Math.random().toString(16).slice(2, 10)}` as any,
      actionSurface: ["private_transfer"],
      assets: ["USDC"],
      status: "active",
    });
  } catch {}

  // Create policy linked to deployment
  const policyRecord = db.create<DbPolicy>("policies", {
    userId,
    agentId,
    agentDeploymentId: deployment.id,
    version: 1,
    label: policyLabel,
    doc: policy,
    docHash: poseidonish(policy) as any,
    status: "ACTIVE",
    updatedAt: Date.now(),
  });

  // Create policy version
  try {
    db.create<any>("policy_versions", {
      policyId: policyRecord.id,
      userId,
      version: 1,
      doc: policy,
      docHash: policyRecord.docHash,
      status: "active",
    });
  } catch {}

  db.update<DbAgentDeployment>("agent_deployments", deployment.id, { policyId: policyRecord.id });

  return { deployment: { ...deployment, policyId: policyRecord.id }, policyRecord };
}

export function getDeploymentsByUser(userId: string): DbAgentDeployment[] {
  return db.getDeploymentsByUser(userId);
}

export function getDeploymentById(id: string, userId?: string): DbAgentDeployment | null {
  const dep = db.getDeploymentById(id);
  if (!dep) return null;
  if (userId && dep.userId !== userId) throw new Error("Unauthorized: deployment does not belong to user");
  return dep;
}

export function pauseDeployment(id: string, userId: string): DbAgentDeployment | null {
  const dep = getDeploymentById(id, userId);
  if (!dep) throw new Error("Deployment not found");
  return db.update<DbAgentDeployment>("agent_deployments", id, { status: "PAUSED" });
}

export function resumeDeployment(id: string, userId: string): DbAgentDeployment | null {
  const dep = getDeploymentById(id, userId);
  if (!dep) throw new Error("Deployment not found");
  return db.update<DbAgentDeployment>("agent_deployments", id, { status: "ACTIVE" });
}

export function disableDeployment(id: string, userId: string): DbAgentDeployment | null {
  const dep = getDeploymentById(id, userId);
  if (!dep) throw new Error("Deployment not found");
  return db.update<DbAgentDeployment>("agent_deployments", id, { status: "DISABLED" });
}

export function getActiveDeploymentsByUser(userId: string): DbAgentDeployment[] {
  return db.getActiveDeploymentsByUser(userId);
}
