/**
 * The structured intent contract between the AI layer and Holographic's
 * domain logic. Every field here is untrusted input until
 * `validateAIIntent` (structural) and the domain-layer checks in
 * `src/lib/ai/tools.ts` (capability/recipient/amount/policy) have all
 * passed. Nothing downstream of this file ever executes based on the raw
 * model output — see AI_AGENT_SPEC.md.
 */

export const AI_ACTIONS = [
  "PRIVATE_TRANSFER",
  "SCHEDULE_PAYMENT",
  "PAYMENT_REQUEST",
  "BUDGET_CHECK",
  "APPROVAL_REQUEST",
  "EXECUTION_STATUS",
  "VERIFICATION_STATUS",
  "CLARIFICATION_NEEDED",
  "UNSUPPORTED",
] as const;

export type AIAction = (typeof AI_ACTIONS)[number];

export const AI_SCHEDULE_FREQUENCIES = ["ONCE", "DAILY", "WEEKLY", "MONTHLY"] as const;
export type AIScheduleFrequency = (typeof AI_SCHEDULE_FREQUENCIES)[number];

export interface AIScheduleSpec {
  frequency: AIScheduleFrequency;
  /** ISO date/time, already resolved from natural language ("next Friday" → an actual date) by the provider. */
  startDate: string;
  endDate: string | null;
}

/**
 * The raw shape a provider (mock or real) returns. Every field is optional
 * except `action` — the provider is expected to omit what it doesn't know
 * rather than guess, which is exactly what makes CLARIFICATION_NEEDED work.
 */
export interface AIStructuredIntent {
  action: AIAction;
  asset?: string;
  /** A known domain reference the backend resolves (e.g. "contractor_a") — never a raw address chosen by the model. */
  recipientReference?: string;
  /** Only set when the USER explicitly typed a raw address — flagged as NEW/UNVERIFIED downstream, never silently trusted. */
  rawRecipientAddress?: string;
  /** Raw natural-language amount text ("25 USDC", "ten dollars in USDC") — resolved by parseAmount, never by float math. */
  amountText?: string;
  schedule?: AIScheduleSpec | null;
  reason?: string;
  /** For EXECUTION_STATUS / VERIFICATION_STATUS / APPROVAL_REQUEST lookups against an existing record. */
  referenceId?: string;
  /** Set by the provider itself when information is missing — a qualitative state, never a fake confidence score. */
  clarity?: "CLEAR" | "AMBIGUOUS" | "NEEDS_REVIEW" | "UNSUPPORTED";
  missingFields?: string[];
  clarificationQuestion?: string;
  /** The provider's own natural-language gloss of what it understood — display only, never parsed for meaning. */
  explanation?: string;
}

export interface ValidatedAIIntent {
  valid: true;
  intent: AIStructuredIntent;
}
export interface InvalidAIIntent {
  valid: false;
  reason: string;
}

const KNOWN_ASSETS = new Set(["USDC", "STRK", "ETH"]);

/**
 * Strict structural validation — the first gate every provider output must
 * pass before anything else touches it. Unknown actions, malformed
 * schedules, and non-string/non-object fields are rejected outright; this
 * function never tries to silently coerce or repair unsafe output.
 */
export function validateAIIntent(raw: unknown): ValidatedAIIntent | InvalidAIIntent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, reason: "INVALID_AGENT_INTENT: output is not a JSON object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.action !== "string" || !AI_ACTIONS.includes(r.action as AIAction)) {
    return { valid: false, reason: `INVALID_AGENT_INTENT: unknown or missing action "${String(r.action)}"` };
  }
  const action = r.action as AIAction;

  if (r.asset !== undefined) {
    if (typeof r.asset !== "string") return { valid: false, reason: "INVALID_AGENT_INTENT: asset must be a string" };
    if (!KNOWN_ASSETS.has(r.asset.toUpperCase())) {
      return { valid: false, reason: `INVALID_AGENT_INTENT: unsupported asset "${r.asset}"` };
    }
  }
  if (r.recipientReference !== undefined && typeof r.recipientReference !== "string") {
    return { valid: false, reason: "INVALID_AGENT_INTENT: recipientReference must be a string" };
  }
  if (r.rawRecipientAddress !== undefined && typeof r.rawRecipientAddress !== "string") {
    return { valid: false, reason: "INVALID_AGENT_INTENT: rawRecipientAddress must be a string" };
  }
  if (r.amountText !== undefined && typeof r.amountText !== "string") {
    return { valid: false, reason: "INVALID_AGENT_INTENT: amountText must be a string" };
  }
  if (r.reason !== undefined && typeof r.reason !== "string") {
    return { valid: false, reason: "INVALID_AGENT_INTENT: reason must be a string" };
  }
  if (r.referenceId !== undefined && typeof r.referenceId !== "string") {
    return { valid: false, reason: "INVALID_AGENT_INTENT: referenceId must be a string" };
  }
  if (r.missingFields !== undefined && (!Array.isArray(r.missingFields) || r.missingFields.some((f) => typeof f !== "string"))) {
    return { valid: false, reason: "INVALID_AGENT_INTENT: missingFields must be a string array" };
  }

  let schedule: AIScheduleSpec | null | undefined;
  if (r.schedule !== undefined && r.schedule !== null) {
    if (typeof r.schedule !== "object" || Array.isArray(r.schedule)) {
      return { valid: false, reason: "INVALID_AGENT_INTENT: malformed schedule" };
    }
    const s = r.schedule as Record<string, unknown>;
    if (typeof s.frequency !== "string" || !AI_SCHEDULE_FREQUENCIES.includes(s.frequency as AIScheduleFrequency)) {
      return { valid: false, reason: `INVALID_AGENT_INTENT: malformed schedule frequency "${String(s.frequency)}"` };
    }
    if (typeof s.startDate !== "string" || Number.isNaN(Date.parse(s.startDate))) {
      return { valid: false, reason: "INVALID_AGENT_INTENT: malformed schedule startDate" };
    }
    if (s.endDate !== undefined && s.endDate !== null && (typeof s.endDate !== "string" || Number.isNaN(Date.parse(s.endDate)))) {
      return { valid: false, reason: "INVALID_AGENT_INTENT: malformed schedule endDate" };
    }
    schedule = { frequency: s.frequency as AIScheduleFrequency, startDate: s.startDate, endDate: (s.endDate as string | null) ?? null };
  } else if (r.schedule === null) {
    schedule = null;
  }

  if (action === "SCHEDULE_PAYMENT" && !schedule) {
    return { valid: false, reason: "INVALID_AGENT_INTENT: SCHEDULE_PAYMENT requires a schedule" };
  }

  return {
    valid: true,
    intent: {
      action,
      asset: typeof r.asset === "string" ? r.asset.toUpperCase() : undefined,
      recipientReference: r.recipientReference as string | undefined,
      rawRecipientAddress: r.rawRecipientAddress as string | undefined,
      amountText: r.amountText as string | undefined,
      schedule,
      reason: r.reason as string | undefined,
      referenceId: r.referenceId as string | undefined,
      clarity: (r.clarity as AIStructuredIntent["clarity"]) ?? undefined,
      missingFields: r.missingFields as string[] | undefined,
      clarificationQuestion: r.clarificationQuestion as string | undefined,
      explanation: r.explanation as string | undefined,
    },
  };
}
