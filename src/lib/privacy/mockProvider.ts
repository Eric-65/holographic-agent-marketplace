import type { ActionIntent, Hex, TreasuryPosition, WalletCapabilities } from "../types";
import { MOCK_POSITIONS } from "../mock/treasury";
import { poseidonish } from "../hash";
import type {
  ExecutionEnvelope,
  ExecutionPhase,
  ExecutionResult,
  PrivacyProvider,
} from "./provider";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock privacy layer. Simulates the shape and timing of the STRK20 Privacy
 * Wallet API without any cryptography. Deliberately mirrors the real phase
 * sequence so the UI does not change when the real provider is swapped in.
 */
export class MockPrivacyProvider implements PrivacyProvider {
  readonly id = "mock";
  readonly label = "Mock privacy layer";
  readonly isLive = false;

  async detectCapabilities(): Promise<WalletCapabilities> {
    await sleep(240);
    return {
      privacyApi: true,
      specVersion: "0.10.3 (simulated)",
      shield: true,
      privateTransfer: true,
      privateSwap: true,
      multicall: true,
    };
  }

  async getPositions(_address: Hex): Promise<TreasuryPosition[]> {
    await sleep(180);
    return MOCK_POSITIONS;
  }

  async buildEnvelope(
    intent: ActionIntent,
    policyHash: Hex,
    intentHash: Hex,
  ): Promise<ExecutionEnvelope> {
    const method =
      intent.kind === "private_swap"
        ? "wallet_privateSwap"
        : intent.kind === "private_transfer"
          ? "wallet_privateTransfer"
          : intent.kind === "unshield"
            ? "wallet_unshield"
            : intent.kind === "shield" || intent.kind === "reshield"
              ? "wallet_shield"
              : "wallet_privateMulticall";

    return {
      envelopeId: poseidonish({ intentHash, policyHash, n: intent.nonce }),
      intentHash,
      policyHash,
      method,
      expiresAt: Date.now() + 30_000,
    };
  }

  async execute(
    envelope: ExecutionEnvelope,
    onPhase: (phase: ExecutionPhase) => void,
  ): Promise<ExecutionResult> {
    const started = Date.now();
    const phases: [ExecutionPhase, number][] = [
      ["envelope_built", 220],
      ["wallet_request_sent", 380],
      ["wallet_proving", 900],
      ["proof_submitted", 420],
      ["proof_verified", 560],
      ["receipt_sealed", 260],
    ];
    for (const [phase, delay] of phases) {
      await sleep(delay);
      onPhase(phase);
    }
    return {
      txHash: poseidonish({ e: envelope.envelopeId, t: "tx" }),
      block: 1_284_400 + Math.floor(Math.random() * 900),
      proofVerified: true,
      latencyMs: Date.now() - started,
    };
  }
}
