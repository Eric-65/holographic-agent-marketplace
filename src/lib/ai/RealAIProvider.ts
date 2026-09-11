/**
 * Calls the server-side /api/ai/* functions, which are the only place
 * OPENAI_API_KEY is ever read. Nothing in this file, or anywhere else in
 * the browser bundle, holds an API key — see api/_lib/openaiClient.ts.
 */

import type { AIProvider, AIGenerateIntentInput, AIGenerateIntentOutput, AIExplainInput } from "./types";
import { AIUnavailableError } from "./types";

async function callApi<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new AIUnavailableError("Could not reach the AI service");
  }
  if (!res.ok) {
    if (res.status === 503) throw new AIUnavailableError("AI service is not configured");
    throw new AIUnavailableError(`AI service error (${res.status})`);
  }
  return (await res.json()) as T;
}

export class RealAIProvider implements AIProvider {
  readonly name = "openai" as const;
  constructor(
    readonly model: string,
    readonly promptVersion: string,
  ) {}

  async generateIntent(input: AIGenerateIntentInput): Promise<AIGenerateIntentOutput> {
    return callApi<AIGenerateIntentOutput>("/api/ai/interpret", input);
  }

  async explainDecision(input: AIExplainInput): Promise<string> {
    const result = await callApi<{ explanation: string }>("/api/ai/explain", input);
    return result.explanation;
  }
}
