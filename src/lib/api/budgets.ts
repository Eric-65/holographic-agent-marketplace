import { db } from "../db/client";
import type { DbBudget, DbBudgetUsage, BudgetPeriod } from "../db/schema";
import { checkBudget, periodKeyFor, type BudgetCheckResult } from "../treasury/budget";

/**
 * POST /budgets
 * GET /budgets
 * POST /budgets/:id/usage   (idempotent — one row per executionRequestId)
 */

export function createBudget(
  userId: string,
  name: string,
  asset: string,
  limit: number,
  period: BudgetPeriod,
  policyId: string | null,
): DbBudget {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  if (!name.trim()) throw new Error("Budget name required");
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Budget limit must be a positive integer (minor units)");

  return db.create<DbBudget>("budgets", {
    userId,
    name: name.trim(),
    asset,
    limit,
    period,
    policyId,
    status: "ACTIVE",
    updatedAt: Date.now(),
  });
}

export function getBudgetsByUser(userId: string): DbBudget[] {
  return db.find<DbBudget>("budgets", (b) => b.userId === userId);
}

export function getBudgetById(id: string, userId?: string): DbBudget | null {
  const budget = db.getById<DbBudget>("budgets", id);
  if (!budget) return null;
  if (userId && budget.userId !== userId) throw new Error("Unauthorized: budget does not belong to user");
  return budget;
}

export function pauseBudget(id: string, userId: string): DbBudget | null {
  const budget = getBudgetById(id, userId);
  if (!budget) throw new Error("Budget not found");
  return db.update<DbBudget>("budgets", id, { status: "PAUSED" });
}

export function resumeBudget(id: string, userId: string): DbBudget | null {
  const budget = getBudgetById(id, userId);
  if (!budget) throw new Error("Budget not found");
  return db.update<DbBudget>("budgets", id, { status: "ACTIVE" });
}

/** Sum of minor units already used in the CURRENT period for this budget. */
export function usedInCurrentPeriod(budgetId: string, at: number = Date.now()): number {
  const budget = db.getById<DbBudget>("budgets", budgetId);
  if (!budget) return 0;
  const key = periodKeyFor(budget.period, at);
  return db
    .find<DbBudgetUsage>("budget_usage", (u) => u.budgetId === budgetId && u.periodKey === key)
    .reduce((sum, u) => sum + u.used, 0);
}

/** Pure-ish check that composes the current period usage with a candidate amount. */
export function evaluateBudget(budgetId: string, amount: number, at: number = Date.now()): BudgetCheckResult {
  const budget = db.getById<DbBudget>("budgets", budgetId);
  if (!budget) return { allowed: false, reason: "Budget not found", remaining: 0, limit: 0, used: 0 };
  const used = usedInCurrentPeriod(budgetId, at);
  return checkBudget(budget, used, amount);
}

/**
 * Records consumption against a budget for one execution. Idempotent: a
 * given executionRequestId can only ever be recorded once, so scheduler
 * retries or duplicate calls never double-count spend.
 */
export function recordBudgetUsage(budgetId: string, userId: string, amount: number, executionRequestId: string, at: number = Date.now()): DbBudgetUsage | null {
  const existing = db.find<DbBudgetUsage>("budget_usage", (u) => u.executionRequestId === executionRequestId && u.budgetId === budgetId)[0];
  if (existing) return existing;

  const budget = db.getById<DbBudget>("budgets", budgetId);
  if (!budget) throw new Error("Budget not found");

  return db.create<DbBudgetUsage>("budget_usage", {
    budgetId,
    userId,
    periodKey: periodKeyFor(budget.period, at),
    used: amount,
    executionRequestId,
  });
}

export function getBudgetUsageHistory(budgetId: string): DbBudgetUsage[] {
  return db.find<DbBudgetUsage>("budget_usage", (u) => u.budgetId === budgetId).sort((a, b) => b.createdAt - a.createdAt);
}
