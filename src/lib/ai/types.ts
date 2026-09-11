/**
 * The provider abstraction. Both MockAIProvider (default, always available,
 * zero network calls) and RealAIProvider (calls the server-side /api/ai/*
 * functions holding OPENAI_API_KEY) implement this same interface, so the
 * rest of the app — and every security/eval test — never has to know or
 * care which one is active. Whatever a provider returns is UNTRUSTED until
 * it passes validateAIIntent and the tools.ts capability/recipient/amount
 * checks; nothing in this interface has the authority to execute anything.
 */

export interface AIConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The minimized context handed to a provider. Deliberately narrow: names
 * and labels the user already chose for their own recipients/budgets, never
 * addresses, never balances beyond what's needed to answer a budget
 * question, never wallet/DB credentials, never seed phrases or keys.
 */
export interface AIContextSnapshot {
  availableActions: string[];
  recipientNames: string[];
  budgetNames: string[];
  agentCapabilities: string[];
}

export interface AIGenerateIntentInput {
  message: string;
  history: AIConversationTurn[];
  context: AIContextSnapshot;
}

export interface AIGenerateIntentOutput {
  /** The exact raw object the provider produced, before any validation — persisted verbatim for audit. */
  raw: Record<string, unknown>;
  /** A short natural-language reply for display — display only, never parsed for meaning downstream. */
  reply: string;
}

export interface AIExplainInput {
  question: string;
  /** Sanitized, non-sensitive summary of the decision being asked about (reasons, amounts, thresholds — never keys/addresses beyond what the user already sees in the UI). */
  evidence: Record<string, unknown>;
}

export interface AIProvider {
  readonly name: "mock" | "openai";
  readonly model: string;
  readonly promptVersion: string;
  generateIntent(input: AIGenerateIntentInput): Promise<AIGenerateIntentOutput>;
  explainDecision(input: AIExplainInput): Promise<string>;
}

export class AIUnavailableError extends Error {
  constructor(message = "AI is currently unavailable") {
    super(message);
    this.name = "AIUnavailableError";
  }
}
