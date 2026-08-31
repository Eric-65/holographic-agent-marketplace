import { db } from "../db/client";
import type { DbAutomationControl } from "../db/schema";

/**
 * Automation controls — one row per user. Governs the PAUSE ALL AUTOMATION
 * switch and the emergency risk limits. Only ever mutated by an explicit user
 * action from the UI; an agent has no path that can call these functions.
 */

const DEFAULTS: Pick<
  DbAutomationControl,
  "maxDailyTreasurySpend" | "maxBatchSize" | "maxRecipients" | "requireNewRecipientApproval" | "emergencyPauseThreshold"
> = {
  maxDailyTreasurySpend: 10_000 * 1_000_000, // 10,000 USDC-equivalent minor units
  maxBatchSize: 25,
  maxRecipients: 25,
  requireNewRecipientApproval: true,
  emergencyPauseThreshold: 2_000 * 1_000_000,
};

export function getAutomationControl(userId: string): DbAutomationControl {
  const existing = db.find<DbAutomationControl>("automation_controls", (c) => c.userId === userId)[0];
  if (existing) return existing;
  return db.create<DbAutomationControl>("automation_controls", {
    userId,
    paused: false,
    ...DEFAULTS,
    updatedAt: Date.now(),
  });
}

export function pauseAllAutomation(userId: string, reason?: string): DbAutomationControl {
  const control = getAutomationControl(userId);
  const updated = db.update<DbAutomationControl>("automation_controls", control.id, {
    paused: true,
    pausedReason: reason,
    pausedAt: Date.now(),
  });
  db.create("notifications", {
    userId,
    type: "automation_paused",
    title: "Automation paused",
    message: reason ? `All treasury automation paused — ${reason}` : "All treasury automation paused",
    read: false,
    createdAt: Date.now(),
  });
  return updated!;
}

export function resumeAutomation(userId: string): DbAutomationControl {
  const control = getAutomationControl(userId);
  const updated = db.update<DbAutomationControl>("automation_controls", control.id, {
    paused: false,
    resumedAt: Date.now(),
  });
  db.create("notifications", {
    userId,
    type: "automation_resumed",
    title: "Automation resumed",
    message: "Treasury automation resumed — scheduled payments and workflows may run again",
    read: false,
    createdAt: Date.now(),
  });
  return updated!;
}

export function updateEmergencyRules(
  userId: string,
  updates: Partial<
    Pick<DbAutomationControl, "maxDailyTreasurySpend" | "maxBatchSize" | "maxRecipients" | "requireNewRecipientApproval" | "emergencyPauseThreshold">
  >,
): DbAutomationControl {
  const control = getAutomationControl(userId);
  return db.update<DbAutomationControl>("automation_controls", control.id, updates)!;
}

/** Sum of today's completed automation-originated spend for this user, in minor units of `asset`. */
export function todaysAutomationSpend(userId: string, asset: string): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const requests = db
    .getAll<any>("execution_requests")
    .filter(
      (r) =>
        r.userId === userId &&
        r.intent?.asset === asset &&
        (r.status === "COMPLETED" || r.status === "POLICY_APPROVED" || r.status === "AWAITING_USER") &&
        r.createdAt >= startOfDay.getTime() &&
        !!r.intent?.metadata?.automationSource,
    );
  return requests.reduce((sum, r) => sum + (r.intent?.amount ?? 0), 0);
}
