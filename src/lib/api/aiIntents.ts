import { db } from "../db/client";
import type { DbAIConversationTurn, DbAIIntent, DbAITraceEvent, AITraceStage, AIIntentStatus, AIIntentAction } from "../db/schema";

/**
 * "Backend" API layer for the AI tables — same shape as every other module
 * in src/lib/api/*. Nothing here evaluates policy or moves money; it only
 * persists what the AI said, what was validated, and what happened, so the
 * whole exchange is auditable later (see /docs/ai-agents/observability.md).
 */

const MAX_CONVERSATION_TURNS_KEPT = 40;

export function createAIIntent(params: {
  userId: string;
  agentId: string;
  agentVersion: string;
  provider: "mock" | "openai";
  model: string;
  promptVersion: string;
  rawMessage: string;
  rawOutput: Record<string, unknown>;
  structuredIntent: Record<string, unknown> | null;
  status: AIIntentStatus;
  invalidReason?: string;
  intentHash: string;
}): DbAIIntent {
  return db.create<DbAIIntent>("ai_intents", {
    userId: params.userId,
    agentId: params.agentId,
    agentVersion: params.agentVersion,
    provider: params.provider,
    model: params.model,
    promptVersion: params.promptVersion,
    rawMessage: params.rawMessage,
    rawOutput: params.rawOutput,
    structuredIntent: params.structuredIntent,
    status: params.status,
    invalidReason: params.invalidReason,
    intentHash: params.intentHash as never,
    updatedAt: Date.now(),
  });
}

export function getAIIntentById(id: string, userId?: string): DbAIIntent | null {
  const intent = db.getById<DbAIIntent>("ai_intents", id);
  if (!intent) return null;
  if (userId && intent.userId !== userId) throw new Error("Unauthorized: intent does not belong to user");
  return intent;
}

export function getAIIntentsByUser(userId: string): DbAIIntent[] {
  return db.find<DbAIIntent>("ai_intents", (i) => i.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateAIIntentStatus(
  id: string,
  status: AIIntentStatus,
  invalidReason?: string,
  extra: { executionRequestId?: string; scheduleId?: string } = {},
): DbAIIntent | null {
  return db.update<DbAIIntent>("ai_intents", id, { status, invalidReason, updatedAt: Date.now(), ...extra });
}

export function recordAITraceEvent(intentId: string, stage: AITraceStage, detail: string, ok: boolean): DbAITraceEvent {
  return db.create<DbAITraceEvent>("ai_trace_events", { intentId, stage, detail, ok, userId: db.getById<DbAIIntent>("ai_intents", intentId)?.userId ?? "" });
}

export function getAITraceForIntent(intentId: string): DbAITraceEvent[] {
  return db.find<DbAITraceEvent>("ai_trace_events", (e) => e.intentId === intentId).sort((a, b) => a.createdAt - b.createdAt);
}

/* -------------------------------------------------------- conversation */

export function recordConversationTurn(userId: string, sessionId: string, role: "user" | "assistant", content: string, relatedIntentId?: string): DbAIConversationTurn {
  const turn = db.create<DbAIConversationTurn>("ai_conversation_turns", { userId, sessionId, role, content, relatedIntentId });
  trimConversation(userId, sessionId);
  return turn;
}

/** Short-term memory only — never grows unbounded, never substitutes for policy. */
export function getConversationTurns(userId: string, sessionId: string): DbAIConversationTurn[] {
  return db
    .find<DbAIConversationTurn>("ai_conversation_turns", (t) => t.userId === userId && t.sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

function trimConversation(userId: string, sessionId: string): void {
  const turns = getConversationTurns(userId, sessionId);
  const excess = turns.length - MAX_CONVERSATION_TURNS_KEPT;
  if (excess <= 0) return;
  for (const turn of turns.slice(0, excess)) {
    db.delete("ai_conversation_turns", turn.id);
  }
}

export type { AIIntentAction };
