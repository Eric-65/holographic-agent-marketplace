import { db } from "../db/client";
import type { DbWorkflowDefinition, DbWorkflowRun, DbWorkflowStep, WorkflowStepDef } from "../db/schema";
import { VENDOR_PAYMENT_WORKFLOW_STEPS, stepAt } from "../workflow/model";
import { getDeploymentById } from "./deployments";
import { getActivePolicyByDeployment } from "./policies";
import { createExecutionRequest, computeSpentToday, getReceiptsByUser } from "./executions";
import { evaluateBudget, recordBudgetUsage } from "./budgets";
import { getAutomationControl } from "./automation";
import { sendAgentMessage } from "./agentMessages";
import { intentToAgentAction } from "../execution/privateTransfer";
import { validateAction } from "../policy/validateAction";
import { bucketOf } from "../policy/engine";
import { makeTransferIntent } from "../intent/model";
import { poseidonish } from "../hash";
import type { Hex } from "../types";

/**
 * Multi-agent workflow engine. Every step is a deterministic, structured
 * evaluation — not an LLM decision. Agents never hand financial authority to
 * one another directly: every path through this file terminates at the same
 * shared boundary — Policy Engine → Wallet → STRK20 — exactly like a single
 * transfer. A failed or gated step always stops downstream financial action.
 */

export function createWorkflowDefinition(userId: string, name: string, steps: WorkflowStepDef[] = VENDOR_PAYMENT_WORKFLOW_STEPS): DbWorkflowDefinition {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  const agents = [...new Set(steps.map((s) => s.agentId))];
  return db.create<DbWorkflowDefinition>("workflow_definitions", {
    userId,
    name: name || "Vendor Payment Workflow",
    version: 1,
    agents,
    steps,
    status: "ACTIVE",
    updatedAt: Date.now(),
  });
}

export function getWorkflowDefinitionsByUser(userId: string): DbWorkflowDefinition[] {
  return db.find<DbWorkflowDefinition>("workflow_definitions", (w) => w.userId === userId);
}

export function getWorkflowDefinitionById(id: string, userId?: string): DbWorkflowDefinition | null {
  const def = db.getById<DbWorkflowDefinition>("workflow_definitions", id);
  if (!def) return null;
  if (userId && def.userId !== userId) throw new Error("Unauthorized");
  return def;
}

export function getRunsByUser(userId: string): DbWorkflowRun[] {
  return db.find<DbWorkflowRun>("workflow_runs", (r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function getRunById(id: string, userId?: string): DbWorkflowRun | null {
  const run = db.getById<DbWorkflowRun>("workflow_runs", id);
  if (!run) return null;
  if (userId && run.userId !== userId) throw new Error("Unauthorized");
  return run;
}

export function getStepsByRun(runId: string): DbWorkflowStep[] {
  return db.find<DbWorkflowStep>("workflow_steps", (s) => s.runId === runId).sort((a, b) => a.order - b.order);
}

function createStep(run: DbWorkflowRun, def: WorkflowStepDef, status: DbWorkflowStep["status"], detail: string): DbWorkflowStep {
  const now = Date.now();
  return db.create<DbWorkflowStep>("workflow_steps", {
    runId: run.id,
    workflowId: run.workflowId,
    userId: run.userId,
    order: def.order,
    type: def.type,
    agentId: def.agentId,
    status,
    detail,
    startedAt: now,
    completedAt: status === "PENDING" || status === "RUNNING" ? undefined : now,
  });
}

function notify(userId: string, type: any, title: string, message: string, relatedId?: string) {
  try {
    db.create("notifications", { userId, type, title, message, read: false, relatedId, createdAt: Date.now() });
  } catch {}
}

function failRun(run: DbWorkflowRun, reason: string): DbWorkflowRun {
  const updated = db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "FAILED", failureReason: reason })!;
  notify(run.userId, "workflow_failed", "Workflow failed", reason, run.id);
  return updated;
}

/**
 * Starts a run and auto-advances through every non-financial step
 * (compliance, policy evaluation) until it either fails, needs human
 * approval, or reaches TREASURY_EXECUTION and prepares an execution request
 * for wallet authorization.
 */
export function startWorkflowRun(
  userId: string,
  workflowId: string,
  agentDeploymentId: string,
  intent: { recipient: string; asset: string; amount: number; reason: string },
  budgetId?: string,
): DbWorkflowRun {
  const def = getWorkflowDefinitionById(workflowId, userId);
  if (!def) throw new Error("Workflow definition not found");
  const deployment = getDeploymentById(agentDeploymentId, userId);
  if (!deployment) throw new Error("Deployment not found");
  if (!Number.isSafeInteger(intent.amount) || intent.amount <= 0) throw new Error("Amount must be a positive integer (minor units)");

  const run = db.create<DbWorkflowRun>("workflow_runs", {
    workflowId,
    userId,
    agentDeploymentId,
    budgetId,
    intent,
    status: "RUNNING",
    currentStepOrder: 1,
    updatedAt: Date.now(),
  });

  const proposalStep = stepAt(def.steps, 1)!;
  createStep(run, proposalStep, "PASSED", `Payment Agent proposed "${intent.reason}" — ${bucketOf(intent.amount)} notional`);
  const nextStep = stepAt(def.steps, 2);
  if (nextStep) {
    sendAgentMessage({
      workflowId,
      runId: run.id,
      senderAgent: proposalStep.agentId,
      receiverAgent: nextStep.agentId,
      messageType: "PAYMENT_PROPOSED",
      payload: { asset: intent.asset, bucket: bucketOf(intent.amount) },
    });
  }

  return advanceWorkflowRun(run.id, userId);
}

interface RunEvaluation {
  policy: NonNullable<ReturnType<typeof getActivePolicyByDeployment>> | null;
  verdict: ReturnType<typeof validateAction> | null;
  intent: ReturnType<typeof makeTransferIntent> | null;
  combinedAllowed: boolean;
  reasons: string[];
}

/** Fresh (never cached) evaluation of a run's intent against the CURRENT policy + budget. */
function evaluateRun(run: DbWorkflowRun): RunEvaluation {
  const policy = getActivePolicyByDeployment(run.agentDeploymentId, run.userId);
  if (!policy) return { policy: null, verdict: null, intent: null, combinedAllowed: false, reasons: ["No active policy bound to this deployment"] };

  const intent = makeTransferIntent({
    id: `WF-${run.id}`,
    agentId: policy.agentId,
    asset: run.intent.asset,
    recipient: run.intent.recipient,
    amount: run.intent.amount,
    action: "transfer",
    reason: run.intent.reason,
    requestedAt: Date.now(),
    metadata: { venue: "STRK20 Pool", workflowRunId: run.id, workflowId: run.workflowId, automationSource: "workflow" },
  });

  const spentToday = computeSpentToday(run.agentDeploymentId, run.intent.asset);
  const verdict = validateAction(intentToAgentAction(intent, spentToday), policy.doc);

  const reasons = [...verdict.reasons];
  let budgetOk = true;
  if (run.budgetId) {
    const budgetResult = evaluateBudget(run.budgetId, run.intent.amount);
    budgetOk = budgetResult.allowed;
    if (!budgetOk && budgetResult.reason) reasons.push(`E_BUDGET_EXCEEDED: ${budgetResult.reason}`);
  }

  return { policy, verdict, intent, combinedAllowed: verdict.allowed && budgetOk, reasons };
}

export function advanceWorkflowRun(runId: string, userId: string): DbWorkflowRun {
  let run = getRunById(runId, userId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "RUNNING") return run;

  const def = getWorkflowDefinitionById(run.workflowId, userId);
  if (!def) return failRun(run, "Workflow definition missing");

  const automation = getAutomationControl(userId);
  if (automation.paused) {
    return db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "PAUSED" })!;
  }

  // Loop through steps 2..N-1 automatically; stop at TREASURY_EXECUTION once prepared.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextOrder: number = run.currentStepOrder + 1;
    const def2 = stepAt(def.steps, nextOrder);
    if (!def2) return db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "COMPLETED", completedAt: Date.now() })!;

    if (def2.type === "COMPLIANCE_CHECK") {
      const policy = getActivePolicyByDeployment(run.agentDeploymentId, userId);
      const recipientApproved = !!policy?.doc.approvedRecipients.includes(run.intent.recipient);
      const aboveEmergencyThreshold = run.intent.amount >= automation.emergencyPauseThreshold;

      if ((!recipientApproved && automation.requireNewRecipientApproval) || aboveEmergencyThreshold) {
        const reason = !recipientApproved
          ? `New recipient ${run.intent.recipient.slice(0, 10)}… requires explicit approval before compliance can pass`
          : `Amount reaches the emergency pause threshold and requires explicit approval`;
        createStep(run, def2, "AWAITING_APPROVAL", reason);
        run = db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "AWAITING_APPROVAL", currentStepOrder: nextOrder })!;
        notify(userId, "approval_required", "Workflow needs approval", reason, run.id);
        return run;
      }
      createStep(run, def2, "PASSED", "Recipient approved and amount below emergency threshold");
      run = db.update<DbWorkflowRun>("workflow_runs", run.id, { currentStepOrder: nextOrder })!;
      continue;
    }

    if (def2.type === "POLICY_EVALUATION") {
      const { verdict, combinedAllowed, reasons } = evaluateRun(run);
      if (!verdict || !combinedAllowed) {
        createStep(run, def2, "FAILED", reasons.join("; ") || "Policy evaluation failed");
        return failRun(db.update<DbWorkflowRun>("workflow_runs", run.id, { currentStepOrder: nextOrder })!, reasons[0] ?? "Policy rejected");
      }
      if (verdict.requiresHumanApproval) {
        createStep(run, def2, "AWAITING_APPROVAL", "Amount is above the policy confirmation threshold");
        run = db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "AWAITING_APPROVAL", currentStepOrder: nextOrder })!;
        notify(userId, "approval_required", "Workflow needs approval", "Policy confirmation threshold reached", run.id);
        return run;
      }
      createStep(run, def2, "PASSED", "Policy engine approved — within limits, recipient approved, agent active");
      run = db.update<DbWorkflowRun>("workflow_runs", run.id, { currentStepOrder: nextOrder })!;
      continue;
    }

    if (def2.type === "TREASURY_EXECUTION") {
      return prepareTreasuryExecutionStep(run, def2, nextOrder);
    }

    // ATTESTATION is only ever reached via completeWorkflowExecutionStep.
    createStep(run, def2, "PENDING", "Awaiting execution result");
    return db.update<DbWorkflowRun>("workflow_runs", run.id, { currentStepOrder: nextOrder })!;
  }
}

function prepareTreasuryExecutionStep(run: DbWorkflowRun, def: WorkflowStepDef, order: number): DbWorkflowRun {
  const { policy, verdict, intent, combinedAllowed, reasons } = evaluateRun(run);
  if (!policy || !verdict || !intent || !combinedAllowed) {
    createStep(run, def, "FAILED", reasons.join("; ") || "Re-evaluation at execution time failed");
    return failRun(db.update<DbWorkflowRun>("workflow_runs", run.id, { currentStepOrder: order })!, reasons[0] ?? "Policy rejected at execution time");
  }

  const policyHash = poseidonish(policy.doc) as Hex;
  const intentHash = poseidonish({ agentId: intent.agentId, asset: intent.asset, amount: intent.amount, id: intent.id }) as Hex;
  const req = createExecutionRequest(run.userId, run.agentDeploymentId, policy.id, intent, {
    allowed: true,
    reasons: [],
    requiresHumanApproval: verdict.requiresHumanApproval,
    policyHash,
    intentHash,
    evaluatedAt: Date.now(),
  });

  if (run.budgetId && !verdict.requiresHumanApproval) {
    recordBudgetUsage(run.budgetId, run.userId, run.intent.amount, req.id);
  }

  createStep(run, def, "PASSED", "Execution request prepared — awaiting wallet authorization");
  sendAgentMessage({
    workflowId: run.workflowId,
    runId: run.id,
    senderAgent: def.agentId,
    receiverAgent: def.agentId,
    messageType: "EXECUTION_PREPARED",
    payload: { executionRequestId: req.id, bucket: bucketOf(run.intent.amount) },
  });

  const status = verdict.requiresHumanApproval ? "AWAITING_APPROVAL" : "RUNNING";
  if (verdict.requiresHumanApproval) {
    notify(run.userId, "approval_required", "Payment ready for approval", `${run.intent.reason} requires your approval before wallet authorization`, run.id);
  } else {
    notify(run.userId, "payment_ready", "Payment ready", `${run.intent.reason} passed policy — ready for wallet authorization`, run.id);
  }

  return db.update<DbWorkflowRun>("workflow_runs", run.id, { status, currentStepOrder: order, executionRequestId: req.id })!;
}

/** Human resolves an AWAITING_APPROVAL gate (new recipient, threshold, emergency limit) and the run continues. */
export function approveWorkflowStep(runId: string, userId: string): DbWorkflowRun {
  const run = getRunById(runId, userId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "AWAITING_APPROVAL") throw new Error("Run is not awaiting approval");

  const steps = getStepsByRun(runId);
  const current = steps.find((s) => s.order === run.currentStepOrder);
  if (current && current.status === "AWAITING_APPROVAL") {
    db.update<DbWorkflowStep>("workflow_steps", current.id, { status: "PASSED", completedAt: Date.now(), detail: `${current.detail} — approved by user` });
  }

  db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "RUNNING" });
  return advanceWorkflowRun(runId, userId);
}

export function rejectWorkflowRun(runId: string, userId: string, reason?: string): DbWorkflowRun {
  const run = getRunById(runId, userId);
  if (!run) throw new Error("Run not found");
  return failRun(run, reason || "Rejected by user");
}

/**
 * Called by the UI after the wallet has actually authorized/failed the
 * prepared execution request (via the existing executePrivateTransfer
 * boundary). Advances to ATTESTATION on success or fails the run otherwise.
 */
export function completeWorkflowExecutionStep(runId: string, userId: string, outcome: "success" | "failed", note?: string): DbWorkflowRun {
  const run = getRunById(runId, userId);
  if (!run) throw new Error("Run not found");

  const executionStep = getStepsByRun(runId).find((s) => s.type === "TREASURY_EXECUTION");
  const def = getWorkflowDefinitionById(run.workflowId, userId);
  const attestationDef = def ? stepAt(def.steps, (executionStep?.order ?? run.currentStepOrder) + 1) : null;

  if (outcome === "failed") {
    if (executionStep) db.update<DbWorkflowStep>("workflow_steps", executionStep.id, { status: "FAILED", completedAt: Date.now(), detail: note ?? "Wallet authorization failed" });
    return failRun(run, note ?? "Wallet authorization failed or was rejected");
  }

  const receipt = run.executionRequestId ? getReceiptsByUser(userId).find((r) => r.executionRequestId === run.executionRequestId) : undefined;
  if (attestationDef) {
    createStep(run, attestationDef, "PASSED", receipt ? `Anchored — attestation ${receipt.attestationSig.slice(0, 12)}…` : "Execution completed");
  }
  if (def) {
    sendAgentMessage({
      workflowId: run.workflowId,
      runId: run.id,
      senderAgent: attestationDef?.agentId ?? "holographic-treasury",
      receiverAgent: "audit_log",
      messageType: "EXECUTION_ATTESTED",
      payload: { executionRequestId: run.executionRequestId, receiptId: receipt?.id ?? null },
    });
  }

  const completed = db.update<DbWorkflowRun>("workflow_runs", run.id, { status: "COMPLETED", completedAt: Date.now() })!;
  notify(userId, "workflow_completed", "Workflow completed", `${run.intent.reason} executed and attested`, run.id);
  return completed;
}
