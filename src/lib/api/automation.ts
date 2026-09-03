import { db } from "../db/client";
import type { DbAutomationControl, DbEmergencyEvent, EmergencyTriggerKind } from "../db/schema";

/**
 * Automation controls — one row per user. Governs the PAUSE ALL AUTOMATION
 * switch and the emergency risk limits. `pauseAllAutomation`/`resumeAutomation`
 * are only ever called from an explicit user action in the UI — an agent has
 * no path that can call them. `triggerEmergencyStop` is the one exception:
 * it is called by the scheduler tick itself when a configured safety
 * threshold is breached, never by an agent.
 */

const DEFAULTS: Pick<
  DbAutomationControl,
  "maxDailyTreasurySpend" | "maxBatchSize" | "maxRecipients" | "requireNewRecipientApproval" | "emergencyPauseThreshold" | "maxFailureRate" | "failureRateWindow"
> = {
  maxDailyTreasurySpend: 10_000 * 1_000_000, // 10,000 USDC-equivalent minor units
  maxBatchSize: 25,
  maxRecipients: 25,
  requireNewRecipientApproval: true,
  emergencyPauseThreshold: 2_000 * 1_000_000,
  maxFailureRate: 0.5, // trigger if half of the last N automated executions failed
  failureRateWindow: 10,
};

export function getAutomationControl(userId: string): DbAutomationControl {
  const existing = db.find<DbAutomationControl>("automation_controls", (c) => c.userId === userId)[0];
  if (existing) return existing;
  return db.create<DbAutomationControl>("automation_controls", {
    userId,
    paused: false,
    pausedByOwner: true,
    ...DEFAULTS,
    updatedAt: Date.now(),
  });
}

function logEmergencyEvent(userId: string, trigger: EmergencyTriggerKind, detail: string, action: DbEmergencyEvent["action"]) {
  try {
    db.create<DbEmergencyEvent>("emergency_events", { userId, trigger, detail, action });
  } catch {}
}

export function pauseAllAutomation(userId: string, reason?: string): DbAutomationControl {
  const control = getAutomationControl(userId);
  const updated = db.update<DbAutomationControl>("automation_controls", control.id, {
    paused: true,
    pausedByOwner: true,
    pausedReason: reason,
    pausedAt: Date.now(),
  });
  logEmergencyEvent(userId, "MANUAL", reason ?? "Manual pause", "PAUSED");
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
  logEmergencyEvent(userId, "MANUAL", "Resumed by owner", "RESUMED");
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
    Pick<
      DbAutomationControl,
      "maxDailyTreasurySpend" | "maxBatchSize" | "maxRecipients" | "requireNewRecipientApproval" | "emergencyPauseThreshold" | "maxFailureRate" | "failureRateWindow"
    >
  >,
): DbAutomationControl {
  const control = getAutomationControl(userId);
  return db.update<DbAutomationControl>("automation_controls", control.id, updates)!;
}

export function getEmergencyEvents(userId: string): DbEmergencyEvent[] {
  return db.find<DbEmergencyEvent>("emergency_events", (e) => e.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Automatic pause — distinct from an owner clicking "Pause all automation".
 * Called only by the scheduler tick (src/lib/scheduler/worker.ts) when
 * checkEmergencyTriggers finds a breach. Resuming still always requires the
 * owner (resumeAutomation is unchanged and only ever UI-triggered).
 */
export function triggerEmergencyStop(userId: string, trigger: EmergencyTriggerKind, detail: string): DbAutomationControl {
  const control = getAutomationControl(userId);
  if (control.paused) return control; // already stopped — do not overwrite an existing (possibly manual) pause reason
  const updated = db.update<DbAutomationControl>("automation_controls", control.id, {
    paused: true,
    pausedByOwner: false,
    pausedReason: detail,
    pausedAt: Date.now(),
  })!;
  logEmergencyEvent(userId, trigger, detail, "PAUSED");
  db.create("notifications", {
    userId,
    type: "emergency_stop_triggered",
    title: "Emergency stop triggered",
    message: detail,
    read: false,
    createdAt: Date.now(),
  });
  return updated;
}

export interface EmergencyCheckResult {
  triggered: boolean;
  trigger?: EmergencyTriggerKind;
  detail?: string;
}

/**
 * Pure-ish evaluator over persisted state: daily automated spend per asset,
 * and the recent failure rate of automated executions. STRK20-provider and
 * policy-integrity failures are surfaced by the caller (the worker/UI knows
 * about wallet/provider state that this DB-only module does not) via the
 * optional flags.
 */
export function checkEmergencyTriggers(userId: string, opts: { strk20ProviderDown?: boolean; policyIntegrityFailure?: boolean } = {}): EmergencyCheckResult {
  const control = getAutomationControl(userId);
  if (control.paused) return { triggered: false };

  if (opts.strk20ProviderDown) {
    return { triggered: true, trigger: "STRK20_PROVIDER_FAILURE", detail: "STRK20 privacy provider is unavailable" };
  }
  if (opts.policyIntegrityFailure) {
    return { triggered: true, trigger: "POLICY_INTEGRITY_FAILURE", detail: "Policy integrity check failed — a policy hash did not match its committed value" };
  }

  const assetsToday = new Set(
    db
      .getAll<any>("execution_requests")
      .filter((r) => r.userId === userId && !!r.intent?.metadata?.automationSource)
      .map((r) => r.intent?.asset as string),
  );
  for (const asset of assetsToday) {
    const spend = todaysAutomationSpend(userId, asset);
    if (spend > control.maxDailyTreasurySpend) {
      return { triggered: true, trigger: "DAILY_SPEND_EXCEEDED", detail: `Daily automated spend in ${asset} (${spend}) exceeded the configured ceiling (${control.maxDailyTreasurySpend})` };
    }
  }

  const recent = db
    .getAll<any>("execution_results")
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, control.failureRateWindow);
  if (recent.length >= Math.min(5, control.failureRateWindow)) {
    const failureRate = recent.filter((r) => r.status === "failed").length / recent.length;
    if (failureRate > control.maxFailureRate) {
      return { triggered: true, trigger: "FAILURE_RATE_EXCEEDED", detail: `${Math.round(failureRate * 100)}% of the last ${recent.length} executions failed` };
    }
  }

  return { triggered: false };
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
