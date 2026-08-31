/**
 * Holographic — Policy model.
 *
 * A policy is a plain, serialisable data structure. It contains no functions,
 * no closures and no references to any runtime service, which is what makes it
 * hashable, committable on-chain and replayable years later.
 *
 * NON-NEGOTIABLE INVARIANT
 * ------------------------
 * An LLM may author a *draft* of this document and may propose actions that are
 * checked against it. An LLM is NEVER consulted at validation time. The
 * decision to allow or deny a transaction is made exclusively by
 * `validateAction`, which is a pure function of (action, policy).
 *
 * MONETARY REPRESENTATION
 * -----------------------
 * Every amount in this module is an integer in **minor units** of the asset
 * (USDC → 6dp, ETH → 18dp, and so on). Floating point is banned outright:
 * `0.1 + 0.2 !== 0.3` is not an acceptable property for a spending limit.
 * Values that are not safe integers are rejected at rule E_SCHEMA.
 */

/* ------------------------------------------------------------------ policy */

export type PolicyAction =
  | "payment"
  | "swap"
  | "transfer"
  | "shield"
  | "unshield"
  | "borrow"
  | "repay";

export interface AgentPolicy {
  /** Agent this policy is bound to. An action from any other agent is denied. */
  agentId: string;
  /** Address that authored the policy. Only the owner may amend it. */
  owner: string;
  /** Asset symbols the agent may touch. Empty array = deny everything. */
  allowedAssets: string[];
  /** Ceiling for a single action, minor units. */
  maximumTransactionAmount: number;
  /** Rolling 24h ceiling, minor units. */
  dailySpendingLimit: number;
  /**
   * Recipient allowlist for value-leaving actions.
   * An empty array means "no recipient is approved", not "all are approved".
   */
  approvedRecipients: string[];
  /**
   * At or above this amount a human must confirm. 0 disables the soft band
   * (nothing requires confirmation); it does not mean "confirm everything".
   */
  approvalThreshold: number;
  /** Action kinds the agent may perform. */
  allowedActions: PolicyAction[];
  /** Hard stop. When true, nothing is allowed, for any reason. */
  paused: boolean;
}

/* ------------------------------------------------------------------ action */

export interface AgentAction {
  /** Stable id for the proposal — used for idempotency and receipts. */
  id: string;
  /** Agent that emitted this action. Must equal `policy.agentId`. */
  agentId: string;
  action: PolicyAction;
  asset: string;
  /** Integer, minor units, strictly positive. */
  amount: number;
  /** Required for value-leaving actions; ignored for shield/unshield. */
  recipient?: string;
  /**
   * Rolling 24h total already spent under this binding, minor units.
   * Injected by the caller so the validator performs no I/O and stays pure.
   */
  spentToday: number;
  /** Evaluation timestamp, injected. The validator never reads the clock. */
  timestamp: number;
}

/* ------------------------------------------------------------------ result */

export interface ValidationResult {
  allowed: boolean;
  /** Every violated rule, in fixed order. Empty when allowed. */
  reasons: string[];
  requiresHumanApproval: boolean;
}

/* ---------------------------------------------------------------- reasons */

/**
 * Stable, machine-readable reason codes. These are part of the public contract:
 * they appear in receipts and audit exports, so they must never be renamed or
 * reordered without a policy-engine major version bump.
 */
export const REASON = {
  SCHEMA: "E_SCHEMA",
  AGENT_MISMATCH: "E_AGENT_MISMATCH",
  PAUSED: "E_AGENT_PAUSED",
  ACTION_NOT_ALLOWED: "E_ACTION_NOT_ALLOWED",
  ASSET_NOT_ALLOWED: "E_ASSET_NOT_ALLOWED",
  RECIPIENT_NOT_APPROVED: "E_RECIPIENT_NOT_APPROVED",
  RECIPIENT_MISSING: "E_RECIPIENT_MISSING",
  ABOVE_TX_LIMIT: "E_ABOVE_TRANSACTION_LIMIT",
  DAILY_LIMIT_EXCEEDED: "E_DAILY_LIMIT_EXCEEDED",
} as const;

/** Actions that move value to a third party and therefore need a recipient. */
export const RECIPIENT_REQUIRED: ReadonlySet<PolicyAction> = new Set<PolicyAction>([
  "payment",
  "transfer",
]);

/** Actions that consume spending allowance (i.e. count toward the daily cap). */
export const SPEND_BEARING: ReadonlySet<PolicyAction> = new Set<PolicyAction>([
  "payment",
  "transfer",
  "swap",
  "borrow",
  "unshield",
]);

/* --------------------------------------------------------------- factories */

/**
 * Safe default: everything denied. A policy must be widened deliberately,
 * never narrowed accidentally. This is the default-deny posture in data form.
 */
export function emptyPolicy(agentId: string, owner: string): AgentPolicy {
  return {
    agentId,
    owner,
    allowedAssets: [],
    maximumTransactionAmount: 0,
    dailySpendingLimit: 0,
    approvedRecipients: [],
    approvalThreshold: 0,
    allowedActions: [],
    paused: true,
  };
}

export function makePolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return { ...emptyPolicy("agent:unset", "0x0"), ...overrides };
}
