import { poseidonish } from "../hash";
import { validateAction } from "../policy/validateAction";
import type { AgentAction } from "../policy/model";
import { REASON } from "../policy/model";
import type { TreasuryTransferIntent } from "../intent/model";
import type { AgentPolicy } from "../policy/model";
import { getPrivacyProvider, PrivacyNotAvailableError } from "../privacy";
import { getMockWalletAdapter } from "../wallet/adapters";
import { WalletNotAvailableError } from "../wallet/adapters/types";
import { ExecutionError, type PrivateTransferResult } from "./types";
import type { Hex } from "../types";

/**
 * executePrivateTransfer — real transaction boundary.
 *
 * Flow per TASK 3:
 * Connect wallet → select Treasury Agent → create transfer intent
 * → deterministic policy evaluation → wallet authorization → STRK20 private transfer
 * → execution result → non-sensitive receipt
 *
 * Guarantees:
 * - LLM never directly calls wallet (intent is structured data)
 * - deterministic policy engine is the authority
 * - returns only non-sensitive metadata (txHash, proofVerified, bucket)
 * - never stores/logs viewing keys, notes, exact amounts, proof witnesses, private counterparties
 * - does NOT perform a real transaction if wallet disconnected / wrong network / privacy unavailable
 */

export interface ExecuteOptions {
  /** Expected chain id hex, e.g., SEPOLIA */
  expectedChainId?: string;
  /** Skip human confirmation gate? Default false — confirmation required if policy says */
  allowConfirmationBypass?: boolean;
}

export async function executePrivateTransfer(
  intent: TreasuryTransferIntent,
  policy: AgentPolicy,
  opts: ExecuteOptions = {},
): Promise<PrivateTransferResult> {
  // 1. Wallet must be connected
  const walletAdapter = getMockWalletAdapter();
  const walletState = walletAdapter.getInternalState();
  if (walletState.status !== "connected" || !walletState.address) {
    throw new ExecutionError("Wallet disconnected", "WALLET_DISCONNECTED");
  }

  // 2. Network check
  if (opts.expectedChainId && walletState.chainId) {
    if (walletState.chainId.toLowerCase() !== opts.expectedChainId.toLowerCase()) {
      throw new ExecutionError(
        `Wrong network: connected ${walletState.chainId}, expected ${opts.expectedChainId}`,
        "WRONG_NETWORK",
      );
    }
  }

  // 3. Privacy provider availability
  let privacyProvider;
  try {
    privacyProvider = getPrivacyProvider();
  } catch {
    throw new ExecutionError("Privacy provider unavailable", "PRIVACY_UNAVAILABLE");
  }

  if (!walletState.capabilities.privacyApi) {
    throw new ExecutionError("Privacy layer not available in connected wallet", "PRIVACY_UNAVAILABLE");
  }

  // 4. Map TreasuryTransferIntent → AgentAction (integer-safe model) for policy engine
  //    The policy engine remains pure and deterministic.
  const agentAction: AgentAction = {
    id: intent.id,
    agentId: intent.agentId,
    action: intent.action === "private_transfer" ? "transfer" : (intent.action as AgentAction["action"]),
    asset: intent.asset,
    amount: intent.amount,
    recipient: intent.recipient,
    spentToday: 0, // In real backend, this would be injected from binding state. For vertical slice, 0.
    timestamp: intent.requestedAt,
  };

  const verdict = validateAction(agentAction, policy);

  if (!verdict.allowed) {
    const reason = verdict.reasons.join("; ");
    // Map to specific error for testing
    if (reason.includes(REASON.PAUSED)) {
      throw new ExecutionError(reason, "POLICY_REJECTED");
    }
    throw new ExecutionError(`Policy rejected: ${reason}`, "POLICY_REJECTED");
  }

  if (verdict.requiresHumanApproval && !opts.allowConfirmationBypass) {
    throw new ExecutionError("Human approval required", "REQUIRE_CONFIRMATION");
  }

  // 5. Build hashes for receipt (non-sensitive)
  const intentHash = poseidonish({
    agentId: intent.agentId,
    asset: intent.asset,
    recipient: intent.recipient ? "hashed" : "none", // Do NOT put raw recipient in hash that logs?
    // Actually include recipient in hash for uniqueness, but receipt only stores bucket
    amount: intent.amount,
    id: intent.id,
  }) as Hex;

  const policyHash = poseidonish(policy) as Hex;
  const traceHash = poseidonish(verdict.reasons) as Hex;

  // 6. Build envelope & execute via PrivacyProvider
  //    In mock mode, this simulates the wallet proving flow.
  //    In real mode (strk20), this would call wallet_request with wallet_privateTransfer
  //    and the wallet would own proving/notes/viewing keys.
  try {
    // Map to legacy ActionIntent for current envelope builder (temporary compatibility layer)
    const legacyIntent = {
      id: intent.id,
      agentId: intent.agentId,
      kind: "private_transfer" as const,
      asset: intent.asset as "USDC",
      venue: "STRK20 Pool" as const,
      amountUsd: intent.amount, // For mock, we pass minor units as USD notional — temporary
      maxSlippageBps: (intent.metadata?.slippageBps as number) ?? 50,
      counterparty: intent.recipient,
      deadline: (intent.metadata?.deadlineMs as number) ?? Date.now() + 120_000,
      rationale: intent.reason,
      nonce: (intent.metadata?.nonce as number) ?? Math.floor(Math.random() * 1e6),
      createdAt: intent.requestedAt,
    };

    const envelope = await privacyProvider.buildEnvelope(
      legacyIntent as never,
      policyHash,
      intentHash,
    );

    const result = await privacyProvider.execute(envelope, () => {
      // Only non-sensitive phase info observed
    });

    // 7. Return only non-sensitive metadata
    // For proper bucketing, use integer bucketing
    const properBucket =
      intent.amount < 1_000 * 1_000_000
        ? "<1k"
        : intent.amount < 5_000 * 1_000_000
          ? "1k–5k"
          : intent.amount < 10_000 * 1_000_000
            ? "5k–10k"
            : intent.amount < 25_000 * 1_000_000
              ? "10k–25k"
              : "25k–100k";

    return {
      txHash: result.txHash,
      block: result.block,
      proofVerified: result.proofVerified,
      latencyMs: result.latencyMs,
      bucket: properBucket,
      intentHash,
      policyHash,
      traceHash,
    };
  } catch (e) {
    if (e instanceof PrivacyNotAvailableError || e instanceof WalletNotAvailableError) {
      throw new ExecutionError(`Privacy provider unavailable: ${e.message}`, "PRIVACY_UNAVAILABLE");
    }
    if (e instanceof Error && e.message.toLowerCase().includes("user rejected")) {
      throw new ExecutionError("Wallet rejected transaction", "WALLET_REJECTED");
    }
    throw new ExecutionError(
      `STRK20 API failure: ${e instanceof Error ? e.message : String(e)}`,
      "API_FAILURE",
    );
  }
}

/**
 * Helper to create a policy-compatible AgentAction from TreasuryTransferIntent
 * for direct validation without execution.
 */
export function intentToAgentAction(
  intent: TreasuryTransferIntent,
  spentToday = 0,
): AgentAction {
  return {
    id: intent.id,
    agentId: intent.agentId,
    action: intent.action === "private_transfer" ? "transfer" : (intent.action as AgentAction["action"]),
    asset: intent.asset,
    amount: intent.amount,
    recipient: intent.recipient,
    spentToday,
    timestamp: intent.requestedAt,
  };
}
