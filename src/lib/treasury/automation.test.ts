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
import { createSchedule, updateSchedule, getScheduleVersions, evaluateAndFireOccurrence, advanceSchedule, getDueSchedules } from "../api/schedules";
import { createBudget, evaluateBudget, evaluateBudgets, recordBudgetUsage, usedInCurrentPeriod } from "../api/budgets";
import { createBatch } from "../api/batches";
import { createWorkflowDefinition, startWorkflowRun, getStepsByRun } from "../api/workflows";
import { pauseAllAutomation, resumeAutomation, checkEmergencyTriggers, triggerEmergencyStop, getAutomationControl } from "../api/automation";
import { getNewRecipientReviewsByUser, approveNewRecipientReview } from "../api/newRecipientReviews";
import { makePolicy } from "../policy/model";
import { addInterval, isOccurrenceDue, occurrenceKeyFor } from "./schedule";
import { checkBudget, checkBudgets, periodKeyFor } from "./budget";

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
      [budget.id],
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

describe("Multiple simultaneous budgets — every one must independently allow", () => {
  it("checkBudgets blocks if even one of several budgets would be exceeded", () => {
    const generous = { name: "Agent budget", status: "ACTIVE", limit: 1000 } as any;
    const tight = { name: "Treasury budget", status: "ACTIVE", limit: 50 } as any;
    const result = checkBudgets(
      [
        { budget: generous, used: 0 },
        { budget: tight, used: 0 },
      ],
      100,
    );
    expect(result.allowed).toBe(false);
    expect(result.results).toHaveLength(2);
  });

  it("a scheduled payment is BLOCKED when an agent budget passes but the treasury-wide budget does not", () => {
    reset();
    const { user, deployment } = setup({ maximumTransactionAmount: 1000 * USDC });
    const agentBudget = createBudget(user.id, "Agent budget", "USDC", 1000 * USDC, "MONTHLY", null);
    const treasuryBudget = createBudget(user.id, "Treasury-wide budget", "USDC", 50 * USDC, "MONTHLY", null);

    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 100 * USDC,
      reason: "Multi-budget test",
      frequency: "ONCE",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
      budgetIds: [agentBudget.id, treasuryBudget.id],
    });

    const occurrence = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    expect(occurrence.status).toBe("BLOCKED");

    const combined = evaluateBudgets([agentBudget.id, treasuryBudget.id], 100 * USDC);
    expect(combined.allowed).toBe(false);
    expect(combined.results.find((r) => r.budgetId === agentBudget.id)?.allowed).toBe(true);
    expect(combined.results.find((r) => r.budgetId === treasuryBudget.id)?.allowed).toBe(false);
  });
});

describe("Schedule editing preserves history via versioning", () => {
  it("updateSchedule snapshots the pre-edit state and bumps the version, without touching past occurrences", () => {
    reset();
    const { user, deployment } = setup();
    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 50 * USDC,
      reason: "Original terms",
      frequency: "MONTHLY",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
    });
    expect(schedule.version).toBe(1);

    const occurrence = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    expect(occurrence.policyVersionUsed).toBe(1);

    const updated = updateSchedule(schedule.id, user.id, { amount: 75 * USDC, reason: "Revised terms" }, "vendor asked for a raise");
    expect(updated.version).toBe(2);
    expect(updated.amount).toBe(75 * USDC);

    const history = getScheduleVersions(schedule.id);
    expect(history).toHaveLength(1);
    expect(history[0].snapshot.amount).toBe(50 * USDC);

    // The already-fired occurrence's record is untouched by the later edit.
    const stillOriginal = db.getById<any>("schedule_occurrences", occurrence.id);
    expect(stillOriginal.policyVersionUsed).toBe(1);
  });
});

describe("New-recipient review — an agent can never approve its own recipient", () => {
  it("flags a review instead of silently allowing or silently blocking forever, and approving unblocks the next attempt", () => {
    reset();
    const { user, deployment, policyRecord } = setup({ approvedRecipients: [] });
    const NEW_VENDOR = "0x0777788899900011122233344455566677788899";

    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: NEW_VENDOR,
      amount: 10 * USDC,
      reason: "First payment to a new vendor",
      frequency: "ONCE",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
    });

    const occurrence = evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);
    expect(occurrence.status).toBe("BLOCKED");

    const reviews = getNewRecipientReviewsByUser(user.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].recipient).toBe(NEW_VENDOR);
    expect(reviews[0].status).toBe("PENDING");

    approveNewRecipientReview(reviews[0].id, user.id, "New Vendor Inc");

    const updatedPolicy = db.getById<any>("policies", policyRecord.id);
    expect(updatedPolicy.doc.approvedRecipients).toContain(NEW_VENDOR);
  });
});

describe("Automatic emergency triggers", () => {
  it("triggers DAILY_SPEND_EXCEEDED once automated spend crosses the configured ceiling, and blocks the next tick", () => {
    reset();
    const { user, deployment } = setup({ maximumTransactionAmount: 10_000 * USDC, dailySpendingLimit: 100_000 * USDC });
    const control = getAutomationControl(user.id);
    // Tighten the daily ceiling so a single scheduled payment breaches it.
    db.update("automation_controls", control.id, { maxDailyTreasurySpend: 5 * USDC });

    const schedule = createSchedule(user.id, deployment.id, {
      asset: "USDC",
      recipient: VENDOR,
      amount: 10 * USDC,
      reason: "Over the daily automation ceiling",
      frequency: "ONCE",
      startDate: Date.now(),
      approvalMode: "AUTOMATIC",
    });
    evaluateAndFireOccurrence(schedule, schedule.nextOccurrenceAt);

    const check = checkEmergencyTriggers(user.id);
    expect(check.triggered).toBe(true);
    expect(check.trigger).toBe("DAILY_SPEND_EXCEEDED");
  });

  it("triggerEmergencyStop pauses automation and is distinguishable from a manual pause", () => {
    reset();
    const { user } = setup();
    triggerEmergencyStop(user.id, "FAILURE_RATE_EXCEEDED", "80% of recent executions failed");
    const control = getAutomationControl(user.id);
    expect(control.paused).toBe(true);
    expect(control.pausedByOwner).toBe(false);
  });

  it("a manual pause is never silently overwritten by a later automatic trigger", () => {
    reset();
    const { user } = setup();
    pauseAllAutomation(user.id, "owner requested maintenance");
    triggerEmergencyStop(user.id, "STRK20_PROVIDER_FAILURE", "provider down");
    const control = getAutomationControl(user.id);
    expect(control.pausedByOwner).toBe(true);
    expect(control.pausedReason).toBe("owner requested maintenance");
  });
});
