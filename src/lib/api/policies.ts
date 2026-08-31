import { db } from "../db/client";
import type { DbPolicy } from "../db/schema";
import type { AgentPolicy } from "../policy/model";
import { poseidonish } from "../hash";

/**
 * POST /policies
 * GET /policies/:id
 * PUT /policies/:id
 */

export function createPolicy(
  userId: string,
  agentId: string,
  agentDeploymentId: string | null,
  doc: AgentPolicy,
  label: string,
): DbPolicy {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  if (agentDeploymentId) {
    const dep = db.getDeploymentById(agentDeploymentId);
    if (!dep) throw new Error("Deployment not found");
    if (dep.userId !== userId) throw new Error("Unauthorized: deployment does not belong to user");
  }

  const existing = agentDeploymentId ? db.getPoliciesByDeployment(agentDeploymentId) : [];
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((p: any) => p.version)) + 1 : 1;

  // Supersede active
  if (agentDeploymentId) {
    existing.filter((p: any) => p.status === "ACTIVE" || p.status === "active").forEach((p: any) => db.update("policies", p.id, { status: "superseded" }));
  }

  const docHash = poseidonish(doc) as any;
  const policy = db.create<DbPolicy>("policies", {
    userId,
    agentId,
    agentDeploymentId,
    version: nextVersion,
    label,
    doc,
    docHash,
    status: "ACTIVE",
    updatedAt: Date.now(),
  });

  try {
    db.create<any>("policy_versions", {
      policyId: policy.id,
      userId,
      version: nextVersion,
      doc,
      docHash,
      status: "active",
    });
  } catch {}

  return policy;
}

export function getPolicyById(id: string, userId?: string): DbPolicy | null {
  const policy = db.getById<DbPolicy>("policies", id);
  if (!policy) return null;
  if (userId && policy.userId !== userId) throw new Error("Unauthorized: policy does not belong to user");
  return policy;
}

export function updatePolicy(id: string, userId: string, doc: AgentPolicy, label?: string): DbPolicy | null {
  const existing = getPolicyById(id, userId);
  if (!existing) throw new Error("Policy not found");
  const docHash = poseidonish(doc) as any;
  return db.update<DbPolicy>("policies", id, { doc, docHash, label: label ?? existing.label });
}

export function getActivePolicyByDeployment(deploymentId: string, userId?: string): DbPolicy | null {
  const dep = db.getDeploymentById(deploymentId);
  if (userId && dep && dep.userId !== userId) throw new Error("Unauthorized");
  const policies = db.getPoliciesByDeployment(deploymentId);
  return policies.find((p: any) => p.status === "ACTIVE" || p.status === "active") ?? null;
}

export function getPoliciesByUser(userId: string): DbPolicy[] {
  return db.getPoliciesByUser(userId);
}
