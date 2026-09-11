/**
 * Deterministic natural-language date/schedule interpretation. Like
 * parseAmount, this exists so that whatever text a provider (mock or real)
 * extracts from a message, the actual date math is done once, here, by code
 * that can be tested — never by trusting a model's own arithmetic. Anything
 * this module can't resolve confidently is returned as an ambiguity, never
 * a guess.
 */

import type { AIScheduleFrequency, AIScheduleSpec } from "./schema";

export interface ParsedDate {
  ok: true;
  iso: string;
}
export interface AmbiguousDate {
  ok: false;
  reason: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function startOfUTCDay(ts: number): Date {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolves a single relative-or-absolute date phrase to an ISO date string.
 * `nowTs` is injected (defaults to Date.now()) so this is testable without
 * mocking the system clock.
 */
export function parseDate(text: string, nowTs: number = Date.now()): ParsedDate | AmbiguousDate {
  const t = text.trim().toLowerCase();
  if (!t) return { ok: false, reason: "No date provided" };

  const today = startOfUTCDay(nowTs);

  if (t === "today") return { ok: true, iso: today.toISOString() };

  if (t === "tomorrow") {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 1);
    return { ok: true, iso: d.toISOString() };
  }

  // "in 3 days" / "in 2 weeks" / "in 1 month"
  const inMatch = t.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months)$/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2];
    const d = new Date(today);
    if (unit.startsWith("day")) d.setUTCDate(d.getUTCDate() + n);
    else if (unit.startsWith("week")) d.setUTCDate(d.getUTCDate() + n * 7);
    else d.setUTCMonth(d.getUTCMonth() + n);
    return { ok: true, iso: d.toISOString() };
  }

  // "next friday" / "this friday" / bare "friday" (treated as the upcoming one)
  const weekdayMatch = t.match(/^(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekdayMatch) {
    const qualifier = weekdayMatch[1];
    const targetDow = WEEKDAYS.indexOf(weekdayMatch[2]);
    const d = new Date(today);
    const currentDow = d.getUTCDay();
    // Bare/"this" weekday: the upcoming occurrence (today counts if it matches).
    // "next" weekday: always the occurrence in the following week.
    const upcoming = (targetDow - currentDow + 7) % 7;
    const delta = qualifier === "next" ? (upcoming || 7) + 7 : upcoming;
    d.setUTCDate(d.getUTCDate() + delta);
    return { ok: true, iso: d.toISOString() };
  }

  // ISO date: "2026-01-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const parsed = Date.parse(`${t}T00:00:00.000Z`);
    if (Number.isNaN(parsed)) return { ok: false, reason: `"${text}" is not a valid date` };
    return { ok: true, iso: new Date(parsed).toISOString() };
  }

  // Fallback: let Date parse unambiguous absolute formats ("Jan 15 2026", "January 15, 2026")
  // but reject anything Date.parse "fixes up" too liberally by requiring a 4-digit year present.
  if (/\b\d{4}\b/.test(t)) {
    const parsed = Date.parse(text.trim());
    if (!Number.isNaN(parsed)) return { ok: true, iso: new Date(parsed).toISOString() };
  }

  return { ok: false, reason: `Could not determine a specific date from "${text}"` };
}

export interface ParsedSchedule {
  ok: true;
  schedule: AIScheduleSpec;
}
export interface AmbiguousSchedule {
  ok: false;
  reason: string;
}

const FREQUENCY_WORDS: Record<string, AIScheduleFrequency> = {
  once: "ONCE",
  daily: "DAILY",
  "every day": "DAILY",
  weekly: "WEEKLY",
  "every week": "WEEKLY",
  monthly: "MONTHLY",
  "every month": "MONTHLY",
};

/**
 * Parses free text like "every month starting next Friday" or "weekly from
 * 2026-01-05 until 2026-06-05" into a structured schedule. Returns an
 * ambiguity reason (never a guessed frequency or date) when the text
 * doesn't clearly specify both a frequency and a start.
 */
export function parseSchedule(text: string, nowTs: number = Date.now()): ParsedSchedule | AmbiguousSchedule {
  const t = text.trim().toLowerCase();
  if (!t) return { ok: false, reason: "No schedule details provided" };

  let frequency: AIScheduleFrequency | null = null;
  for (const [phrase, freq] of Object.entries(FREQUENCY_WORDS)) {
    if (t.includes(phrase)) {
      frequency = freq;
      break;
    }
  }
  if (!frequency) {
    return { ok: false, reason: `Could not determine how often to repeat this from "${text}" — expected once, daily, weekly, or monthly` };
  }

  const startMatch = t.match(/(?:starting|start|from|on)\s+([a-z0-9 ,-]+?)(?=\s+(?:until|ending|through|to|for)\b|$)/);
  const startText = startMatch ? startMatch[1].trim() : frequency === "ONCE" ? t.replace(/\bonce\b/g, "").replace(/\s+for\s+.+$/, "").trim() : "";
  if (!startText) {
    return { ok: false, reason: `Could not determine a start date from "${text}" — please specify when this should begin` };
  }
  const startParsed = parseDate(startText, nowTs);
  if (!startParsed.ok) {
    return { ok: false, reason: `Could not determine a start date from "${text}": ${startParsed.reason}` };
  }

  const endMatch = t.match(/(?:until|ending|through)\s+([a-z0-9 ,-]+?)(?=\s+for\b|$)/);
  let endDate: string | null = null;
  if (endMatch) {
    const endParsed = parseDate(endMatch[1].trim(), nowTs);
    if (!endParsed.ok) {
      return { ok: false, reason: `Could not determine an end date from "${text}": ${endParsed.reason}` };
    }
    endDate = endParsed.iso;
    if (new Date(endDate).getTime() < new Date(startParsed.iso).getTime()) {
      return { ok: false, reason: `The end date in "${text}" is before the start date` };
    }
  }

  return { ok: true, schedule: { frequency, startDate: startParsed.iso, endDate } };
}
