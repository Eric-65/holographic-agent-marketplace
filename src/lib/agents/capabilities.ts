/**
 * Structured capability registry for Holographic
 * Every proposed action must correspond to a registered capability
 */

export const CAPABILITIES = {
  PRIVATE_TRANSFER: {
    id: "PRIVATE_TRANSFER",
    label: "Private Transfer",
    description: "Private transfers via STRK20 privacy pool, notes selected in-wallet, STARK proof verified onchain",
    riskWeight: 2,
    requiresPrivacy: true,
  },
  PRIVATE_DISTRIBUTION: {
    id: "PRIVATE_DISTRIBUTION",
    label: "Private Distribution",
    description: "Batch confidential distribution to multiple approved recipients with atomic execution",
    riskWeight: 3,
    requiresPrivacy: true,
  },
  PAYMENT_SCHEDULING: {
    id: "PAYMENT_SCHEDULING",
    label: "Payment Scheduling",
    description: "Policy-controlled scheduling of vendor/contractor payments with recurring preparation",
    riskWeight: 2,
    requiresPrivacy: false,
  },
  TREASURY_MANAGEMENT: {
    id: "TREASURY_MANAGEMENT",
    label: "Treasury Management",
    description: "Private treasury operations including shielded balance management and allocation",
    riskWeight: 2,
    requiresPrivacy: true,
  },
  POLICY_ENFORCEMENT: {
    id: "POLICY_ENFORCEMENT",
    label: "Policy Enforcement",
    description: "Deterministic policy evaluation with rule traces, default deny, integer-safe",
    riskWeight: 0,
    requiresPrivacy: false,
  },
  HUMAN_APPROVAL: {
    id: "HUMAN_APPROVAL",
    label: "Human Approval",
    description: "Human approval threshold gate — policy defers to user for soft band, never bypass",
    riskWeight: 0,
    requiresPrivacy: false,
  },
  COMPLIANCE_REPORTING: {
    id: "COMPLIANCE_REPORTING",
    label: "Compliance Reporting",
    description: "Compliance evidence collection, verification, and audit report preparation",
    riskWeight: 0,
    requiresPrivacy: false,
  },
  EXECUTION_ATTESTATION: {
    id: "EXECUTION_ATTESTATION",
    label: "Execution Attestation",
    description: "Onchain anchoring of non-sensitive execution events via ExecutionAttestor",
    riskWeight: 0,
    requiresPrivacy: false,
  },
  AUDIT_SUPPORT: {
    id: "AUDIT_SUPPORT",
    label: "Audit Support",
    description: "Scoped audit workflows, audit requests, evidence collection, selective disclosure boundary",
    riskWeight: 0,
    requiresPrivacy: false,
  },
  PROCUREMENT: {
    id: "PROCUREMENT",
    label: "Procurement",
    description: "Policy-controlled procurement workflows with vendor allowlists",
    riskWeight: 2,
    requiresPrivacy: false,
  },
  ANALYTICS: {
    id: "ANALYTICS",
    label: "Analytics",
    description: "Operational metrics, execution trends, verification coverage — no private data",
    riskWeight: 0,
    requiresPrivacy: false,
  },
  SCHEDULED_PAYMENTS: {
    id: "SCHEDULED_PAYMENTS",
    label: "Scheduled Payments",
    description: "Recurring/future-dated payment intents re-evaluated against the current policy at fire time — never a stored signing key",
    riskWeight: 2,
    requiresPrivacy: false,
  },
  BUDGETS: {
    id: "BUDGETS",
    label: "Budgets",
    description: "Period-scoped spending ceilings enforced alongside the policy engine, never in place of it",
    riskWeight: 1,
    requiresPrivacy: false,
  },
  BATCH_PAYMENTS: {
    id: "BATCH_PAYMENTS",
    label: "Batch Payments",
    description: "Multi-recipient payment sets prepared and reviewed together, each item still individually policy-checked and wallet-authorized",
    riskWeight: 2,
    requiresPrivacy: false,
  },
  WORKFLOW_PARTICIPATION: {
    id: "WORKFLOW_PARTICIPATION",
    label: "Workflow Participation",
    description: "Participates as one step in a multi-agent workflow, gated by policy/compliance steps ahead of any execution step",
    riskWeight: 1,
    requiresPrivacy: false,
  },
} as const;

export type CapabilityId = keyof typeof CAPABILITIES;

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as CapabilityId[];

export function isValidCapability(cap: string): cap is CapabilityId {
  return (ALL_CAPABILITIES as string[]).includes(cap);
}

export function getCapability(id: string) {
  return (CAPABILITIES as Record<string, typeof CAPABILITIES[CapabilityId]>)[id] ?? null;
}

export function capabilityRiskWeight(cap: string): number {
  const c = getCapability(cap);
  return c ? c.riskWeight : 5; // unknown capability high risk
}

export function capabilityRequiresPrivacy(cap: string): boolean {
  const c = getCapability(cap);
  return c ? c.requiresPrivacy : true;
}

export function validateCapabilities(caps: string[]): { valid: boolean; invalid?: string[]; reason?: string } {
  if (!Array.isArray(caps) || caps.length === 0) {
    return { valid: false, reason: "Capabilities array empty — agent must declare at least one capability" };
  }
  const invalid = caps.filter((c) => !isValidCapability(c));
  if (invalid.length > 0) {
    return { valid: false, invalid, reason: `Unsupported capabilities: ${invalid.join(", ")} — allowed: ${ALL_CAPABILITIES.join(", ")}` };
  }
  return { valid: true };
}

// Capability validation for intent
export function validateIntentCapability(intentAction: string, agentCapabilities: string[]): boolean {
  // Map intent action to capability
  const mapping: Record<string, CapabilityId[]> = {
    PRIVATE_TRANSFER: ["PRIVATE_TRANSFER", "TREASURY_MANAGEMENT", "PAYMENT_SCHEDULING"],
    private_transfer: ["PRIVATE_TRANSFER", "TREASURY_MANAGEMENT"],
    transfer: ["PRIVATE_TRANSFER"],
    payment: ["PRIVATE_TRANSFER", "PAYMENT_SCHEDULING"],
    PRIVATE_DISTRIBUTION: ["PRIVATE_DISTRIBUTION"],
    TREASURY_MANAGEMENT: ["TREASURY_MANAGEMENT"],
  };

  const required = mapping[intentAction] ?? [];
  if (required.length === 0) {
    // If no mapping, check direct capability match
    return agentCapabilities.includes(intentAction);
  }
  return required.some((cap) => agentCapabilities.includes(cap));
}
