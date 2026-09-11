/**
 * Functional evaluation suite for the AI agent layer, run against the
 * default, always-available MockAIProvider — no network calls, no API key
 * required. Mirrors the style of src/lib/treasury/automation.test.ts: real
 * localStorage-backed db, real api layer, no mocks of Holographic's own
 * code — only the LLM call itself is deterministic-by-construction.
 */
import { describe, it, expect } from "../policy/testKit";
import { db } from "../db/client";
import { ensureUser } from "../api/users";
import { ensureWallet } from "../api/wallets";
import { deployAgent } from "../api/deployments";
import { addRecipient } from "../api/recipients";
import { seedAgents } from "../api/agents";
import { makePolicy } from "../policy/model";
import { interpretMessage, previewIntent, useMockAIProvider } from "./index";
import { requestExecution } from "./requestExecution";
import { validateAIIntent } from "./schema";
import { parseAmount } from "./parseAmount";
import { parseSchedule, parseDate } from "./parseSchedule";

const USDC = 1_000_000;
const ACME = "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f";

function reset() {
  db.clearAll();
  seedAgents();
}

function setup() {
  const user = ensureUser(`0x${Math.random().toString(16).slice(2).padEnd(40, "0")}` as any);
  const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
  const policy = makePolicy({
    agentId: "holographic-treasury",
    owner: user.address,
    allowedAssets: ["USDC"],
    maximumTransactionAmount: 500 * USDC,
    dailySpendingLimit: 5000 * USDC,
    approvedRecipients: [ACME],
    approvalThreshold: 200 * USDC,
    allowedActions: ["transfer"],
    paused: false,
  });
  const { deployment, policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Test policy");
  addRecipient(user.id, policyRecord.id, "Acme", ACME, "USDC");
  useMockAIProvider();
  return { user, deployment, policyRecord };
}

describe("parseAmount", () => {
  it("parses a plain numeric amount with an asset suffix", () => {
    const r = parseAmount("10 USDC");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amountMinor).toBe(10_000_000);
      expect(r.asset).toBe("USDC");
    }
  });

  it("parses a dollar-sign amount as USDC", () => {
    const r = parseAmount("$25.50");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountMinor).toBe(25_500_000);
  });

  it("parses spelled-out numbers", () => {
    const r = parseAmount("ten USDC");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountMinor).toBe(10_000_000);
  });

  it("rejects an amount with no recognizable asset", () => {
    const r = parseAmount("10");
    expect(r.ok).toBe(false);
  });

  it("rejects more decimal precision than the asset supports rather than truncating", () => {
    const r = parseAmount("1.1234567 USDC");
    expect(r.ok).toBe(false);
  });
});

describe("parseSchedule / parseDate", () => {
  it("resolves 'tomorrow' relative to the injected clock", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const r = parseDate("tomorrow", now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso.slice(0, 10)).toBe("2026-01-16");
  });

  it("resolves 'monthly starting tomorrow' into a MONTHLY schedule", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const r = parseSchedule("monthly starting tomorrow", now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.schedule.frequency).toBe("MONTHLY");
  });

  it("rejects schedule text with no recognizable frequency", () => {
    const r = parseSchedule("starting tomorrow");
    expect(r.ok).toBe(false);
  });
});

describe("validateAIIntent — structural gate", () => {
  it("accepts a well-formed PRIVATE_TRANSFER", () => {
    const r = validateAIIntent({ action: "PRIVATE_TRANSFER", recipientReference: "Acme", amountText: "10 USDC" });
    expect(r.valid).toBe(true);
  });

  it("rejects an unknown action outright", () => {
    const r = validateAIIntent({ action: "DRAIN_TREASURY" });
    expect(r.valid).toBe(false);
  });

  it("rejects a SCHEDULE_PAYMENT with no schedule", () => {
    const r = validateAIIntent({ action: "SCHEDULE_PAYMENT" });
    expect(r.valid).toBe(false);
  });
});

describe("MockAIProvider interpretation", () => {
  it("interprets a clear payment request as a CLEAR PRIVATE_TRANSFER", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 10 USDC to Acme for the March retainer");
    expect(result.intent.status).toBe("VALIDATED");
    const structured = result.intent.structuredIntent as any;
    expect(structured.action).toBe("PRIVATE_TRANSFER");
    expect(structured.clarity).toBe("CLEAR");
  });

  it("asks for clarification instead of guessing when the amount is missing", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay Acme for the March retainer");
    const structured = result.intent.structuredIntent as any;
    expect(structured.clarity).toBe("AMBIGUOUS");
    expect(structured.missingFields).toContain("amount");
  });

  it("asks for clarification instead of guessing when the recipient is missing", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 10 USDC for the March retainer");
    const structured = result.intent.structuredIntent as any;
    expect(structured.clarity).toBe("AMBIGUOUS");
    expect(structured.missingFields).toContain("recipient");
  });

  it("classifies an unrecognized message as UNSUPPORTED rather than guessing an action", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "What's the weather like today?");
    const structured = result.intent.structuredIntent as any;
    expect(structured.action).toBe("UNSUPPORTED");
  });
});

describe("previewIntent — read-only resolution", () => {
  it("resolves a known recipient name and marks the intent ready to execute", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 10 USDC to Acme for consulting");
    const preview = previewIntent(user.id, result.intent.id);
    expect(preview?.recipient?.status).toBe("RESOLVED");
    expect(preview?.readyToExecute).toBe(true);
  });

  it("flags an unknown recipient name as NOT_FOUND rather than inventing an address", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 10 USDC to Globex for consulting");
    const preview = previewIntent(user.id, result.intent.id);
    expect(preview?.recipient?.status).toBe("NOT_FOUND");
    expect(preview?.readyToExecute).toBe(false);
  });
});

describe("requestExecution — end to end through the real policy engine", () => {
  it("creates a real execution request for a within-limits AI-originated transfer", async () => {
    reset();
    const { user, deployment } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 10 USDC to Acme for consulting");
    const outcome = requestExecution(result.intent.id, user.id);
    expect(outcome.kind).toBe("execution_request");
    if (outcome.kind === "execution_request") {
      expect(outcome.executionRequest.agentDeploymentId).toBe(deployment.id);
      expect(outcome.executionRequest.intent.amount).toBe(10 * USDC);
      expect(outcome.executionRequest.status).not.toBe("BLOCKED");
    }
  });

  it("routes an amount above the approval threshold to AWAITING_USER, never auto-executed", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 300 USDC to Acme for equipment");
    const outcome = requestExecution(result.intent.id, user.id);
    expect(outcome.kind).toBe("execution_request");
    if (outcome.kind === "execution_request") {
      expect(outcome.executionRequest.status).toBe("AWAITING_USER");
      expect(outcome.executionRequest.requiresHumanApproval).toBe(true);
    }
  });

  it("blocks an amount above the transaction limit via the policy engine, not the AI", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Pay 999 USDC to Acme for a large purchase");
    const outcome = requestExecution(result.intent.id, user.id);
    expect(outcome.kind).toBe("execution_request");
    if (outcome.kind === "execution_request") {
      expect(outcome.executionRequest.status).toBe("BLOCKED");
    }
  });

  it("rejects execution for a read-only action like BUDGET_CHECK", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "How much budget do I have left?");
    const outcome = requestExecution(result.intent.id, user.id);
    expect(outcome.kind).toBe("rejected");
  });

  it("creates a SCHEDULE_PAYMENT as REQUIRE_APPROVAL regardless of amount", async () => {
    reset();
    const { user } = setup();
    const result = await interpretMessage(user.id, "s1", "Schedule 10 USDC to Acme monthly starting tomorrow for rent");
    const outcome = requestExecution(result.intent.id, user.id);
    expect(outcome.kind).toBe("schedule");
    if (outcome.kind === "schedule") {
      expect(outcome.schedule.approvalMode).toBe("REQUIRE_APPROVAL");
    }
  });
});
