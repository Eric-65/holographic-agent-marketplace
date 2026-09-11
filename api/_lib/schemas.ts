/**
 * Server-only zod schemas. These never ship to the browser bundle (nothing
 * under /api is part of the Vite client build) — kept separate from
 * src/lib/ai/schema.ts, which is the hand-rolled, dependency-free validator
 * the CLIENT uses to re-check whatever comes back from here. Both must
 * agree on shape; this one additionally drives OpenAI's Structured Outputs
 * so the model is constrained to exactly this JSON shape at generation
 * time — a second layer, never a replacement for the client-side check.
 */

import { z } from "zod";

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

export const AI_SCHEDULE_FREQUENCIES = ["ONCE", "DAILY", "WEEKLY", "MONTHLY"] as const;

// OpenAI Structured Outputs strict mode requires every declared property to
// be present in `required` — optional-in-spirit fields are modeled as
// nullable instead of `.optional()`.
export const ScheduleSpecSchema = z
  .object({
    frequency: z.enum(AI_SCHEDULE_FREQUENCIES),
    startDate: z.string(),
    endDate: z.string().nullable(),
  })
  .strict();

export const StructuredIntentSchema = z
  .object({
    action: z.enum(AI_ACTIONS),
    asset: z.string().nullable(),
    recipientReference: z.string().nullable(),
    rawRecipientAddress: z.string().nullable(),
    amountText: z.string().nullable(),
    schedule: ScheduleSpecSchema.nullable(),
    reason: z.string().nullable(),
    referenceId: z.string().nullable(),
    clarity: z.enum(["CLEAR", "AMBIGUOUS", "NEEDS_REVIEW", "UNSUPPORTED"]),
    missingFields: z.array(z.string()),
    clarificationQuestion: z.string().nullable(),
    explanation: z.string(),
  })
  .strict();

export const InterpretRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .max(10),
  context: z.object({
    availableActions: z.array(z.string()).max(20),
    recipientNames: z.array(z.string()).max(100),
    budgetNames: z.array(z.string()).max(50),
    agentCapabilities: z.array(z.string()).max(30),
  }),
});

export const ExplainRequestSchema = z.object({
  question: z.string().min(1).max(500),
  evidence: z.record(z.string(), z.unknown()),
});
