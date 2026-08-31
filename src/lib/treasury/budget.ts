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
