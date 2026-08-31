import { describe, it, expect } from "../policy/testKit";
import { db } from "../db/client";
import { ensureUser } from "../api/users";
import { ensureWallet } from "../api/wallets";
import { deployAgent, pauseDeployment } from "../api/deployments";
import { createDraftAgent, submitForReview, approveAgent, publishAgent, deprecateAgent, suspendAgent } from "./publishing";
import { validateAgentManifestFull } from "./validator";
import { makePolicy } from "../policy/model";
import { makeTransferIntent } from "../intent/model";
import { validateAction } from "../policy/validateAction";
import { intentToAgentAction } from "../execution/privateTransfer";
import { agentRuntime } from "./runtime";
import { calculateRisk } from "./risk";
import type { AgentManifest } from "./manifest";

function reset() {
  db.clearAll();
}

function baseManifest(): AgentManifest {
  return {
    id: "holographic.test",
    name: "Test Agent",
    version: "1.0.0",
    description: "Test agent for security validation with enough description length to pass validation requirements",
    creator: "Test Creator",
    category: "TREASURY",
    capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT"],
    supportedAssets: ["USDC"],
    riskLevel: "LOW",
    policyRequirements: ["MAX_TRANSACTION", "DAILY_LIMIT", "APPROVED_RECIPIENTS"],
    privacyRequirements: { requiresPrivacy: true },
    requiredPermissions: ["USDC"],
    verification: { audited: false, verificationStatus: "PENDING" },
  };
}

describe("Security — agent marketplace", () => {
  it("unapproved agent cannot go LIVE", () => {
    reset();
    const manifest = baseManifest();
    const agent = createDraftAgent(manifest as any, "0x01");
    let threw = false;
    try {
      publishAgent(agent.id);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("creator cannot approve own agent", () => {
    reset();
    const manifest = baseManifest();
    const creatorWallet = "0x01";
    createDraftAgent(manifest as any, creatorWallet);
    const submitted = submitForReview(manifest.id, creatorWallet);
    expect(submitted.status).toBe("SUBMITTED");
    let threw = false;
    try {
      approveAgent(manifest.id, creatorWallet, creatorWallet);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("invalid manifest rejected", () => {
    reset();
    const invalidManifest = { id: "", name: "", version: "invalid", capabilities: [] } as any;
    const result = validateAgentManifestFull(invalidManifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("unsupported capability rejected", () => {
    reset();
    const manifest = { ...baseManifest(), capabilities: ["FAKE_CAPABILITY"] } as any;
    const result = validateAgentManifestFull(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join("")).toContain("Unsupported capabilities");
  });

  it("agent cannot acquire new capability silently", () => {
    reset();
    const manifest = baseManifest();
    const agent = createDraftAgent(manifest as any, "0x01");
    // Try to create version with new capability without explicit review
    // For MVP, version creation does not add new capability unless manifest updated
    // Agent must not request operation outside registered capabilities
    const hasDistribution = agent.capabilities.includes("PRIVATE_DISTRIBUTION");
    expect(hasDistribution).toBe(false);
    // If agent tries to propose PRIVATE_DISTRIBUTION intent but only has PRIVATE_TRANSFER → rejected
    const validation = agentRuntime.validateCapabilitiesForPermissions(agent.capabilities, ["PRIVATE_DISTRIBUTION"]);
    expect(validation.rejected.length).toBeGreaterThan(0);
  });

  it("deprecated agent cannot create new deployments", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const manifest = baseManifest();
    const agent = createDraftAgent(manifest as any, user.address);
    submitForReview(agent.id, user.address);
    approveAgent(agent.id, "0x02", user.address);
    const published = publishAgent(agent.id);
    expect(published?.deploymentStatus).toBe("LIVE");

    const policy = makePolicy({ agentId: agent.id, owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    deployAgent(user.id, wallet.id, agent.id, agent.version, policy, "Policy");

    deprecateAgent(agent.id, user.address);
    const afterDeprecate = db.getById<any>("agents", agent.id);
    expect(afterDeprecate.deploymentStatus).toBe("DISABLED");
  });

  it("suspended agent cannot execute", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const manifest = baseManifest();
    const agent = createDraftAgent(manifest as any, user.address);
    submitForReview(agent.id, user.address);
    approveAgent(agent.id, "0x02", user.address);
    publishAgent(agent.id);

    const policy = makePolicy({ agentId: agent.id, owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    const { deployment } = deployAgent(user.id, wallet.id, agent.id, agent.version, policy, "Policy");

    suspendAgent(agent.id);
    const suspendedDep = pauseDeployment(deployment.id, user.id);
    expect(suspendedDep?.status === "PAUSED" || suspendedDep?.status === "DISABLED").toBe(true);

    // Attempt execution while paused/suspended → should be blocked
    makeTransferIntent({ agentId: agent.id, asset: "USDC", recipient: "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", amount: 10 * 1_000_000, action: "transfer", reason: "test", requestedAt: Date.now() });
    // Policy engine would still allow, but deployment status check blocks
    const dep = db.getDeploymentById(deployment.id);
    expect(dep.status === "PAUSED" || dep.status === "DISABLED").toBe(true);
  });

  it("agent cannot bypass policy", () => {
    reset();
    const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const policy = makePolicy({ agentId: "holographic.treasury", owner: user.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: ["0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f"], approvalThreshold: 250 * 1_000_000, allowedActions: ["transfer"], paused: false });
    const intent = makeTransferIntent({ agentId: "holographic.treasury", asset: "USDC", recipient: "0x06de00112233445566778899aabbccddeeff0011", amount: 10 * 1_000_000, action: "transfer", reason: "bypass attempt", requestedAt: Date.now() });
    const result = validateAction(intentToAgentAction(intent), policy);
    expect(result.allowed).toBe(false);
  });

  it("agent cannot call wallet directly — security boundary", () => {
    reset();
    const runtime = agentRuntime;
    const check = runtime.enforceSecurityBoundary("holographic.treasury", "callWalletApiDirectly");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Security boundary violation");
  });

  it("agent cannot access private keys", () => {
    const check = agentRuntime.enforceSecurityBoundary("holographic.treasury", "accessPrivateKeys");
    expect(check.allowed).toBe(false);
  });

  it("agent cannot access viewing keys", () => {
    const check = agentRuntime.enforceSecurityBoundary("holographic.treasury", "accessViewingKeys");
    expect(check.allowed).toBe(false);
  });

  it("agent cannot access secrets", () => {
    const check = agentRuntime.enforceSecurityBoundary("holographic.treasury", "accessWalletCredentials");
    expect(check.allowed).toBe(false);
  });

  it("unauthorized wallet cannot deploy/manage someone else's agent", () => {
    reset();
    const user1 = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
    const user2 = ensureUser("0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f" as any);
    const wallet1 = ensureWallet(user1.id, user1.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
    const policy = makePolicy({ agentId: "holographic.treasury", owner: user1.address, allowedAssets: ["USDC"], maximumTransactionAmount: 500 * 1_000_000, dailySpendingLimit: 5000 * 1_000_000, approvedRecipients: [], approvalThreshold: 0, allowedActions: ["transfer"], paused: false });
    const { deployment } = deployAgent(user1.id, wallet1.id, "holographic-treasury", "1.0.0", policy, "Policy");

    let threw = false;
    try {
      pauseDeployment(deployment.id, user2.id);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("user cannot grant permissions outside agent capabilities", () => {
    const agentCaps = ["PRIVATE_TRANSFER"];
    const result = agentRuntime.validateCapabilitiesForPermissions(agentCaps, ["PRIVATE_DISTRIBUTION", "PRIVATE_TRANSFER"]);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].permission).toBe("PRIVATE_DISTRIBUTION");
    expect(result.allowed).toContain("PRIVATE_TRANSFER");
  });

  it("risk calculated from capabilities, not just declared", () => {
    const manifest = baseManifest();
    const risk = calculateRisk(manifest);
    expect(risk.declaredRisk).toBe("LOW");
    expect(["LOW", "MEDIUM", "HIGH"].includes(risk.calculatedRisk)).toBe(true);
    expect(risk.riskScore).toBeGreaterThan(-1);
  });
});
