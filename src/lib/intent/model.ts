/**
 * Intent model — integer-safe by design.
 *
 * Required fields per TASK 6:
 * - agentId
 * - action
 * - asset
 * - recipient
 * - amount (integer minor units)
 * - reason
 * - requestedAt
 * - metadata
 *
 * No floating point. Amount is a bigint or safe integer in minor units.
 * For USDC (6 decimals), 1 USDC = 1_000_000.
 */

import type { Hex } from "../types";

export type TransferAction = "payment" | "transfer" | "private_transfer";

export interface TreasuryTransferIntent {
  /** Stable id for idempotency & receipt correlation */
  id: string;
  /** Agent that proposed this intent (e.g., helix-payroll, treasury agent) */
  agentId: string;
  /** Canonical action — maps to PolicyAction */
  action: TransferAction;
  /** Asset symbol, e.g., USDC */
  asset: string;
  /** Recipient address (Starknet address or alias) */
  recipient: string;
  /**
   * Amount in minor units (integer-safe).
   * MUST be a safe integer >0. Never float.
   * Example: 1_000_000 = 1 USDC if USDC has 6 decimals.
   */
  amount: number;
  /** Human-readable rationale from agent (LLM-generated, never trusted for policy) */
  reason: string;
  /** Unix ms timestamp when intent was produced — injected, not from clock inside validator */
  requestedAt: number;
  /** Opaque metadata for debugging / UX, never used for policy decisions */
  metadata?: {
    venue?: string;
    slippageBps?: number;
    deadlineMs?: number;
    nonce?: number;
    agentVersion?: string;
    policyVersion?: number;
    [k: string]: unknown;
  };
}

/** Extended version that includes Hex intentHash for receipt */
export interface EnrichedTransferIntent extends TreasuryTransferIntent {
  intentHash: Hex;
  policyHash?: Hex;
}

export function makeTransferIntent(
  overrides: Partial<TreasuryTransferIntent> & Pick<TreasuryTransferIntent, "agentId" | "asset" | "recipient" | "amount">,
): TreasuryTransferIntent {
  const now = Date.now();
  return {
    id: `INT-${now.toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6)}`,
    action: "transfer",
    reason: "Treasury agent proposed transfer",
    requestedAt: now,
    ...overrides,
    metadata: {
      venue: "STRK20 Pool",
      ...overrides.metadata,
    },
  };
}

/** Validation for intent shape before it enters policy engine */
export function isValidTransferIntent(intent: unknown): intent is TreasuryTransferIntent {
  if (typeof intent !== "object" || intent === null) return false;
  const i = intent as Record<string, unknown>;
  return (
    typeof i.agentId === "string" &&
    typeof i.asset === "string" &&
    typeof i.recipient === "string" &&
    Number.isSafeInteger(i.amount) &&
    (i.amount as number) > 0 &&
    typeof i.requestedAt === "number" &&
    typeof i.reason === "string"
  );
}
