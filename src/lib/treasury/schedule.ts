/**
 * Scheduled payment domain model — pure functions only.
 *
 * A schedule never executes anything by itself. It only describes WHEN a
 * FUTURE INTENT should be generated. Turning that intent into money moving
 * still has to walk through: policy engine → (budget) → wallet authorization
 * → STRK20. See src/lib/api/schedules.ts for the side-effecting half.
 */

import type { DbPaymentSchedule, ScheduleFrequency } from "../db/schema";

/** Schedule state machine — the only legal transitions. */
export const SCHEDULE_TRANSITIONS: Record<DbPaymentSchedule["status"], DbPaymentSchedule["status"][]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAUSED", "COMPLETED", "EXPIRED", "CANCELLED"],
  PAUSED: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransitionSchedule(from: DbPaymentSchedule["status"], to: DbPaymentSchedule["status"]): boolean {
  return SCHEDULE_TRANSITIONS[from].includes(to);
}

/** Advances a timestamp by one schedule interval. Calendar-correct for MONTHLY. */
export function addInterval(ts: number, frequency: ScheduleFrequency, customIntervalDays?: number): number {
  const d = new Date(ts);
  switch (frequency) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + 1);
      return d.getTime();
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7);
      return d.getTime();
    case "MONTHLY": {
      // Clamp to the target month's last day instead of letting Date overflow
      // (naive setUTCMonth(m+1) on Jan 31 lands on Mar 3, not Feb 28).
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, daysInTargetMonth));
      return d.getTime();
    }
    case "CUSTOM":
      d.setUTCDate(d.getUTCDate() + Math.max(1, customIntervalDays ?? 1));
      return d.getTime();
    case "ONCE":
    default:
      return ts;
  }
}

/**
 * True when this schedule has an occurrence due at-or-before `now` and is
 * still eligible to fire (active, inside its date window, under its
 * maxOccurrences cap).
 */
export function isOccurrenceDue(schedule: DbPaymentSchedule, now: number): boolean {
  if (schedule.status !== "ACTIVE") return false;
  if (schedule.nextOccurrenceAt > now) return false;
  if (schedule.endDate && schedule.nextOccurrenceAt > schedule.endDate) return false;
  if (schedule.maxOccurrences && schedule.occurrenceCount >= schedule.maxOccurrences) return false;
  return true;
}

export interface AdvancedSchedule {
  nextOccurrenceAt: number;
  occurrenceCount: number;
  status: DbPaymentSchedule["status"];
}

/**
 * Pure state transition after one occurrence has fired: advances the pointer
 * and decides whether the schedule is now exhausted (ONCE, past endDate, or
 * maxOccurrences reached).
 */
export function advanceAfterOccurrence(schedule: DbPaymentSchedule, firedAt: number): AdvancedSchedule {
  const occurrenceCount = schedule.occurrenceCount + 1;

  if (schedule.frequency === "ONCE") {
    return { nextOccurrenceAt: firedAt, occurrenceCount, status: "COMPLETED" };
  }

  const next = addInterval(firedAt, schedule.frequency, schedule.customIntervalDays);
  const exhaustedByCount = !!schedule.maxOccurrences && occurrenceCount >= schedule.maxOccurrences;
  const exhaustedByDate = !!schedule.endDate && next > schedule.endDate;

  return {
    nextOccurrenceAt: next,
    occurrenceCount,
    status: exhaustedByCount || exhaustedByDate ? "EXPIRED" : schedule.status,
  };
}

export function occurrenceKeyFor(scheduleId: string, occurrenceAt: number): string {
  return `${scheduleId}:${occurrenceAt}`;
}

export function describeFrequency(schedule: DbPaymentSchedule): string {
  switch (schedule.frequency) {
    case "ONCE":
      return "One-time";
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "CUSTOM":
      return `Every ${schedule.customIntervalDays ?? 1} day(s)`;
    default:
      return schedule.frequency;
  }
}
