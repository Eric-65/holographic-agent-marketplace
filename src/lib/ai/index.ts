/**
 * Orchestration layer: the entry point every UI surface should call.
 * Owns provider selection, conversation persistence, and the boundary
 * between "the AI said X" and "X is now a structurally validated intent
 * sitting in the database, still fully untrusted for anything else". No
 * execution ever happens here — see requestExecution.ts for that gate.
 */

import { db } from "../db/client";
import type { DbAIIntent } from "../db/schema";
import { validateAIIntent, type AIStructuredIntent } from "./schema";
import { MockAIProvider } from "./MockAIProvider";
import { RealAIProvider } from "./RealAIProvider";
import type { AIProvider, AIConversationTurn } from "./types";
import { AIUnavailableError } from "./types";
import { createAIIntent, recordAITraceEvent, recordConversationTurn, getConversationTurns } from "../api/aiIntents";
import { getActiveAgentCapabilities, listApprovedRecipients, getBudgetsSummary, findEligibleDeployments, resolveRecipientReference, resolveRawAddress } from "./tools";
import { parseAmount } from "./parseAmount";
import { poseidonish } from "../hash";

export type { AIProvider } from "./types";
export { AIUnavailableError } from "./types";

const AI_ACTIONS_LIST = ["PRIVATE_TRANSFER", "SCHEDULE_PAYMENT", "PAYMENT_REQUEST", "BUDGET_CHECK", "APPROVAL_REQUEST", "EXECUTION_STATUS", "VERIFICATION_STATUS"];

const mockProvider = new MockAIProvider();
let activeProvider: AIProvider = mockProvider;

/**
 * Mock is the default and only provider active unless explicitly switched —
 * per §22/§30, AI capability must never be assumed present. A deployment
 * without OPENAI_API_KEY configured server-side simply keeps using Mock;
 * RealAIProvider calls fail closed with AIUnavailableError, never silently
 * degrade to fabricated output.
 */
export function getAIProvider(): AIProvider {
  return activeProvider;
}

export function useRealAIProvider(model: string, promptVersion = "openai-2026-09-11"): void {
  activeProvider = new RealAIProvider(model, promptVersion);
}

export function useMockAIProvider(): void {
  activeProvider = mockProvider;
}

export function isUsingMockProvider(): boolean {
  return activeProvider.name === "mock";
}

/**
 * Test-only hook: installs an arbitrary AIProvider (e.g. a scriptable fake
 * that returns adversarial output on demand). Adversarial/security testing
 * must be able to inject whatever a malicious or malfunctioning model might
 * say — the property under test is that validateAIIntent + tools.ts +
 * requestExecution hold regardless of what any provider outputs, not that
 * MockAIProvider itself happens to always be well-behaved.
 */
export function setAIProviderForTesting(provider: AIProvider): void {
  activeProvider = provider;
}

export interface InterpretResult {
  intent: DbAIIntent;
  reply: string;
  aiUnavailable?: boolean;
}

/**
 * The single entry point for turning a user's message into a persisted,
 * structurally-validated AI intent. Never executes anything; the caller
 * decides whether to show a clarification prompt, an intent preview, or
 * (only on explicit user confirmation) call requestExecution().
 */
export async function interpretMessage(userId: string, sessionId: string, message: string): Promise<InterpretResult> {
  recordConversationTurn(userId, sessionId, "user", message);
  const history: AIConversationTurn[] = getConversationTurns(userId, sessionId).slice(-10).map((t) => ({ role: t.role, content: t.content }));

  const context = {
    availableActions: AI_ACTIONS_LIST,
    recipientNames: listApprovedRecipients(userId).map((r) => r.name),
    budgetNames: getBudgetsSummary(userId).map((b) => b.name),
    agentCapabilities: getActiveAgentCapabilities(userId),
  };

  const provider = getAIProvider();
  let raw: Record<string, unknown>;
  let reply: string;
  try {
    const output = await provider.generateIntent({ message, history, context });
    raw = output.raw;
    reply = output.reply;
  } catch (e) {
    const fallback = "AI is currently unavailable — you can still use every manual form in the app.";
    const intent = createAIIntent({
      userId,
      agentId: "",
      agentVersion: "",
      provider: provider.name,
      model: provider.model,
      promptVersion: provider.promptVersion,
      rawMessage: message,
      rawOutput: {},
      structuredIntent: null,
      status: "INVALID",
      invalidReason: e instanceof AIUnavailableError ? e.message : "AI provider error",
      intentHash: poseidonish({ message, ts: Date.now() }),
    });
    recordAITraceEvent(intent.id, "request", "provider call failed", false);
    try {
      db.create("notifications", { userId, type: "ai_unavailable", title: "AI unavailable", message: fallback, read: false, createdAt: Date.now() });
    } catch {}
    recordConversationTurn(userId, sessionId, "assistant", fallback);
    return { intent, reply: fallback, aiUnavailable: true };
  }

  recordConversationTurn(userId, sessionId, "assistant", reply);

  const validation = validateAIIntent(raw);
  const intentHash = poseidonish({ raw, userId, ts: Date.now() });

  if (!validation.valid) {
    const intent = createAIIntent({
      userId,
      agentId: "",
      agentVersion: "",
      provider: provider.name,
      model: provider.model,
      promptVersion: provider.promptVersion,
      rawMessage: message,
      rawOutput: raw,
      structuredIntent: null,
      status: "INVALID",
      invalidReason: validation.reason,
      intentHash,
    });
    recordAITraceEvent(intent.id, "schema_validation", validation.reason, false);
    try {
      db.create("notifications", { userId, type: "ai_intent_blocked", title: "AI output rejected", message: validation.reason, read: false, createdAt: Date.now() });
    } catch {}
    return { intent, reply };
  }

  const structured = validation.intent;
  const eligible = isMoneyMovingAction(structured.action) ? findEligibleDeployments(userId, structured.action as never) : [];
  const agentId = eligible[0]?.agent.id ?? "";
  const agentVersion = eligible[0]?.deployment.agentVersion ?? "";

  const intent = createAIIntent({
    userId,
    agentId,
    agentVersion,
    provider: provider.name,
    model: provider.model,
    promptVersion: provider.promptVersion,
    rawMessage: message,
    rawOutput: raw,
    structuredIntent: structured as unknown as Record<string, unknown>,
    status: "VALIDATED",
    intentHash,
  });
  recordAITraceEvent(intent.id, "schema_validation", "structurally valid", true);

  return { intent, reply };
}

function isMoneyMovingAction(action: string): boolean {
  return action === "PRIVATE_TRANSFER" || action === "SCHEDULE_PAYMENT" || action === "PAYMENT_REQUEST";
}

export interface IntentPreview {
  action: AIStructuredIntent["action"];
  recipient: { status: "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND"; name?: string; address?: string; candidates?: { name: string; address: string }[] } | null;
  amount: { ok: true; displayAmount: string } | { ok: false; reason: string } | null;
  reason?: string;
  schedule?: AIStructuredIntent["schedule"];
  readyToExecute: boolean;
  blockers: string[];
}

/** Read-only preview for the confirmation UI — resolves recipient/amount without persisting or executing anything. */
export function previewIntent(userId: string, intentId: string): IntentPreview | null {
  const stored = db.getById<DbAIIntent>("ai_intents", intentId);
  if (!stored || stored.userId !== userId || !stored.structuredIntent) return null;
  const structured = stored.structuredIntent as unknown as AIStructuredIntent;
  const blockers: string[] = [];

  let recipient: IntentPreview["recipient"] = null;
  if (structured.rawRecipientAddress) recipient = resolveRawAddress(userId, structured.rawRecipientAddress);
  else if (structured.recipientReference) recipient = resolveRecipientReference(userId, structured.recipientReference);
  if (isMoneyMovingAction(structured.action)) {
    if (!recipient || recipient.status !== "RESOLVED") blockers.push("Recipient needs to be resolved to one of your approved recipients");
  }

  let amount: IntentPreview["amount"] = null;
  if (structured.amountText) {
    const parsed = parseAmount(structured.amountText);
    amount = parsed.ok ? { ok: true, displayAmount: parsed.displayAmount } : { ok: false, reason: parsed.reason };
    if (!parsed.ok) blockers.push(parsed.reason);
  } else if (isMoneyMovingAction(structured.action)) {
    blockers.push("Amount is missing");
  }

  return {
    action: structured.action,
    recipient,
    amount,
    reason: structured.reason,
    schedule: structured.schedule,
    readyToExecute: blockers.length === 0 && isMoneyMovingAction(structured.action),
    blockers,
  };
}
