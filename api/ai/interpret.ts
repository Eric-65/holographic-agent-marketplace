/**
 * POST /api/ai/interpret — the only network hop that ever reaches OpenAI.
 * Runs as a Vercel Edge Function in production; the dev-server plugin in
 * vite.config.ts calls this exact same handler locally so `npm run dev`
 * behaves identically. Web-standard Request/Response in, Request/Response
 * out — no framework-specific request object.
 */

import { isAIConfigured, callInterpret } from "../_lib/openaiClient";
import { InterpretRequestSchema } from "../_lib/schemas";

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

  const parsedRequest = InterpretRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return new Response(JSON.stringify({ error: "Invalid request shape", issues: parsedRequest.error.issues }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    const result = await callInterpret(parsedRequest.data);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "AI request failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
