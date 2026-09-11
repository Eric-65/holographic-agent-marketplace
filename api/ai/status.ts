/** GET /api/ai/status — lets the client know whether a real provider is configured, without leaking the key. */

import { isAIConfigured, getModel } from "../_lib/openaiClient";

export const config = { runtime: "edge" };

export default async function handler(): Promise<Response> {
  const configured = isAIConfigured();
  return new Response(JSON.stringify({ configured, model: configured ? getModel() : null }), { status: 200, headers: { "Content-Type": "application/json" } });
}
