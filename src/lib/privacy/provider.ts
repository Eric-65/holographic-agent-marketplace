import type { ActionIntent, Hex, TreasuryPosition, WalletCapabilities } from "../types";
import type { TreasuryTransferIntent } from "../intent/model";

/**
 * PRIVACY PROVIDER — single integration boundary
 * Everything above is privacy-agnostic, everything below is STRK20's problem
 */

export interface ExecutionEnvelope {
  envelopeId: string;
  intentHash: Hex;
  policyHash: Hex;
  /** Wallet API method — verified against starknet.js v10.4.0 types */
  method:
    | "wallet_shield"
    | "wallet_unshield"
    | "wallet_privateTransfer"
    | "wallet_privateSwap"
    | "wallet_privateMulticall"
    | "wallet_strk20InvokeTransaction"
    | "wallet_strk20PrepareInvoke"
    | "wallet_strk20Balances";
  /** Real STRK20 actions for wallet_strk20InvokeTransaction */
  strk20Actions?: {
    type: "transfer";
    token: string;
    amount: string;
    recipient: string;
  }[];
  expiresAt: number;
}

export interface ExecutionResult {
  txHash: Hex;
  block?: number;
  proofVerified: boolean;
  latencyMs: number;
}

export type ExecutionPhase =
  | "envelope_built"
  | "wallet_request_sent"
  | "wallet_proving"
  | "proof_submitted"
  | "proof_verified"
  | "receipt_sealed";

export interface PrivacyProvider {
  readonly id: string;
  readonly label: string;
  readonly isLive: boolean;

  detectCapabilities(): Promise<WalletCapabilities>;
  getPositions(address: Hex): Promise<TreasuryPosition[]>;

  /** Legacy envelope builder — kept for mock compatibility */
  buildEnvelope(
    intent: ActionIntent,
    policyHash: Hex,
    intentHash: Hex,
  ): Promise<ExecutionEnvelope>;

  /** New builder for TreasuryTransferIntent — integer-safe */
  buildTransferEnvelope?(
    intent: TreasuryTransferIntent,
    policyHash: Hex,
    intentHash: Hex,
  ): Promise<ExecutionEnvelope>;

  execute(
    envelope: ExecutionEnvelope,
    onPhase: (phase: ExecutionPhase) => void,
  ): Promise<ExecutionResult>;

  /** High-level private transfer — preferred for real flow */
  executePrivateTransfer?(
    intent: TreasuryTransferIntent,
    onPhase: (phase: ExecutionPhase) => void,
  ): Promise<ExecutionResult>;
}

export class PrivacyNotAvailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PrivacyNotAvailableError";
  }
}
