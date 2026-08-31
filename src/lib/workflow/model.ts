/**
 * Multi-agent workflow domain model — pure functions only.
 *
 * A workflow is a fixed, policy-bound sequence of steps. Every step ends at
 * the SAME shared boundary: Policy Engine → Wallet → STRK20. Agents never
 * hand financial authority directly to one another — a step only ever
 * produces a structured message or a policy-checked execution request.
 */

import type { WorkflowStatus, WorkflowStepDef, WorkflowStepStatus, WorkflowStepType } from "../db/schema";

/** Workflow-run state machine — the only legal transitions. */
export const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["RUNNING", "CANCELLED"],
  RUNNING: ["AWAITING_APPROVAL", "COMPLETED", "FAILED", "PAUSED", "CANCELLED"],
  AWAITING_APPROVAL: ["RUNNING", "FAILED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionWorkflow(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

/** The built-in "Vendor Payment Workflow" template referenced by the spec. */
export const VENDOR_PAYMENT_WORKFLOW_STEPS: WorkflowStepDef[] = [
  { order: 1, type: "PAYMENT_PROPOSAL", agentId: "holographic-payment", label: "Payment Agent proposes vendor payment" },
  { order: 2, type: "COMPLIANCE_CHECK", agentId: "holographic-compliance", label: "Compliance Agent evaluates policy evidence" },
  { order: 3, type: "POLICY_EVALUATION", agentId: "holographic-treasury", label: "Policy Engine evaluates against current policy" },
  { order: 4, type: "TREASURY_EXECUTION", agentId: "holographic-treasury", label: "Treasury Agent executes via wallet + STRK20" },
  { order: 5, type: "ATTESTATION", agentId: "holographic-treasury", label: "ExecutionAttestor anchors the result" },
];

export const WORKFLOW_STEP_LABEL: Record<WorkflowStepType, string> = {
  PAYMENT_PROPOSAL: "Payment proposal",
  COMPLIANCE_CHECK: "Compliance check",
  POLICY_EVALUATION: "Policy evaluation",
  TREASURY_EXECUTION: "Treasury execution",
  ATTESTATION: "Attestation",
};

export function stepAt(steps: WorkflowStepDef[], order: number): WorkflowStepDef | null {
  return steps.find((s) => s.order === order) ?? null;
}

export function isTerminalStepStatus(status: WorkflowStepStatus): boolean {
  return status === "PASSED" || status === "FAILED" || status === "SKIPPED";
}

export function isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}
