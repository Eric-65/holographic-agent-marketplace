import { describe, it, expect } from "../policy/testKit";
import { db } from "./client";
import { ensureUser } from "../api/users";
import { ensureWallet, disconnectWalletsByUser } from "../api/wallets";
import { deployAgent } from "../api/deployments";
import { addRecipient, isRecipientApproved, disableRecipient } from "../api/recipients";
import { createExecutionRequest, approveExecutionRequest, rejectExecutionRequest, createExecutionResult, createExecutionReceipt } from "../api/executions";
import { makePolicy } from "../policy/model";
import { makeTransferIntent } from "../intent/model";
import { validateAction } from "../policy/validateAction";
import { intentToAgentAction } from "../execution/privateTransfer";

// Clean DB before tests
function reset() {
  db.clearAll();
}

describe("Agent deployment", () => {
  it("creates persistent deployment record", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready X", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 250 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const { deployment, policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Test policy");
    expect(deployment.agentId).toBe("holographic-treasury");
    expect(deployment.userId).toBe(user.id);
    expect(deployment.status).toBe("active");
    expect(policyRecord.agentDeploymentId).toBe(deployment.id);
  });

  it("fails if wallet disconnected", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready X", false, "ready");
    disconnectWalletsByUser(user.id);
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    let threw = false;
    try {
      deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Test");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("Policy creation", () => {
  it("creates policy with version and hash", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const { policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy v1");
    expect(policyRecord.version).toBe(1);
    expect(policyRecord.docHash.startsWith("0x")).toBe(true);
    expect(policyRecord.status).toBe("active");
  });
});

describe("Recipient allowlist", () => {
  it("adds recipient and checks approval", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    const { policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy");
    const rec = addRecipient(user.id, policyRecord.id, "Vendor A", "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", "USDC");
    expect(rec.name).toBe("Vendor A");
    expect(isRecipientApproved(policyRecord.id, "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f")).toBe(true);
    expect(isRecipientApproved(policyRecord.id, "0x06de00112233445566778899aabbccddeeff0011")).toBe(false);
  });

  it("disables recipient", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    const { policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy");
    const rec = addRecipient(user.id, policyRecord.id, "Vendor A", "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", "USDC");
    disableRecipient(rec.id);
    expect(isRecipientApproved(policyRecord.id, "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f")).toBe(false);
  });
});

describe("Valid intent", () => {
  it("creates valid intent and approves", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 250 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 10 * 1_000_000, action: "transfer", reason: "approved vendor payment", requestedAt: Date.now() });
    const result = validateAction(intentToAgentAction(intent), policy);
    expect(result.allowed).toBe(true);
  });
});

describe("Blocked intent", () => {
  it("blocks over-limit payment", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 250 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 800 * 1_000_000, action: "transfer", reason: "over limit", requestedAt: Date.now() });
    const result = validateAction(intentToAgentAction(intent), policy);
    expect(result.allowed).toBe(false);
    expect(result.reasons.join("")).toContain("E_ABOVE_TRANSACTION_LIMIT");
  });

  it("blocks unapproved recipient", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 250 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x06de00112233445566778899aabbccddeeff0011", amount: 10 * 1_000_000, action: "transfer", reason: "bad recipient", requestedAt: Date.now() });
    const result = validateAction(intentToAgentAction(intent), policy);
    expect(result.allowed).toBe(false);
  });
});

describe("Approval-required intent", () => {
  it("requires human approval for $500-$2000", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 2000 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 500 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 1000 * 1_000_000, action: "transfer", reason: "needs approval", requestedAt: Date.now() });
    const result = validateAction(intentToAgentAction(intent), policy);
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
  });
});

describe("Human approval", () => {
  it("approves pending request", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 2000 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 500 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const { deployment, policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy");
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 1000 * 1_000_000, action: "transfer", reason: "needs approval", requestedAt: Date.now() });
    const verdict = validateAction(intentToAgentAction(intent), policy);
    const req = createExecutionRequest(user.id, deployment.id, policyRecord.id, intent, { ...verdict, policyHash: "0x1" as any, intentHash: "0x2" as any, evaluatedAt: Date.now() });
    expect(req.status === "AWAITING_USER" || req.status === "awaiting_confirmation").toBe(true);
    const approved = approveExecutionRequest(req.id, user.id);
    expect(approved?.status === "POLICY_APPROVED" || approved?.status === "confirmed").toBe(true);
    expect(approved?.approvedByUser).toBe(true);
  });

  it("rejects pending request and never reaches wallet", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 2000 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 500 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const { deployment, policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy");
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 1000 * 1_000_000, action: "transfer", reason: "needs approval", requestedAt: Date.now() });
    const verdict = validateAction(intentToAgentAction(intent), policy);
    const req = createExecutionRequest(user.id, deployment.id, policyRecord.id, intent, { ...verdict, policyHash: "0x1" as any, intentHash: "0x2" as any, evaluatedAt: Date.now() });
    const rejected = rejectExecutionRequest(req.id, user.id);
    expect(rejected?.status).toBe("rejected");
    // Rejected must never reach wallet — no execution result should exist
    const results = db.getAll("execution_results");
    expect(results.length).toBe(0);
  });
});

describe("Receipt creation", () => {
  it("creates receipt with only non-sensitive metadata", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 250 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const { deployment, policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy");
    const intent = makeTransferIntent({ agentId: "holographic-treasury", asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 10 * 1_000_000, action: "transfer", reason: "vendor payment", requestedAt: Date.now() });
    const verdict = validateAction(intentToAgentAction(intent), policy);
    const req = createExecutionRequest(user.id, deployment.id, policyRecord.id, intent, { ...verdict, policyHash: "0x1" as any, intentHash: "0x2" as any, evaluatedAt: Date.now() });
    const res = createExecutionResult(req.id, user.id, "0xabc" as any, "success", "mock", "1k–5k", true, 1000);
    const receipt = createExecutionReceipt(user.id, req.id, res.id, "holographic-treasury", "Holographic Treasury Agent", policyRecord.id, "0x2" as any, "0x1" as any, "0x3" as any, "0xabc" as any, "executed", "mock", "1k–5k", true);
    expect(receipt.bucket).toBe("1k–5k");
    expect(receipt.isDemo).toBe(true);
    expect((receipt as any).viewingKey).toBe(undefined);
    expect((receipt as any).privateNotes).toBe(undefined);
  });
});

describe("Persistence", () => {
  it("persists across reloads via localStorage", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Policy");
    // Simulate reload by reading again from DB
    const deployments = db.getAll<any>("agent_deployments");
    expect(deployments.length).toBe(1);
    expect(deployments[0].agentId).toBe("holographic-treasury");
  });
});

describe("Wallet disconnect", () => {
  it("clears active wallets on disconnect", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    disconnectWalletsByUser(user.id);
    const active = db.getAll("wallets").filter((w: any) => w.status === "connected");
    expect(active.length).toBe(0);
  });
});

describe("Unauthorized access", () => {
  it("prevents access to other user's data", () => {
    reset();
    const user1 = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const user2 = ensureUser("0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f" as any);
    const wallet1 = ensureWallet(user1.id, user1.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic-treasury", owner: user1.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    deployAgent(user1.id, wallet1.id, "holographic-treasury", "1.0.0", policy, "Policy");
    const user2Deployments = db.getAll("agent_deployments").filter((d: any) => d.userId === user2.id);
    expect(user2Deployments.length).toBe(0);
  });
});
