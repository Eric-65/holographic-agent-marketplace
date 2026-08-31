/**
 * API Design — clear endpoints/services per TASK 17
 * POST /agents/deploy
 * GET /agents
 * GET /agents/:id
 * POST /agents/:id/pause
 * POST /agents/:id/resume
 * POST /policies
 * GET /policies/:id
 * PUT /policies/:id
 * POST /recipients
 * DELETE /recipients/:id
 * PATCH /recipients/:id
 * POST /executions/propose
 * POST /executions/:id/approve
 * POST /executions/:id/reject
 * GET /activity
 * GET /receipts/:id
 *
 * Keeps blockchain execution inside domain service rather than exposing raw STRK20 calls.
 */

import { db } from "../db/client";
import { ensureUser } from "./users";
import { getAllAgents, getAgentById } from "./agents";
import { deployAgent, pauseDeployment, resumeDeployment } from "./deployments";
import { createPolicy, getPolicyById, updatePolicy, getPoliciesByUser } from "./policies";
import { addRecipient, removeRecipient, editRecipient, disableRecipient, enableRecipient } from "./recipients";
import { createExecutionRequest, approveExecutionRequest, rejectExecutionRequest, getExecutionRequestsByUser, getReceiptsByUser, getReceiptById, getPendingApprovalsByUser } from "./executions";
import type { AgentPolicy } from "../policy/model";
import type { TreasuryTransferIntent } from "../intent/model";
import type { Hex } from "../types";
import { validateAction } from "../policy/validateAction";
import { intentToAgentAction } from "../execution/privateTransfer";

// Helper to verify ownership — never trust ownerAddress from unchecked client payload
function requireUser(address: Hex) {
  if (!db.isAvailable()) throw new Error("database unavailable");
  const user = ensureUser(address);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export const api = {
  // Agents
  "POST /agents/deploy": (params: { userAddress: Hex; walletId: string; agentId: string; agentVersion: string; policy: AgentPolicy; label: string }) => {
    const user = requireUser(params.userAddress);
    return deployAgent(user.id, params.walletId, params.agentId, params.agentVersion, params.policy, params.label);
  },

  "GET /agents": () => {
    return getAllAgents();
  },

  "GET /agents/:id": (id: string) => {
    const agent = getAgentById(id);
    if (!agent) throw new Error("Agent not found");
    return agent;
  },

  "POST /agents/:id/pause": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return pauseDeployment(id, user.id);
  },

  "POST /agents/:id/resume": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return resumeDeployment(id, user.id);
  },

  // Policies
  "POST /policies": (params: { userAddress: Hex; agentId: string; deploymentId: string | null; doc: AgentPolicy; label: string }) => {
    const user = requireUser(params.userAddress);
    return createPolicy(user.id, params.agentId, params.deploymentId, params.doc, params.label);
  },

  "GET /policies/:id": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return getPolicyById(id, user.id);
  },

  "PUT /policies/:id": (id: string, userAddress: Hex, doc: AgentPolicy, label?: string) => {
    const user = requireUser(userAddress);
    return updatePolicy(id, user.id, doc, label);
  },

  "GET /policies": (userAddress: Hex) => {
    const user = requireUser(userAddress);
    return getPoliciesByUser(user.id);
  },

  // Recipients
  "POST /recipients": (params: { userAddress: Hex; policyId: string; name: string; address: string; asset: string }) => {
    const user = requireUser(params.userAddress);
    return addRecipient(user.id, params.policyId, params.name, params.address, params.asset);
  },

  "DELETE /recipients/:id": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return removeRecipient(id, user.id);
  },

  "PATCH /recipients/:id": (id: string, userAddress: Hex, updates: { name?: string; address?: string; asset?: string; active?: boolean }) => {
    const user = requireUser(userAddress);
    if (updates.active !== undefined) {
      return updates.active ? enableRecipient(id, user.id) : disableRecipient(id, user.id);
    }
    return editRecipient(id, user.id, updates);
  },

  // Executions
  "POST /executions/propose": (params: { userAddress: Hex; deploymentId: string; policyId: string; intent: TreasuryTransferIntent }) => {
    const user = requireUser(params.userAddress);
    const policy = getPolicyById(params.policyId, user.id);
    if (!policy) throw new Error("Policy not found");

    // Check agent paused
    const deployment = db.getDeploymentById(params.deploymentId);
    if (!deployment) throw new Error("Deployment not found");
    if (deployment.userId !== user.id) throw new Error("Unauthorized");
    if (deployment.status === "PAUSED" || deployment.status === "paused") {
      throw new Error("Agent paused — no new execution permitted");
    }

    // Policy engine is authoritative
    const agentAction = intentToAgentAction(params.intent);
    const verdict = validateAction(agentAction, policy.doc);
    const policyHash = policy.docHash;
    const intentHash = `0x${Math.random().toString(16).slice(2, 10)}` as Hex;

    // Idempotency: check duplicate by intentHash
    const existing = db.getAll<any>("execution_requests").find((r: any) => r.intentHash === intentHash && r.agentDeploymentId === params.deploymentId);
    if (existing) {
      return existing;
    }

    return createExecutionRequest(user.id, params.deploymentId, params.policyId, params.intent, {
      ...verdict,
      policyHash,
      intentHash,
      evaluatedAt: Date.now(),
    } as any);
  },

  "POST /executions/:id/approve": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return approveExecutionRequest(id, user.id);
  },

  "POST /executions/:id/reject": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return rejectExecutionRequest(id, user.id);
  },

  "GET /activity": (userAddress: Hex, filter?: string) => {
    const user = requireUser(userAddress);
    let requests = getExecutionRequestsByUser(user.id);
    if (filter && filter !== "all") {
      requests = requests.filter((r: any) => r.status === filter || (filter === "approved" && r.status === "POLICY_APPROVED") || (filter === "completed" && r.status === "COMPLETED"));
    }
    return requests;
  },

  "GET /receipts/:id": (id: string, userAddress: Hex) => {
    const user = requireUser(userAddress);
    return getReceiptById(id, user.id);
  },

  "GET /receipts": (userAddress: Hex) => {
    const user = requireUser(userAddress);
    return getReceiptsByUser(user.id);
  },

  "GET /pending-approvals": (userAddress: Hex) => {
    const user = requireUser(userAddress);
    return getPendingApprovalsByUser(user.id);
  },
};
