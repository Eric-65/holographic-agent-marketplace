/** POST /api/ai/explain — same pattern as interpret.ts. */

import { isAIConfigured, callExplain } from "../_lib/openaiClient";
import { ExplainRequestSchema } from "../_lib/schemas";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  if (!isAIConfigured()) {
    return new Response(JSON.stringify({ error: "AI not configured" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const parsedRequest = ExplainRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return new Response(JSON.stringify({ error: "Invalid request shape", issues: parsedRequest.error.issues }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    const explanation = await callExplain(parsedRequest.data.question, parsedRequest.data.evidence);
    return new Response(JSON.stringify({ explanation }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "AI request failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
