import { advanceSchedule, evaluateAndFireOccurrence, getDueSchedules } from "../api/schedules";
import { getAutomationControl } from "../api/automation";

/**
 * Frontend ↔ worker boundary.
 *
 * ARCHITECTURAL NOTE — read before changing this file.
 * This hackathon build has no standalone backend process: the "database" is
 * localStorage and every `src/lib/api/*` module IS the server-side boundary,
 * just running inside the browser tab (see src/lib/db/client.ts). `runSchedulerTick`
 * is written as a plain, framework-free function precisely so it can be lifted
 * into a real cron/worker process without touching its logic — only the
 * caller changes (see src/lib/store.tsx, which drives it from a setInterval
 * while a wallet is connected, standing in for a real scheduler daemon).
 *
 * What this function is NOT allowed to do, in this build or any future one:
 *   - hold, derive, or request a private key
 *   - sign or submit a transaction
 *   - bypass the policy engine or a budget check
 * It only ever produces a future intent, evaluates it against the CURRENT
 * policy/budget, and — at best — leaves an execution request sitting at
 * POLICY_APPROVED/AWAITING_USER for the connected wallet to authorize
 * interactively. See src/lib/api/schedules.ts#evaluateAndFireOccurrence.
 */

export interface SchedulerTickResult {
  userId: string;
  checkedAt: number;
  automationPaused: boolean;
  dueCount: number;
  fired: { scheduleId: string; occurrenceId: string; status: string }[];
}

export function runSchedulerTick(userId: string, now: number = Date.now()): SchedulerTickResult {
  const automation = getAutomationControl(userId);
  const due = getDueSchedules(userId, now);

  if (automation.paused) {
    return { userId, checkedAt: now, automationPaused: true, dueCount: due.length, fired: [] };
  }

  const fired: SchedulerTickResult["fired"] = [];
  for (const schedule of due) {
    const occurrenceAt = schedule.nextOccurrenceAt;
    const occurrence = evaluateAndFireOccurrence(schedule, occurrenceAt);
    advanceSchedule(schedule, occurrenceAt);
    fired.push({ scheduleId: schedule.id, occurrenceId: occurrence.id, status: occurrence.status });
  }

  return { userId, checkedAt: now, automationPaused: false, dueCount: due.length, fired };
}
