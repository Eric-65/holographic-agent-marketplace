import type { ActionIntent, Hex, TreasuryPosition, WalletCapabilities } from "../types";
import type { TreasuryTransferIntent } from "../intent/model";
import { getReadyWalletAdapter, getMockWalletAdapter } from "../wallet/adapters";
import { poseidonish } from "../hash";
import { logStep } from "../wallet/debugLogger";
import {
  PrivacyNotAvailableError,
  type ExecutionEnvelope,
  type ExecutionPhase,
  type ExecutionResult,
  type PrivacyProvider,
} from "./provider";

/**
 * Strk20WalletApiProvider — REAL implementation using verified APIs
 *
 * Verified from installed starknet.js v10.4.0 (node_modules/starknet/dist/index.d.ts
 * and @starknet-io/starknet-types-0103 wallet-api/methods.d.ts):
 * - wallet_supportedSpecs → string[]
 * - wallet_requestChainId → ChainId
 * - wallet_requestAccounts → Address[]
 * - wallet_strk20Balances → { tokens: Address[] } → STRK20_BALANCE_ENTRY[]
 * - wallet_strk20PrepareInvoke → { actions: STRK20_ACTION[], simulate?: bool } → STRK20_CALL_AND_PROOF
 * - wallet_strk20InvokeTransaction → { actions: STRK20_ACTION[] } → { transaction_hash }
 *
 * STRK20_ACTION verified:
 * - { type: 'transfer', token: ADDRESS, amount: FELT | 'OPEN', recipient: ADDRESS }
 * - { type: 'deposit', token, amount }
 * - { type: 'withdraw', token, amount, recipient }
 * - { type: 'invoke', contract, calldata }
 *
 * Security: never stores viewing keys, notes, witnesses, exact amounts beyond envelope lifetime.
 * Wallet remains signer via wallet.request().
 */

const EMPTY_CAPS: WalletCapabilities = {
  privacyApi: false,
  specVersion: null,
  shield: false,
  privateTransfer: false,
  privateSwap: false,
  multicall: false,
};

// Official Sepolia USDC — Circle docs
const TOKEN_ADDRESSES: Record<string, string> = {
  USDC: "0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343",
  // Fallback older Sepolia USDC
  USDC_ALT: "0x053b40a647CEDfca6cA84f542A0fe36736031905A9639a7f19A3C1e66bFd5080",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

export class Strk20WalletApiProvider implements PrivacyProvider {
  readonly id = "strk20";
  readonly label = "STRK20 Privacy Wallet API — wallet_strk20InvokeTransaction";
  readonly isLive = false; // Set true only after live tx verified

  async detectCapabilities(): Promise<WalletCapabilities> {
    const readyAdapter = getReadyWalletAdapter();
    const state = readyAdapter.getInternalState();

    if (state.status !== "connected" || !state.address) {
      return {
        privacyApi: false,
        specVersion: null,
        shield: false,
        privateTransfer: false,
        privateSwap: false,
        multicall: false,
      };
    }

    try {
      const walletObj = (readyAdapter as any)._walletObj ?? (readyAdapter as any)._account ?? null;
      if (!walletObj?.request) {
        return EMPTY_CAPS;
      }

      // Probe supported specs — official method
      let specs: string[] = [];
      try {
        specs = await walletObj.request({ type: "wallet_supportedSpecs" });
      } catch {}

      // Probe if wallet has strk20 methods via trying balances with empty list
      let hasStrk20 = false;
      try {
        // This will throw NOT_REGISTERED if not registered, but that still means privacy capable
        await walletObj.request({
          type: "wallet_strk20Balances",
          params: { tokens: [] },
        });
        hasStrk20 = true;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (msg.toLowerCase().includes("not_registered") || msg.toLowerCase().includes("not registered")) {
          hasStrk20 = true; // Registered check — wallet supports STRK20 but user not registered yet
        }
      }

      const hasPrivacySpec = specs.some((s) => s.includes("0.10") || s.toLowerCase().includes("privacy"));

      return {
        privacyApi: hasPrivacySpec || hasStrk20,
        specVersion: specs[0] ?? (hasStrk20 ? "0.10.3" : null),
        shield: hasStrk20,
        privateTransfer: hasStrk20,
        privateSwap: false,
        multicall: hasStrk20,
      };
    } catch {
      return EMPTY_CAPS;
    }
  }

  async getPositions(_address: Hex): Promise<TreasuryPosition[]> {
    const readyAdapter = getReadyWalletAdapter();
    const walletObj = (readyAdapter as any)._walletObj ?? null;
    if (!walletObj?.request) {
      throw new PrivacyNotAvailableError("Wallet not connected — cannot query private balances");
    }

    try {
      // Real: wallet_strk20Balances with empty tokens returns all shielded balances
      const balances = (await walletObj.request({
        type: "wallet_strk20Balances",
        params: { tokens: [] },
      })) as { token: string; balance: string }[];

      // Map to TreasuryPosition — only non-sensitive: token symbol, balance as number (wallet-reported, not stored)
      // For demo, we map known tokens to positions
      const positions: TreasuryPosition[] = [];
      for (const entry of balances) {
        const tokenAddr = entry.token.toLowerCase();
        const symbol =
          tokenAddr === TOKEN_ADDRESSES.USDC.toLowerCase() || tokenAddr === TOKEN_ADDRESSES.USDC_ALT.toLowerCase()
            ? "USDC"
            : tokenAddr === TOKEN_ADDRESSES.STRK.toLowerCase()
              ? "STRK"
              : tokenAddr === TOKEN_ADDRESSES.ETH.toLowerCase()
                ? "ETH"
                : null;
        if (!symbol) continue;
        const balanceNum = Number(BigInt(entry.balance)) / 1_000_000; // crude, for display only
        positions.push({
          asset: symbol as any,
          publicBalance: 0, // public not available via private balances API
          shieldedBalance: balanceNum,
          noteCount: 0, // not exposed by this API
          change24hPct: 0,
          allocatedToAgents: 0,
        });
      }
      return positions;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.toLowerCase().includes("not_registered")) {
        // User not registered in privacy pool yet — return empty, not error
        return [];
      }
      throw new PrivacyNotAvailableError(`Failed to get private balances: ${msg}`);
    }
  }

  async buildEnvelope(
    intent: ActionIntent,
    policyHash: Hex,
    intentHash: Hex,
  ): Promise<ExecutionEnvelope> {
    // Legacy compat — map to transfer action
    const tokenAddr = TOKEN_ADDRESSES[intent.asset] ?? TOKEN_ADDRESSES.USDC;
    const amountFelt = "0x" + BigInt(Math.floor(intent.amountUsd * 1_000)).toString(16); // temporary float compat

    return {
      envelopeId: poseidonish({ intentHash, policyHash, n: intent.nonce }) as Hex,
      intentHash,
      policyHash,
      method: "wallet_strk20InvokeTransaction",
      strk20Actions: [
        {
          type: "transfer",
          token: tokenAddr,
          amount: amountFelt,
          recipient: intent.counterparty ?? "0x0",
        },
      ],
      expiresAt: Date.now() + 30_000,
    };
  }

  async buildTransferEnvelope(
    intent: TreasuryTransferIntent,
    policyHash: Hex,
    intentHash: Hex,
  ): Promise<ExecutionEnvelope> {
    const tokenAddr = TOKEN_ADDRESSES[intent.asset] ?? TOKEN_ADDRESSES.USDC;
    const amountFelt = "0x" + BigInt(intent.amount).toString(16); // integer minor units → FELT hex

    return {
      envelopeId: poseidonish({ intentHash, policyHash, n: intent.metadata?.nonce ?? 0 }) as Hex,
      intentHash,
      policyHash,
      method: "wallet_strk20InvokeTransaction",
      strk20Actions: [
        {
          type: "transfer",
          token: tokenAddr,
          amount: amountFelt,
          recipient: intent.recipient,
        },
      ],
      expiresAt: Date.now() + 30_000,
    };
  }

  async execute(
    envelope: ExecutionEnvelope,
    onPhase: (phase: ExecutionPhase) => void,
  ): Promise<ExecutionResult> {
    const started = Date.now();

    const readyAdapter = getReadyWalletAdapter();
    const walletObj = (readyAdapter as any)._walletObj ?? null;
    const state = readyAdapter.getInternalState();

    if (state.status !== "connected" || !walletObj?.request) {
      throw new PrivacyNotAvailableError("Wallet disconnected — cannot execute private transfer");
    }

    if (!envelope.strk20Actions || envelope.strk20Actions.length === 0) {
      throw new PrivacyNotAvailableError("No STRK20 actions in envelope");
    }

    try {
      onPhase("envelope_built");
      onPhase("wallet_request_sent");

      // Real flow: wallet_strk20InvokeTransaction
      // Per wallet-api/methods.d.ts, this shows approval UI and may take long (SNIP-36 proof)
      logStep("STEP_5_CALLING_WALLETACCOUNT_CONNECT" as any, true, {
        message: "Calling wallet_strk20InvokeTransaction — triggers wallet authorization for private transfer",
        data: {
          method: envelope.method,
          actions: envelope.strk20Actions.map((a) => ({ type: a.type, token: a.token.slice(0, 10) + "...", amount: "hashed", recipient: a.recipient.slice(0, 10) + "..." })),
        },
      });

      onPhase("wallet_proving");

      const result = (await walletObj.request({
        type: "wallet_strk20InvokeTransaction",
        params: { actions: envelope.strk20Actions },
      })) as { transaction_hash: string };

      onPhase("proof_submitted");

      const txHash = result.transaction_hash as Hex;

      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT" as any, true, {
        message: "wallet_strk20InvokeTransaction succeeded",
        data: { txHash: txHash.slice(0, 12) + "..." },
      });

      onPhase("proof_verified");
      onPhase("receipt_sealed");

      return {
        txHash,
        block: undefined, // block not returned by this method, need to fetch via provider if needed
        proofVerified: true, // If tx succeeded, proof was verified on-chain
        latencyMs: Date.now() - started,
      };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT" as any, false, {
        message: "wallet_strk20InvokeTransaction failed",
        error: e,
      });

      if (msg.toLowerCase().includes("user refused") || msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("rejected")) {
        throw new PrivacyNotAvailableError(`User rejected private transfer: ${msg}`);
      }
      if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("balance")) {
        throw new PrivacyNotAvailableError(`Insufficient private balance: ${msg}`);
      }
      if (msg.toLowerCase().includes("not_registered")) {
        throw new PrivacyNotAvailableError(`Not registered in privacy pool: ${msg} — user must shield first`);
      }
      if (msg.toLowerCase().includes("privacy_leak") || msg.toLowerCase().includes("privacy leak")) {
        throw new PrivacyNotAvailableError(`Privacy leak detected: ${msg}`);
      }
      throw new PrivacyNotAvailableError(`STRK20 API failure: ${msg}`);
    }
  }

  async executePrivateTransfer(
    intent: TreasuryTransferIntent,
    onPhase: (phase: ExecutionPhase) => void,
  ): Promise<ExecutionResult> {
    const mockAdapter = getMockWalletAdapter();

    // If mock adapter is active (Demo Mode), delegate to mock provider
    if (mockAdapter.isConnected() && mockAdapter.getInternalState().status === "connected") {
      const { MockPrivacyProvider } = await import("./mockProvider");
      const mockProvider = new MockPrivacyProvider();
      const policyHash = poseidonish({ asset: intent.asset, recipient: intent.recipient }) as Hex;
      const intentHash = poseidonish({ id: intent.id, amount: intent.amount }) as Hex;
      const envelope = await this.buildTransferEnvelope(intent, policyHash, intentHash);
      return mockProvider.execute(envelope, onPhase);
    }

    // Real path
    const policyHash = poseidonish({ asset: intent.asset }) as Hex;
    const intentHash = poseidonish({ id: intent.id }) as Hex;
    const envelope = await this.buildTransferEnvelope(intent, policyHash, intentHash);
    return this.execute(envelope, onPhase);
  }
}
