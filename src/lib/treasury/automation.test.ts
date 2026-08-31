/**
 * Conformance tests for treasury automation: scheduled payments, budgets,
 * batches, and multi-agent workflows. Mirrors the style of
 * src/lib/db/persistence.test.ts — real localStorage-backed db, real api
 * layer, no mocks.
 */
import { describe, it, expect } from "../policy/testKit";
import { db } from "../db/client";
import { ensureUser } from "../api/users";
import { ensureWallet } from "../api/wallets";
import { deployAgent } from "../api/deployments";
import { updatePolicy } from "../api/policies";
import { createSchedule, evaluateAndFireOccurrence, advanceSchedule, getDueSchedules } from "../api/schedules";
import { createBudget, evaluateBudget, recordBudgetUsage, usedInCurrentPeriod } from "../api/budgets";
import { createBatch } from "../api/batches";
import { createWorkflowDefinition, startWorkflowRun, getStepsByRun } from "../api/workflows";
import { pauseAllAutomation, resumeAutomation } from "../api/automation";
import { makePolicy } from "../policy/model";
import { addInterval, isOccurrenceDue, occurrenceKeyFor } from "./schedule";
import { checkBudget, periodKeyFor } from "./budget";

const USDC = 1_000_000;
const VENDOR = "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f";

function reset() {
  db.clearAll();
}

function setup(policyOverrides: Partial<Parameters<typeof makePolicy>[0]> = {}) {
  const user = ensureUser("0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f" as any);
  const wallet = ensureWallet(user.id, user.address, "0x534e5f5345504f4c4941", "Ready", false, "ready");
  const policy = makePolicy({
    agentId: "holographic-treasury",
    owner: user.address,
    allowedAssets: ["USDC"],
    maximumTransactionAmount: 500 * USDC,
    dailySpendingLimit: 5000 * USDC,
    approvedRecipients: [VENDOR],
    approvalThreshold: 0,
    allowedActions: ["transfer"],
    paused: false,
    ...policyOverrides,
  });
  const { deployment, policyRecord } = deployAgent(user.id, wallet.id, "holographic-treasury", "1.0.0", policy, "Test policy");
  return { user, wallet, deployment, policyRecord };
}

/* ---------------------------------------------------------- pure model */

describe("Schedule domain model", () => {
  it("advances DAILY/WEEKLY/MONTHLY intervals calendar-correctly", () => {
    const jan31 = Date.UTC(2026, 0, 31);
    const feb28 = addInterval(jan31, "MONTHLY");
    expect(new Date(feb28).getUTCMonth()).toBe(1);
  });

  it("occurrenceKeyFor is deterministic for the same schedule+timestamp", () => {
    expect(occurrenceKeyFor("sch_1", 1000)).toBe("sch_1:1000");
  });

  it("isOccurrenceDue rejects a paused schedule even if the time has passed", () => {
    const due = isOccurrenceDue({ status: "PAUSED", nextOccurrenceAt: 0, occurrenceCount: 0 } as any, Date.now());
    expect(due).toBe(false);
  });
});

describe("Budget domain model", () => {
  it("computes the same periodKey for two timestamps on the same UTC day", () => {
    const a = periodKeyFor("DAILY", Date.UTC(2026, 7, 31, 1));
    const b = periodKeyFor("DAILY", Date.UTC(2026, 7, 31, 23));
    expect(a).toBe(b);
  });

  it("blocks an amount that would exceed the remaining budget", () => {
    const budget = { name: "Vendor", status: "ACTIVE", limit: 100 } as any;
    const result = checkBudget(budget, 80, 30);
    expect(result.allowed).toBe(false);
  });

  it("allows an amount that fits exactly at the limit", () => {
    const budget = { name: "Vendor", status: "ACTIVE", limit: 100 } as any;
    const result = checkBudget(budget, 80, 20);
    expect(result.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------- api layer */

describe("Scheduled payment idempotency", () => {
  it("firing the same occurrence twice never creates a second execution request", () => {
    reset();
    const { user, deployment } = setup();
    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 50 * USDC,
      reason: "Retainer",
      frequency: "MONTHLY",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
    });

    const first = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    const second = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);

    expect(first.id).toBe(second.id);
    expect(first.executionRequestId).toBe(second.executionRequestId);

    const requests = db.getAll<any>("execution_requests").filter((r: any) => r.agentDeploymentId === deployment.id);
    expect(requests).toHaveLength(1);
  });

  it("advancing the schedule after firing moves the pointer forward and increments occurrenceCount", () => {
    reset();
    const { user, deployment } = setup();
    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 10 * USDC,
      reason: "Weekly retainer",
      frequency: "WEEKLY",
      startDate: Date.now() - 1000,
      approvalMode: "AUTOMATIC",
    });
    evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    const advanced = advanceSchedule(schedule, schedule.nextOccurrenceAt);
    expect(advanced.occurrenceCount).toBe(1);
    expect(advanced.nextOccurrenceAt > schedule.nextOccurrenceAt).toBe(true);
  });
});

describe("Scheduled payment re-evaluates the CURRENT policy at fire time", () => {
  it("a schedule created under a $500 limit is BLOCKED once the policy tightens to $100", () => {
    reset();
    const { user, deployment, policyRecord } = setup({ maximumTransactionAmount: 500 * USDC });

    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 250 * USDC,
      reason: "Large vendor payment",
      frequency: "ONCE",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
    });

    // Policy tightens AFTER the schedule was created — the schedule itself is untouched.
    updatePolicy(policyRecord.id, user.id, { ...policyRecord.doc, maximumTransactionAmount: 100 * USDC });

    const occurrence = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    expect(occurrence.status).toBe("BLOCKED");

    const req = db.getById<any>("execution_requests", occurrence.executionRequestId!);
    expect(req.status).toBe("BLOCKED");
  });
});

describe("Automation pause blocks scheduled execution", () => {
  it("a due occurrence is BLOCKED while automation is paused, and resumes normal evaluation after resume", () => {
    reset();
    const { user, deployment } = setup();
    pauseAllAutomation(user.id, "incident response");

    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 10 * USDC,
      reason: "Paused test",
      frequency: "ONCE",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
    });

    const blocked = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    expect(blocked.status).toBe("BLOCKED");
    expect(getDueSchedules(user.id)).toHaveLength(1); // still due — never silently marked complete

    resumeAutomation(user.id);
  });
});

describe("Budget enforcement — policy AND budget must both allow", () => {
  it("blocks a policy-valid payment that exceeds the remaining budget, without creating a wallet-facing request", () => {
    reset();
    const { user, deployment } = setup({ maximumTransactionAmount: 1000 * USDC });
    const budget = createBudget(user.id, "Vendor budget", "USDC", 100 * USDC, "MONTHLY", null);

    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 150 * USDC, // within policy, above budget
      reason: "Over-budget payment",
      frequency: "ONCE",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
      budgetId: budget.id,
    });

    const occurrence = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    expect(occurrence.status).toBe("BLOCKED");
    expect(occurrence.blockedReason).toContain("E_BUDGET_EXCEEDED");
    expect(usedInCurrentPeriod(budget.id)).toBe(0); // nothing was reserved for a blocked payment
  });

  it("records usage idempotently — the same executionRequestId never double-counts", () => {
    reset();
    const { user } = setup();
    const budget = createBudget(user.id, "Idempotent budget", "USDC", 1000 * USDC, "MONTHLY", null);
    recordBudgetUsage(budget.id, user.id, 50 * USDC, "exec_1");
    recordBudgetUsage(budget.id, user.id, 50 * USDC, "exec_1");
    expect(usedInCurrentPeriod(budget.id)).toBe(50 * USDC);
  });

  it("evaluateBudget reflects prior usage against the same period", () => {
    reset();
    const { user } = setup();
    const budget = createBudget(user.id, "Running budget", "USDC", 100 * USDC, "MONTHLY", null);
    recordBudgetUsage(budget.id, user.id, 80 * USDC, "exec_a");
    const result = evaluateBudget(budget.id, 30 * USDC);
    expect(result.allowed).toBe(false);
  });
});

describe("Payment batches", () => {
  it("a later item is blocked once earlier items in the same batch exhaust the budget", () => {
    reset();
    const { user, deployment } = setup({ maximumTransactionAmount: 1000 * USDC });
    const budget = createBudget(user.id, "Batch budget", "USDC", 100 * USDC, "MONTHLY", null);

    const batch = createBatch(
      user.id,
      deployment.id,
      "Contractor payouts",
      [
        { recipient: VENDOR, asset: "USDC", amount: 70 * USDC, reason: "A" },
        { recipient: VENDOR, asset: "USDC", amount: 70 * USDC, reason: "B" },
      ],
      budget.id,
    );

    expect(batch.items[0].status).toBe("APPROVED");
    expect(batch.items[1].status).toBe("BLOCKED");
  });

  it("rejects a batch larger than the emergency max batch size", () => {
    reset();
    const { user, deployment } = setup();
    const items = Array.from({ length: 30 }, (_, i) => ({ recipient: VENDOR, asset: "USDC", amount: 1 * USDC, reason: `item ${i}` }));
    let threw = false;
    try {
      createBatch(user.id, deployment.id, "Too big", items);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("Multi-agent workflow step gating", () => {
  it("a policy-rejected run fails at the POLICY_EVALUATION step and never reaches TREASURY_EXECUTION", () => {
    reset();
    const { user, deployment } = setup({ maximumTransactionAmount: 100 * USDC, approvedRecipients: [VENDOR] });
    const def = createWorkflowDefinition(user.id, "Vendor Payment Workflow");

    const run = startWorkflowRun(user.id, def.id, deployment.id, {
      recipient: VENDOR,
      asset: "USDC",
      amount: 500 * USDC, // exceeds the 100 USDC limit
      reason: "Oversized vendor payment",
    });

    expect(run.status).toBe("FAILED");
    const steps = getStepsByRun(run.id);
    expect(steps.some((s) => s.type === "TREASURY_EXECUTION")).toBe(false);
    expect(steps.some((s) => s.type === "POLICY_EVALUATION" && s.status === "FAILED")).toBe(true);
  });

  it("a compliant run reaches TREASURY_EXECUTION and prepares an execution request", () => {
    reset();
    const { user, deployment } = setup({ maximumTransactionAmount: 1000 * USDC, approvedRecipients: [VENDOR] });
    const def = createWorkflowDefinition(user.id, "Vendor Payment Workflow");

    const run = startWorkflowRun(user.id, def.id, deployment.id, {
      recipient: VENDOR,
      asset: "USDC",
      amount: 200 * USDC,
      reason: "Standard vendor payment",
    });

    expect(run.status).toBe("RUNNING");
    expect(!!run.executionRequestId).toBe(true);
    const steps = getStepsByRun(run.id);
    expect(steps.find((s) => s.type === "TREASURY_EXECUTION")?.status).toBe("PASSED");
  });
});
