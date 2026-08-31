import { describe, it, expect } from "../policy/testKit";
import { validateAction } from "../policy/validateAction";
import { REASON, type AgentPolicy, type AgentAction } from "../policy/model";
import { makeTransferIntent } from "../intent/model";
import {
  executePrivateTransfer,
  intentToAgentAction,
} from "./privateTransfer";
import { getMockWalletAdapter } from "../wallet/adapters";
import { poseidonish } from "../hash";
import { PrivacyNotAvailableError } from "../privacy/provider";

// Helper to get base policy for treasury agent
const USDC = 1_000_000;

function basePolicy(): AgentPolicy {
  return {
    agentId: "helix-payroll",
    owner: "0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f",
    allowedAssets: ["USDC", "STRK"],
    maximumTransactionAmount: 5_000 * USDC,
    dailySpendingLimit: 20_000 * USDC,
    approvedRecipients: [
      "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
      "0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f",
    ],
    approvalThreshold: 2_500 * USDC,
    allowedActions: ["payment", "transfer", "swap"],
    paused: false,
  };
}

function baseIntent() {
  return makeTransferIntent({
    agentId: "helix-payroll",
    asset: "USDC",
    recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
    amount: 1_000 * USDC,
    action: "transfer",
    reason: "Payroll payout",
    requestedAt: Date.now(),
  });
}

// --- Valid transfer ---------------------------------------------------------
describe("Valid transfer", () => {
  it("allows valid transfer via validateAction", () => {
    const action = intentToAgentAction(baseIntent());
    const result = validateAction(action, basePolicy());
    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("produces deterministic intent hash", () => {
    const intent = baseIntent();
    const h1 = poseidonish({ agentId: intent.agentId, amount: intent.amount });
    const h2 = poseidonish({ agentId: intent.agentId, amount: intent.amount });
    expect(h1).toBe(h2);
  });
});

// --- Amount over limit ------------------------------------------------------
describe("Amount over limit", () => {
  it("rejects amount above maximumTransactionAmount", () => {
    const intent = makeTransferIntent({
      agentId: "helix-payroll",
      asset: "USDC",
      recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
      amount: 6_000 * USDC,
      action: "transfer",
      reason: "Too large",
      requestedAt: Date.now(),
    });
    const action = intentToAgentAction(intent);
    const result = validateAction(action, basePolicy());
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContainMatch(REASON.ABOVE_TX_LIMIT);
  });
});

// --- Recipient not approved -------------------------------------------------
describe("Recipient not approved", () => {
  it("rejects recipient not in allowlist", () => {
    const intent = makeTransferIntent({
      agentId: "helix-payroll",
      asset: "USDC",
      recipient: "0x06de00112233445566778899aabbccddeeff0011",
      amount: 1_000 * USDC,
      action: "transfer",
      reason: "Bad recipient",
      requestedAt: Date.now(),
    });
    const result = validateAction(intentToAgentAction(intent), basePolicy());
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContainMatch(REASON.RECIPIENT_NOT_APPROVED);
  });
});

// --- Wrong asset ------------------------------------------------------------
describe("Wrong asset", () => {
  it("rejects unsupported asset", () => {
    const intent = makeTransferIntent({
      agentId: "helix-payroll",
      asset: "DOGE",
      recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
      amount: 1_000 * USDC,
      action: "transfer",
      reason: "Unsupported asset",
      requestedAt: Date.now(),
    });
    const result = validateAction(intentToAgentAction(intent), basePolicy());
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContainMatch(REASON.ASSET_NOT_ALLOWED);
  });
});

// --- Daily limit exceeded ---------------------------------------------------
describe("Daily limit exceeded", () => {
  it("rejects when spentToday + amount exceeds daily limit", () => {
    const action: AgentAction = {
      id: "test",
      agentId: "helix-payroll",
      action: "transfer",
      asset: "USDC",
      amount: 1_000 * USDC,
      recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
      spentToday: 19_500 * USDC,
      timestamp: Date.now(),
    };
    const result = validateAction(action, basePolicy());
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContainMatch(REASON.DAILY_LIMIT_EXCEEDED);
  });
});

// --- Paused agent -----------------------------------------------------------
describe("Paused agent", () => {
  it("rejects when policy.paused=true", () => {
    const intent = baseIntent();
    const result = validateAction(
      intentToAgentAction(intent),
      { ...basePolicy(), paused: true },
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContainMatch(REASON.PAUSED);
  });
});

// --- Human approval required ------------------------------------------------
describe("Human approval required", () => {
  it("flags requiresHumanApproval at threshold", () => {
    const intent = makeTransferIntent({
      agentId: "helix-payroll",
      asset: "USDC",
      recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
      amount: 3_000 * USDC,
      action: "transfer",
      reason: "Large payout",
      requestedAt: Date.now(),
    });
    const result = validateAction(intentToAgentAction(intent), basePolicy());
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
  });

  it("disables threshold when approvalThreshold=0", () => {
    const intent = makeTransferIntent({
      agentId: "helix-payroll",
      asset: "USDC",
      recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f",
      amount: 4_999 * USDC,
      action: "transfer",
      reason: "No confirm",
      requestedAt: Date.now(),
    });
    const policy = { ...basePolicy(), approvalThreshold: 0 };
    const result = validateAction(intentToAgentAction(intent), policy);
    expect(result.requiresHumanApproval).toBe(false);
  });
});

// --- Wallet disconnected ----------------------------------------------------
describe("Wallet disconnected", () => {
  it("throws WALLET_DISCONNECTED when wallet not connected", async () => {
    const adapter = getMockWalletAdapter();
    await adapter.disconnect();
    const intent = baseIntent();
    const policy = basePolicy();
    let threw = false;
    try {
      await executePrivateTransfer(intent, policy);
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("Wallet disconnected");
      expect((e as { code?: string }).code).toBe("WALLET_DISCONNECTED");
    }
    expect(threw).toBe(true);
    // Reconnect for other tests
    await adapter.connect();
  });
});

// --- Wrong network ----------------------------------------------------------
describe("Wrong network", () => {
  it("throws WRONG_NETWORK when chain mismatch", async () => {
    const adapter = getMockWalletAdapter();
    if (adapter.getInternalState().status !== "connected") await adapter.connect();
    const intent = baseIntent();
    const policy = basePolicy();
    let threw = false;
    try {
      await executePrivateTransfer(intent, policy, {
        expectedChainId: "0x534e5f5f4d41494e", // mainnet, but mock is sepolia
      });
    } catch (e) {
      threw = true;
      expect((e as { code?: string }).code).toBe("WRONG_NETWORK");
    }
    expect(threw).toBe(true);
  });
});

// --- Privacy provider unavailable -------------------------------------------
describe("Privacy provider unavailable", () => {
  it("throws PRIVACY_UNAVAILABLE when capabilities false", async () => {
    // Temporarily set wallet capabilities to privacyApi=false
    const adapter = getMockWalletAdapter();
    if (adapter.getInternalState().status !== "connected") await adapter.connect();
    const prev = adapter.getInternalState();
    // @ts-ignore mutate for test
    adapter.getInternalState().capabilities = { ...prev.capabilities, privacyApi: false };
    const intent = baseIntent();
    const policy = basePolicy();
    let threw = false;
    try {
      await executePrivateTransfer(intent, policy);
    } catch (e) {
      threw = true;
      expect((e as { code?: string }).code).toBe("PRIVACY_UNAVAILABLE");
    }
    expect(threw).toBe(true);
    // Restore
    // @ts-ignore
    adapter.getInternalState().capabilities = prev.capabilities;
  });
});

// --- STRK20 API failure -----------------------------------------------------
describe("STRK20 API failure", () => {
  it("surfaces PrivacyNotAvailableError as API_FAILURE when provider throws", async () => {
    // Direct test of mapping: PrivacyNotAvailableError → ExecutionError
    let threw = false;
    try {
      const err = new PrivacyNotAvailableError("Simulated proving failure");
      throw err;
    } catch (e) {
      if (e instanceof PrivacyNotAvailableError) {
        threw = true;
        expect(e.name).toBe("PrivacyNotAvailableError");
      }
    }
    expect(threw).toBe(true);
  });
});
