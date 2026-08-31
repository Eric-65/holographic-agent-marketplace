import type { Hex } from "../types";
import type { TreasuryTransferIntent } from "../intent/model";
import type { AgentPolicy } from "../policy/model";

export interface PrivateTransferRequest {
  intent: TreasuryTransferIntent;
  /** Approved policy — must be the active policy used for validation */
  policy: AgentPolicy;
  /** Pre-computed policy hash for receipt */
  policyHash: Hex;
  /** Pre-computed intent hash */
  intentHash: Hex;
}

export interface PrivateTransferResult {
  /** Non-sensitive execution metadata only */
  txHash: Hex;
  block?: number;
  proofVerified: boolean;
  latencyMs: number;
  /** The bucket for receipt, not exact amount */
  bucket: string;
  /** Intent hash for correlation */
  intentHash: Hex;
  policyHash: Hex;
  traceHash?: Hex;
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "WALLET_DISCONNECTED"
      | "WRONG_NETWORK"
      | "PRIVACY_UNAVAILABLE"
      | "POLICY_REJECTED"
      | "REQUIRE_CONFIRMATION"
      | "WALLET_REJECTED"
      | "API_FAILURE"
      | "UNKNOWN",
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}
