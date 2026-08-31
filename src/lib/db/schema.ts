/**
 * Database schema — production-ready for Holographic marketplace + lifecycle
 * Core: users, wallets, agents, agent_versions, agent_deployments, policies, policy_versions,
 * approved_recipients, execution_requests, policy_decisions, execution_results, execution_receipts,
 * audit_requests, audit_events, verification_results, agent_capabilities, agent_permissions, agent_metrics, notifications
 *
 * Privacy-safe: Never store viewing keys, private keys, seed phrases, private notes, proof witnesses,
 * unnecessary shielded balances, unnecessary private counterparty info.
 */

import type { Hex } from "../types";
import type { AgentPolicy, ValidationResult } from "../policy/model";
import type { TreasuryTransferIntent } from "../intent/model";

export interface DbUser {
  id: string;
  address: Hex;
  createdAt: number;
  lastActiveAt: number;
}

export interface DbWallet {
  id: string;
  userId: string;
  address: Hex;
  chainId: string | null;
  name: string | null;
  isMock: boolean;
  adapterKind: "mock" | "ready" | "walletconnect" | "real";
  connectedAt: number;
  disconnectedAt?: number;
  status: "connected" | "disconnected";
}

export interface DbAgent {
  id: string;
  name: string;
  slug: string;
  description: string;
  creator: string;
  creatorWallet: Hex;
  version: string;
  category: "TREASURY" | "PAYMENTS" | "DISTRIBUTION" | "COMPLIANCE" | "PROCUREMENT" | "ANALYTICS" | string;
  capabilities: string[]; // structured: PRIVATE_TRANSFER, PRIVATE_DISTRIBUTION, etc.
  supportedAssets: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  privacySupport: boolean;
  verificationStatus: "VERIFIED" | "PENDING" | "FAILED" | "NOT_AVAILABLE";
  deploymentStatus: "LIVE" | "BETA" | "PREPARED" | "DISABLED";
  createdAt: number;
  updatedAt: number;
  metadataHash: Hex;
  manifest?: AgentManifest;
}

export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  creator: string;
  description: string;
  category: string;
  capabilities: string[];
  supportedAssets: string[];
  requiredPermissions: string[];
  policyRequirements: {
    maxTransactionAmount: number;
    dailyLimit: number;
    approvalThreshold: number;
    allowedAssets: string[];
  };
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  verification: {
    audited: boolean;
    auditedBy?: string;
    verificationStatus: string;
  };
}

export interface DbAgentVersion {
  id: string;
  agentId: string;
  version: string;
  manifestHash: Hex;
  actionSurface: string[];
  assets: string[];
  capabilities: string[];
  createdAt: number;
  status: "active" | "superseded" | "revoked" | "DRAFT" | "ACTIVE" | "DISABLED";
  changes?: string;
}

export interface DbAgentCapability {
  id: string;
  agentId: string;
  capability: string; // PRIVATE_TRANSFER, PRIVATE_DISTRIBUTION, POLICY_ENFORCEMENT, HUMAN_APPROVAL, EXECUTION_ATTESTATION, AUDIT_SUPPORT
  createdAt: number;
}

export interface DbAgentDeployment {
  id: string;
  userId: string;
  walletId: string;
  agentId: string;
  agentVersion: string;
  status: "DRAFT" | "PENDING_ACTIVATION" | "ACTIVE" | "PAUSED" | "DISABLED" | "DECOMMISSIONED" | "active" | "paused" | "quarantined" | "unbound";
  policyId: string | null;
  createdAt: number;
  updatedAt: number;
  activatedAt?: number;
  pausedAt?: number;
  decommissionedAt?: number;
}

export interface DbAgentPermission {
  id: string;
  deploymentId: string;
  userId: string;
  permission: string; // e.g., USDC, Approved recipients, $500 maximum
  allowed: boolean;
  createdAt: number;
}

export interface DbAgentMetrics {
  id: string;
  agentId: string;
  userId?: string;
  executionCount: number;
  successfulExecutions: number;
  blockedRequests: number;
  failedExecutions: number;
  policyViolations: number;
  humanApprovals: number;
  humanApprovalRate: number;
  verificationCoverage: number;
  policyBlockRate: number;
  createdAt: number;
  updatedAt: number;
}

export interface DbPolicy {
  id: string;
  userId: string;
  agentId: string;
  agentDeploymentId: string | null;
  version: number;
  label: string;
  doc: AgentPolicy;
  docHash: Hex;
  status: "draft" | "active" | "superseded" | "DRAFT" | "ACTIVE" | "PAUSED" | "DISABLED";
  createdAt: number;
  updatedAt: number;
  onchainCommitTx?: Hex;
}

export interface DbPolicyVersion {
  id: string;
  policyId: string;
  userId: string;
  version: number;
  doc: AgentPolicy;
  docHash: Hex;
  createdAt: number;
  status: "active" | "superseded";
}

export interface DbApprovedRecipient {
  id: string;
  userId: string;
  policyId: string;
  name: string;
  address: string;
  asset: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DbExecutionRequest {
  id: string;
  userId: string;
  agentDeploymentId: string;
  policyId: string;
  intent: TreasuryTransferIntent;
  intentHash: Hex;
  policyHash: Hex;
  status: "PROPOSED" | "POLICY_APPROVED" | "AWAITING_USER" | "EXECUTING" | "COMPLETED" | "BLOCKED" | "FAILED" | "CANCELLED" | "pending" | "approved" | "blocked" | "awaiting_confirmation" | "confirmed" | "rejected" | "executed" | "failed";
  verdict: ValidationResult & {
    trace?: { id: string; outcome: string; observed: string; bound: string }[];
    policyHash: Hex;
    intentHash: Hex;
    evaluatedAt: number;
  };
  createdAt: number;
  updatedAt: number;
  requiresHumanApproval: boolean;
  approvedByUser?: boolean;
  approvedAt?: number;
  rejectedAt?: number;
  agentVersion: string;
  policyVersion: number;
}

export interface DbPolicyDecision {
  id: string;
  executionRequestId: string;
  userId: string;
  policyId: string;
  policyVersion: number;
  intentHash: Hex;
  verdict: ValidationResult;
  ruleTrace: { id: string; outcome: string; observed: string; bound: string }[];
  timestamp: number;
  createdAt: number;
}

export interface DbExecutionResult {
  id: string;
  executionRequestId: string;
  userId: string;
  txHash: Hex | "NOT AVAILABLE";
  block?: number;
  proofVerified: boolean;
  latencyMs?: number;
  status: "success" | "failed" | "COMPLETED" | "FAILED";
  provider: "mock" | "strk20";
  bucket: string;
  error?: string;
  errorCode?: string;
  createdAt: number;
}

export interface DbExecutionReceipt {
  id: string;
  userId: string;
  executionRequestId: string;
  executionResultId: string;
  agentId: string;
  agentName: string;
  agentVersion: string;
  policyId: string;
  policyVersion: number;
  intentHash: Hex;
  policyHash: Hex;
  traceHash: Hex;
  txHash: Hex | "NOT AVAILABLE";
  attestationSig: Hex | "NOT AVAILABLE";
  status: "executed" | "blocked" | "awaiting_confirmation" | "reverted" | "pending" | "completed" | "failed" | "COMPLETED" | "BLOCKED";
  provider: "mock" | "strk20";
  bucket: string;
  createdAt: number;
  isDemo: boolean;
}

export type AuditSubjectType = "execution" | "agent" | "policy" | "date_range" | "execution_class";
export type AuditRequestStatus = "PENDING" | "AUTHORIZED" | "FULFILLED" | "REJECTED" | "EXPIRED";
export type AuditorRole = "OWNER" | "OPERATOR" | "AUDITOR";

export interface DbAuditRequest {
  id: string;
  userId: string;
  subjectType: AuditSubjectType;
  subjectId: string;
  subjectName?: string;
  reason: string;
  scope: {
    policyEvidence: boolean;
    executionEvidence: boolean;
    disclosure: boolean;
    agent?: string;
    policyVersion?: number;
    dateRange?: { from: number; to: number };
    executionClass?: string;
  };
  status: AuditRequestStatus;
  requestedBy: string;
  authorizedBy?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  fulfilledAt?: number;
}

export interface DbAuditEvent {
  id: string;
  userId: string;
  type: "agent_registered" | "policy_created" | "policy_committed" | "agent_deployed" | "execution_proposed" | "policy_approved" | "human_approval_granted" | "private_execution_completed" | "execution_attested" | "audit_requested" | "evidence_verified" | "audit_authorized" | "audit_fulfilled" | "audit_rejected";
  subjectId: string;
  subjectType: AuditSubjectType;
  metadata: {
    agentId?: string;
    policyId?: string;
    executionId?: string;
    receiptId?: string;
    txHash?: string;
    decision?: string;
    [k: string]: unknown;
  };
  isOnchain: boolean;
  createdAt: number;
}

export type VerificationStatus = "NOT_CHECKED" | "CHECKING" | "VERIFIED" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE";

export interface DbVerificationResult {
  id: string;
  userId: string;
  subjectType: "agent" | "policy" | "execution" | "attestation";
  subjectId: string;
  status: VerificationStatus;
  details: {
    agent?: VerificationStatus;
    policy?: "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE";
    execution?: "COMPLETED" | "FAILED" | "NOT_FOUND" | "UNAVAILABLE";
    attestation?: "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE";
    commitment?: string;
    onchainCommitment?: string;
    reason?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface DbNotification {
  id: string;
  userId: string;
  type:
    | "agent_deployed"
    | "agent_activated"
    | "policy_rejected"
    | "human_approval_requested"
    | "execution_completed"
    | "agent_paused"
    | "version_update_available"
    | "verification_failed"
    | "schedule_payment_due"
    | "payment_ready"
    | "policy_blocked_payment"
    | "approval_required"
    | "workflow_completed"
    | "workflow_failed"
    | "budget_exceeded"
    | "automation_paused"
    | "automation_resumed";
  title: string;
  message: string;
  read: boolean;
  relatedId?: string;
  createdAt: number;
}

/* ------------------------------------------------------- treasury automation
 * Added for the treasury-automation milestone: scheduled payments, budgets,
 * batches, payment requests and multi-agent workflows. Every entity here is a
 * FUTURE INTENT or a record of a decision — never a signed transaction. The
 * user's wallet remains the only signer; nothing in this section stores or
 * requires a private key.
 * -------------------------------------------------------------------------- */

export type ScheduleFrequency = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
export type ScheduleStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "EXPIRED" | "CANCELLED";
export type ApprovalMode = "AUTOMATIC" | "REQUIRE_APPROVAL" | "MANUAL_ONLY";

export interface DbPaymentSchedule {
  id: string;
  userId: string;
  agentDeploymentId: string;
  asset: string;
  recipient: string;
  amount: number; // minor units, integer-safe
  reason: string;
  frequency: ScheduleFrequency;
  customIntervalDays?: number;
  startDate: number;
  endDate?: number;
  maxOccurrences?: number;
  approvalMode: ApprovalMode;
  budgetId?: string;
  status: ScheduleStatus;
  nextOccurrenceAt: number;
  lastOccurrenceAt?: number;
  occurrenceCount: number;
  createdAt: number;
  updatedAt: number;
  pausedAt?: number;
  cancelledAt?: number;
}

/** Execution state of one FIRED occurrence of a schedule — distinct from the schedule's own state. */
export type OccurrenceStatus =
  | "DUE"
  | "AWAITING_USER_INITIATION"
  | "READY"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED";

export interface DbScheduleOccurrence {
  id: string;
  scheduleId: string;
  userId: string;
  /** Deterministic idempotency key: `${scheduleId}:${occurrenceAt}`. */
  occurrenceKey: string;
  occurrenceAt: number;
  status: OccurrenceStatus;
  executionRequestId?: string;
  policyVersionUsed?: number;
  blockedReason?: string;
  createdAt: number;
  updatedAt: number;
}

export type BudgetPeriod = "DAILY" | "WEEKLY" | "MONTHLY";
export type BudgetStatus = "ACTIVE" | "PAUSED" | "EXPIRED";

export interface DbBudget {
  id: string;
  userId: string;
  name: string;
  asset: string;
  limit: number; // minor units, per period
  period: BudgetPeriod;
  policyId: string | null;
  status: BudgetStatus;
  createdAt: number;
  updatedAt: number;
}

export interface DbBudgetUsage {
  id: string;
  budgetId: string;
  userId: string;
  /** Calendar bucket the usage falls into, e.g. "2026-08-31", "2026-W35", "2026-08". */
  periodKey: string;
  used: number; // minor units consumed by this single execution
  executionRequestId: string; // unique per row — idempotency for double-counting
  createdAt: number;
}

export type PaymentRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED";

export interface DbPaymentRequest {
  id: string;
  senderUserId: string; // authorizes and pays — controls the sender's own policy
  agentDeploymentId: string;
  recipientAddress: string;
  recipientLabel?: string;
  asset: string;
  amount: number;
  reason: string;
  status: PaymentRequestStatus;
  executionRequestId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export type BatchStatus = "DRAFT" | "REVIEWED" | "EXECUTING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "CANCELLED";
export type BatchItemStatus = "PENDING" | "APPROVED" | "REQUIRES_APPROVAL" | "BLOCKED" | "EXECUTING" | "COMPLETED" | "FAILED";

export interface DbBatchItem {
  id: string;
  recipient: string;
  asset: string;
  amount: number;
  reason: string;
  status: BatchItemStatus;
  blockedReason?: string;
  requiresHumanApproval: boolean;
  executionRequestId?: string;
}

export interface DbPaymentBatch {
  id: string;
  userId: string;
  agentDeploymentId: string;
  budgetId?: string;
  name: string;
  items: DbBatchItem[];
  status: BatchStatus;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
}

export type WorkflowStatus = "DRAFT" | "ACTIVE" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELLED";
export type WorkflowStepType = "PAYMENT_PROPOSAL" | "COMPLIANCE_CHECK" | "POLICY_EVALUATION" | "TREASURY_EXECUTION" | "ATTESTATION";
export type WorkflowStepStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "AWAITING_APPROVAL" | "SKIPPED";

export interface WorkflowStepDef {
  order: number;
  type: WorkflowStepType;
  agentId: string;
  label: string;
}

export interface DbWorkflowDefinition {
  id: string;
  userId: string;
  name: string;
  version: number;
  agents: string[];
  steps: WorkflowStepDef[];
  status: WorkflowStatus;
  createdAt: number;
  updatedAt: number;
}

export interface DbWorkflowRun {
  id: string;
  workflowId: string;
  userId: string;
  agentDeploymentId: string;
  budgetId?: string;
  intent: { recipient: string; asset: string; amount: number; reason: string };
  status: WorkflowStatus;
  currentStepOrder: number;
  executionRequestId?: string;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface DbWorkflowStep {
  id: string;
  runId: string;
  workflowId: string;
  userId: string;
  order: number;
  type: WorkflowStepType;
  agentId: string;
  status: WorkflowStepStatus;
  detail: string;
  startedAt: number;
  completedAt?: number;
}

export interface DbAgentMessage {
  id: string;
  workflowId: string;
  runId: string;
  senderAgent: string;
  receiverAgent: string;
  messageType: string;
  payload: Record<string, unknown>;
  timestamp: number;
  nonce: number;
  createdAt: number;
}

export interface DbAutomationControl {
  id: string;
  userId: string;
  paused: boolean;
  pausedReason?: string;
  pausedAt?: number;
  resumedAt?: number;
  maxDailyTreasurySpend: number; // minor units, notional reference ceiling across scheduled/batch/workflow automation
  maxBatchSize: number;
  maxRecipients: number;
  requireNewRecipientApproval: boolean;
  emergencyPauseThreshold: number; // minor units — a single automated action above this always requires approval
  createdAt: number;
  updatedAt: number;
}

export type DbTableName =
  | "users"
  | "wallets"
  | "agents"
  | "agent_versions"
  | "agent_capabilities"
  | "agent_deployments"
  | "agent_permissions"
  | "agent_metrics"
  | "policies"
  | "policy_versions"
  | "approved_recipients"
  | "execution_requests"
  | "policy_decisions"
  | "execution_results"
  | "execution_receipts"
  | "audit_requests"
  | "audit_events"
  | "verification_results"
  | "notifications"
  | "payment_schedules"
  | "schedule_occurrences"
  | "budgets"
  | "budget_usage"
  | "payment_requests"
  | "payment_batches"
  | "workflow_definitions"
  | "workflow_runs"
  | "workflow_steps"
  | "agent_messages"
  | "automation_controls";

export interface DbSchema {
  users: DbUser[];
  wallets: DbWallet[];
  agents: DbAgent[];
  agent_versions: DbAgentVersion[];
  agent_capabilities: DbAgentCapability[];
  agent_deployments: DbAgentDeployment[];
  agent_permissions: DbAgentPermission[];
  agent_metrics: DbAgentMetrics[];
  policies: DbPolicy[];
  policy_versions: DbPolicyVersion[];
  approved_recipients: DbApprovedRecipient[];
  execution_requests: DbExecutionRequest[];
  policy_decisions: DbPolicyDecision[];
  execution_results: DbExecutionResult[];
  execution_receipts: DbExecutionReceipt[];
  audit_requests: DbAuditRequest[];
  audit_events: DbAuditEvent[];
  verification_results: DbVerificationResult[];
  notifications: DbNotification[];
  payment_schedules: DbPaymentSchedule[];
  schedule_occurrences: DbScheduleOccurrence[];
  budgets: DbBudget[];
  budget_usage: DbBudgetUsage[];
  payment_requests: DbPaymentRequest[];
  payment_batches: DbPaymentBatch[];
  workflow_definitions: DbWorkflowDefinition[];
  workflow_runs: DbWorkflowRun[];
  workflow_steps: DbWorkflowStep[];
  agent_messages: DbAgentMessage[];
  automation_controls: DbAutomationControl[];
}
