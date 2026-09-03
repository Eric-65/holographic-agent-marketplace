/**
 * Treasury budget domain model — pure functions only.
 *
 * A budget is NOT a replacement for the policy engine. Both must pass:
 *   Execution requires: policy allows AND budget allows.
 * This module only ever answers "does this period have room left" — it never
 * touches the wallet, the policy engine, or storage.
 */

import type { BudgetPeriod, DbBudget } from "../db/schema";

export function periodKeyFor(period: BudgetPeriod, at: number): string {
  const d = new Date(at);
  if (period === "DAILY") return d.toISOString().slice(0, 10);
  if (period === "MONTHLY") return d.toISOString().slice(0, 7);

  // ISO-8601 week number (WEEKLY)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  remaining: number;
  limit: number;
  used: number;
}

/**
 * Pure check: given a budget, what has already been used in the CURRENT
 * period, and a candidate amount — decide whether the amount fits.
 * `used` must be computed by the caller from persisted budget_usage rows for
 * the relevant periodKey (see api/budgets.ts#usedInCurrentPeriod).
 */
export function checkBudget(budget: DbBudget, used: number, amount: number): BudgetCheckResult {
  const remaining = budget.limit - used;

  if (budget.status !== "ACTIVE") {
    return { allowed: false, reason: `Budget "${budget.name}" is ${budget.status.toLowerCase()}`, remaining, limit: budget.limit, used };
  }

  const projected = used + amount;
  if (projected > budget.limit) {
    return {
      allowed: false,
      reason: `Budget exceeded: "${budget.name}" has ${remaining} remaining, requested ${amount}`,
      remaining,
      limit: budget.limit,
      used,
    };
  }

  return { allowed: true, remaining: remaining - amount, limit: budget.limit, used };
}

export interface MultiBudgetCheckResult {
  allowed: boolean;
  /** One result per budget, in the order given — no budget can override another; ALL must pass. */
  results: (BudgetCheckResult & { budgetId: string; budgetName: string })[];
  reasons: string[];
}

/**
 * A transaction can be constrained by several budgets at once (e.g. an
 * agent's own budget AND the monthly treasury budget). Every one of them
 * must independently allow the amount — the first one that says no blocks
 * the whole thing, but every budget is still evaluated so all reasons are
 * visible together.
 */
export function checkBudgets(entries: { budget: DbBudget; used: number }[], amount: number): MultiBudgetCheckResult {
  const results = entries.map(({ budget, used }) => ({ ...checkBudget(budget, used, amount), budgetId: budget.id, budgetName: budget.name }));
  const reasons = results.filter((r) => !r.allowed).map((r) => r.reason!).filter(Boolean);
  return { allowed: results.every((r) => r.allowed), results, reasons };
}

/** Merges the deprecated singular `budgetId` with the current `budgetIds` array into one de-duplicated list. */
export function resolveBudgetIds(source: { budgetId?: string; budgetIds?: string[] }): string[] {
  const ids = new Set(source.budgetIds ?? []);
  if (source.budgetId) ids.add(source.budgetId);
  return [...ids];
}
