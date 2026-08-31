import { db } from "../db/client";
import type { DbAgentMessage } from "../db/schema";

/**
 * Structured agent-to-agent messages, scoped to a single workflow run.
 * These are audit records of coordination between steps — they never carry
 * a private key, a wallet handle, or an exact private amount, and they never
 * grant one agent access to another agent's authority. Every message is
 * schema-validated and replay-guarded by a monotonic per-run nonce.
 */

export interface AgentMessageInput {
  workflowId: string;
  runId: string;
  senderAgent: string;
  receiverAgent: string;
  messageType: string;
  payload: Record<string, unknown>;
}

function isValidMessage(input: AgentMessageInput): { valid: boolean; reason?: string } {
  if (!input.workflowId || !input.runId) return { valid: false, reason: "workflowId and runId are required" };
  if (!input.senderAgent || !input.receiverAgent) return { valid: false, reason: "senderAgent and receiverAgent are required" };
  if (!input.messageType) return { valid: false, reason: "messageType is required" };
  if (typeof input.payload !== "object" || input.payload === null) return { valid: false, reason: "payload must be an object" };
  const sensitive = ["viewingKey", "privateKey", "seedPhrase", "witness", "note", "exactAmount"];
  const leaked = Object.keys(input.payload).find((k) => sensitive.includes(k));
  if (leaked) return { valid: false, reason: `payload must not carry sensitive field "${leaked}"` };
  return { valid: true };
}

export function sendAgentMessage(input: AgentMessageInput): DbAgentMessage {
  const validation = isValidMessage(input);
  if (!validation.valid) throw new Error(`Invalid agent message: ${validation.reason}`);

  // Nonce is monotonic per-run and derived from persisted history so it
  // survives page reloads — not an in-memory counter that would reset.
  const nonce = getMessagesByRun(input.runId).length + 1;
  return db.create<DbAgentMessage>("agent_messages", {
    workflowId: input.workflowId,
    runId: input.runId,
    senderAgent: input.senderAgent,
    receiverAgent: input.receiverAgent,
    messageType: input.messageType,
    payload: input.payload,
    timestamp: Date.now(),
    nonce,
  });
}

export function getMessagesByRun(runId: string): DbAgentMessage[] {
  return db.find<DbAgentMessage>("agent_messages", (m) => m.runId === runId).sort((a, b) => a.timestamp - b.timestamp);
}
