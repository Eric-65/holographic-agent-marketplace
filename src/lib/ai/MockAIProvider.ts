/**
 * The default, always-available provider. Zero network calls, fully
 * deterministic — every input maps to exactly one output, which is what
 * makes it possible to write reliable adversarial/security tests against it
 * (src/lib/ai/security.test.ts) without needing a live OpenAI key. This is
 * not a toy: it is a real rule-based natural-language interpreter that
 * produces the same AIStructuredIntent shape a real model would, and it is
 * the shape — not the intelligence behind it — that the rest of the app's
 * security depends on.
 */

import type { AIProvider, AIGenerateIntentInput, AIGenerateIntentOutput, AIExplainInput } from "./types";

const ACTION_KEYWORDS: { pattern: RegExp; action: string }[] = [
  { pattern: /\b(schedule|every (day|week|month)|recurring|weekly|monthly|daily)\b/i, action: "SCHEDULE_PAYMENT" },
  { pattern: /\b(request (a )?payment|invoice|bill(ed)?|ask .* to pay)\b/i, action: "PAYMENT_REQUEST" },
  { pattern: /\b(pay|send|transfer)\b/i, action: "PRIVATE_TRANSFER" },
  { pattern: /\b(how much|budget|remaining|spent)\b/i, action: "BUDGET_CHECK" },
  { pattern: /\b(pending approval|awaiting approval|need(s)? my approval)\b/i, action: "APPROVAL_REQUEST" },
  { pattern: /\b(status of|what happened to|did .* go through|track)\b/i, action: "EXECUTION_STATUS" },
  { pattern: /\b(verify|verification|attestation|proof)\b/i, action: "VERIFICATION_STATUS" },
];

const RECIPIENT_STOP_WORDS = "for|on|next|every|starting|until|once|daily|weekly|monthly|recurring";

function extractRecipient(text: string): string | undefined {
  const m = text.match(new RegExp(`\\bto\\s+([A-Za-z][A-Za-z0-9 &._-]{1,40}?)(?=\\s+(?:${RECIPIENT_STOP_WORDS})\\b|\\s+[$\\d]|[.,!?]|$)`, "i"));
  if (m) return m[1].trim();
  const quoted = text.match(/"([^"]{1,40})"/);
  if (quoted) return quoted[1].trim();
  return undefined;
}

function extractAmountText(text: string): string | undefined {
  const m = text.match(/\$\s?\d[\d,]*(\.\d+)?|\b\d[\d,]*(\.\d+)?\s?(usdc|strk|eth|dollars?)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)(\s+[a-z]+)*\s+(usdc|strk|eth|dollars?)\b/i);
  return m ? m[0].trim() : undefined;
}

function extractReason(text: string): string | undefined {
  const m = text.match(/\bfor\s+([a-z0-9 ,.'&-]{3,60}?)(?=\s+(?:on|next|every|starting|until)\b|[.!?]|$)/i);
  return m ? m[1].trim() : undefined;
}

function extractScheduleText(text: string): string | undefined {
  const m = text.match(/\b(once|daily|weekly|monthly|every (day|week|month))\b.*$/i);
  return m ? m[0].trim() : undefined;
}

function extractReferenceId(text: string): string | undefined {
  const m = text.match(/\b(SCH|AI|PREQ|EXR)-[A-Z0-9-]{3,}\b/i);
  return m ? m[0] : undefined;
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model = "holographic-mock-v1";
  readonly promptVersion = "mock-2026-09-11";

  async generateIntent(input: AIGenerateIntentInput): Promise<AIGenerateIntentOutput> {
    const text = input.message.trim();
    if (!text) {
      return { raw: { action: "UNSUPPORTED", explanation: "Empty message." }, reply: "I didn't catch a request there — what would you like to do?" };
    }

    const matched = ACTION_KEYWORDS.find((k) => k.pattern.test(text));
    if (!matched) {
      return {
        raw: { action: "UNSUPPORTED", explanation: "No recognized treasury action in this message." },
        reply: "I can help with payments, scheduling, budgets, approvals, and status checks — I couldn't match this to one of those.",
      };
    }

    if (matched.action === "BUDGET_CHECK" || matched.action === "APPROVAL_REQUEST") {
      return { raw: { action: matched.action, explanation: `Interpreted as a ${matched.action.toLowerCase().replace("_", " ")} lookup.` }, reply: "Let me check that for you." };
    }

    if (matched.action === "EXECUTION_STATUS" || matched.action === "VERIFICATION_STATUS") {
      const referenceId = extractReferenceId(text);
      if (!referenceId) {
        return {
          raw: { action: "CLARIFICATION_NEEDED", clarity: "AMBIGUOUS", missingFields: ["referenceId"], clarificationQuestion: "Which payment or schedule — do you have its reference ID?" },
          reply: "Which one? I'll need the reference ID shown on the payment or schedule.",
        };
      }
      return { raw: { action: matched.action, referenceId }, reply: "Looking that up." };
    }

    // Money-moving actions: PRIVATE_TRANSFER, SCHEDULE_PAYMENT, PAYMENT_REQUEST
    const recipientReference = extractRecipient(text);
    const amountText = extractAmountText(text);
    const reason = extractReason(text);
    const scheduleText = matched.action === "SCHEDULE_PAYMENT" ? extractScheduleText(text) : undefined;

    const missingFields: string[] = [];
    if (!recipientReference) missingFields.push("recipient");
    if (!amountText) missingFields.push("amount");
    if (matched.action === "SCHEDULE_PAYMENT" && !scheduleText) missingFields.push("schedule");

    if (missingFields.length > 0) {
      const question =
        missingFields.length === 1
          ? `Who/what should I set the ${missingFields[0]} to?`
          : `I need a bit more: ${missingFields.join(", ")}. Can you provide those?`;
      return {
        raw: { action: matched.action, recipientReference, amountText, reason, clarity: "AMBIGUOUS", missingFields, clarificationQuestion: question },
        reply: question,
      };
    }

    // Recognize recipients the user typed as a raw 0x address vs. a name reference.
    const isRawAddress = !!recipientReference && /^0x[0-9a-fA-F]+$/.test(recipientReference);

    const raw: Record<string, unknown> = {
      action: matched.action,
      recipientReference: isRawAddress ? undefined : recipientReference,
      rawRecipientAddress: isRawAddress ? recipientReference : undefined,
      amountText,
      reason,
      clarity: "CLEAR",
      explanation: `Interpreted as ${matched.action.replace("_", " ").toLowerCase()} of ${amountText} to "${recipientReference}"${reason ? ` for ${reason}` : ""}.`,
    };

    if (matched.action === "SCHEDULE_PAYMENT" && scheduleText) {
      const { parseSchedule } = await import("./parseSchedule");
      const parsed = parseSchedule(scheduleText);
      if (!parsed.ok) {
        return {
          raw: { action: "SCHEDULE_PAYMENT", recipientReference, amountText, reason, clarity: "AMBIGUOUS", missingFields: ["schedule"], clarificationQuestion: parsed.reason },
          reply: parsed.reason,
        };
      }
      raw.schedule = parsed.schedule;
    }

    return { raw, reply: raw.explanation as string };
  }

  async explainDecision(input: AIExplainInput): Promise<string> {
    const reasons = Array.isArray(input.evidence.reasons) ? (input.evidence.reasons as string[]) : [];
    if (reasons.length === 0) {
      return "This passed every deterministic policy rule — asset allowed, recipient approved, within transaction and daily limits — so no human approval was required.";
    }
    return `This was decided by the policy engine, not by me: ${reasons.join("; ")}.`;
  }
}
