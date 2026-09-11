/**
 * The AI tool layer — everything an AIProvider (mock or real) is allowed to
 * read, and the only surface it can PROPOSE through. Every function here is
 * tenant-scoped to a `userId` and reuses the exact same "backend" API
 * modules the rest of the app already calls — there is no shortcut path,
 * no second copy of policy/budget logic, and nothing here signs a
 * transaction or writes to `execution_requests` with an ALLOWED verdict the
 * deterministic engine didn't itself produce.
 *
 * READ/PROPOSE only. Execution is gated separately in requestExecution.ts.
 */

import { db } from "../db/client";
import type { DbAgent, DbAgentDeployment, DbApprovedRecipient, DbBudget, DbExecutionRequest, DbPolicy } from "../db/schema";
import { getActiveDeploymentsByUser, getDeploymentById } from "../api/deployments";
import { getActivePolicyByDeployment } from "../api/policies";
import { getRecipientsByUser } from "../api/recipients";
import { getBudgetsByUser, usedInCurrentPeriod } from "../api/budgets";
import { getPendingApprovalsByUser, getExecutionRequestById } from "../api/executions";
import { getSchedulesByUser, getScheduleById } from "../api/schedules";
import { validateIntentCapability } from "../agents/capabilities";
import type { AIAction } from "./schema";

/* --------------------------------------------------------------- agents */

export interface DeploymentContext {
  deployment: DbAgentDeployment;
  agent: DbAgent;
  policy: DbPolicy;
}

/**
 * The single ACTIVE, policy-bound deployment this user has that supports
 * `action` — or null if none exists. The AI never picks an arbitrary agent;
 * if a user has multiple eligible deployments, the caller (tools consumer)
 * must surface that as a clarification rather than silently choosing one.
 */
export function findEligibleDeployments(userId: string, action: AIAction): DeploymentContext[] {
  const deployments = getActiveDeploymentsByUser(userId);
  const out: DeploymentContext[] = [];
  for (const deployment of deployments) {
    const agent = db.getById<DbAgent>("agents", deployment.agentId);
    if (!agent) continue;
    if (!validateIntentCapability(action, agent.capabilities)) continue;
    const policy = getActivePolicyByDeployment(deployment.id, userId);
    if (!policy) continue;
    out.push({ deployment, agent, policy });
  }
  return out;
}

/** Every capability across this user's active, policy-bound deployments — for building the AI's minimized context, never for authorization. */
export function getActiveAgentCapabilities(userId: string): string[] {
  const deployments = getActiveDeploymentsByUser(userId);
  const caps = new Set<string>();
  for (const deployment of deployments) {
    const agent = db.getById<DbAgent>("agents", deployment.agentId);
    if (!agent) continue;
    if (!getActivePolicyByDeployment(deployment.id, userId)) continue;
    agent.capabilities.forEach((c) => caps.add(c));
  }
  return [...caps];
}

export function getDeploymentContext(userId: string, deploymentId: string): DeploymentContext | null {
  const deployment = getDeploymentById(deploymentId, userId);
  if (!deployment) return null;
  const agent = db.getById<DbAgent>("agents", deployment.agentId);
  if (!agent) return null;
  const policy = getActivePolicyByDeployment(deployment.id, userId);
  if (!policy) return null;
  return { deployment, agent, policy };
}

export interface CapabilityCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Re-checked independently at requestExecution time — never trusted from an earlier read. */
export function checkCapability(agent: DbAgent, action: AIAction): CapabilityCheckResult {
  if (!validateIntentCapability(action, agent.capabilities)) {
    return { allowed: false, reason: `Agent "${agent.name}" does not declare a capability that supports ${action}` };
  }
  return { allowed: true };
}

/* ----------------------------------------------------------- recipients */

export interface RecipientResolved {
  status: "RESOLVED";
  address: string;
  name: string;
}
export interface RecipientAmbiguous {
  status: "AMBIGUOUS";
  candidates: { name: string; address: string }[];
}
export interface RecipientNotFound {
  status: "NOT_FOUND";
  candidates: { name: string; address: string }[];
}
export type RecipientResolution = RecipientResolved | RecipientAmbiguous | RecipientNotFound;

/**
 * Resolves a natural-language recipient reference ("Acme Corp", "acme") to
 * one of THIS user's own named, approved recipients. Never invents or
 * accepts an address the model itself proposed — a raw address the user
 * typed is handled separately (see resolveRawAddress) and always flagged
 * as new/unverified, never silently trusted.
 */
export function resolveRecipientReference(userId: string, reference: string): RecipientResolution {
  const recipients = getRecipientsByUser(userId).filter((r) => r.active);
  const needle = reference.trim().toLowerCase();

  const exact = recipients.filter((r) => r.name.toLowerCase() === needle);
  if (exact.length === 1) return { status: "RESOLVED", address: exact[0].address, name: exact[0].name };

  const partial = recipients.filter((r) => r.name.toLowerCase().includes(needle) || needle.includes(r.name.toLowerCase()));
  const pool = exact.length > 1 ? exact : partial;
  if (pool.length === 1) return { status: "RESOLVED", address: pool[0].address, name: pool[0].name };
  if (pool.length > 1) return { status: "AMBIGUOUS", candidates: pool.map((r) => ({ name: r.name, address: r.address })) };

  return { status: "NOT_FOUND", candidates: recipients.map((r) => ({ name: r.name, address: r.address })) };
}

/**
 * A raw address the USER typed directly (never one the model chose). Still
 * resolved only against this user's own approved-recipient list — an
 * unrecognized address is reported as such, never treated as approved.
 */
export function resolveRawAddress(userId: string, address: string): RecipientResolution {
  const recipients = getRecipientsByUser(userId).filter((r) => r.active);
  const match = recipients.find((r) => r.address.toLowerCase() === address.trim().toLowerCase());
  if (match) return { status: "RESOLVED", address: match.address, name: match.name };
  return { status: "NOT_FOUND", candidates: recipients.map((r) => ({ name: r.name, address: r.address })) };
}

export function listApprovedRecipients(userId: string): DbApprovedRecipient[] {
  return getRecipientsByUser(userId).filter((r) => r.active);
}

/* --------------------------------------------------------------- budgets */

export interface BudgetSummary {
  id: string;
  name: string;
  asset: string;
  limit: number;
  used: number;
  remaining: number;
  status: DbBudget["status"];
}

export function getBudgetsSummary(userId: string): BudgetSummary[] {
  return getBudgetsByUser(userId).map((b) => {
    const used = usedInCurrentPeriod(b.id);
    return { id: b.id, name: b.name, asset: b.asset, limit: b.limit, used, remaining: Math.max(0, b.limit - used), status: b.status };
  });
}

/* --------------------------------------------------------------- status */

export function getPendingApprovalsSummary(userId: string): DbExecutionRequest[] {
  return getPendingApprovalsByUser(userId);
}

/** Looks up status for either an execution request id or a schedule id — whichever the reference matches. */
export function getStatusByReference(userId: string, referenceId: string): { kind: "execution_request" | "schedule" | "unknown"; record: unknown } {
  const execReq = getExecutionRequestById(referenceId, userId);
  if (execReq) return { kind: "execution_request", record: execReq };
  try {
    const schedule = getScheduleById(referenceId, userId);
    if (schedule) return { kind: "schedule", record: schedule };
  } catch {
    // not this user's schedule — fall through to unknown rather than leaking existence
  }
  return { kind: "unknown", record: null };
}

export function explainExecutionDecision(userId: string, executionRequestId: string): DbExecutionRequest | null {
  return getExecutionRequestById(executionRequestId, userId);
}

export function listSchedulesForUser(userId: string) {
  return getSchedulesByUser(userId);
}
