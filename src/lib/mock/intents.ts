import type { ActionIntent, ActionKind, Agent, AssetSymbol, Venue } from "../types";

const RATIONALES: Record<ActionKind, string[]> = {
  private_swap: [
    "Risk-adjusted spread between venues widened 41 bps; rotating allocation.",
    "Scheduled accumulation slice reached its randomised window.",
    "Realised volatility broke the upper band; reducing directional exposure.",
  ],
  private_transfer: [
    "Payroll cycle reached its scheduled window for 6 allowlisted recipients.",
    "Recurring grant disbursement to a whitelisted recipient.",
  ],
  shield: ["Idle public balance detected; moving to shielded state."],
  reshield: ["Settlement leg complete; returning proceeds to shielded state."],
  unshield: ["Settlement leg requires a public balance before the venue call."],
  borrow: ["Health factor above target band; extending shielded leverage."],
  repay: ["Health factor approaching floor; deleveraging ahead of the band."],
};

let counter = 0;

/**
 * Simulates one agent run. In production this is the sandboxed agent runtime
 * emitting a schema-validated ActionIntent — the shape is identical.
 */
export function simulateIntent(agent: Agent, opts?: { amountUsd?: number }): ActionIntent {
  counter += 1;
  const r = Math.random;
  const kind = agent.actionSurface[Math.floor(r() * agent.actionSurface.length)] as ActionKind;
  const asset = agent.assets[Math.floor(r() * agent.assets.length)] as AssetSymbol;
  const venue = agent.venues[Math.floor(r() * agent.venues.length)] as Venue;
  const base = agent.category === "Risk" ? 9_000 : agent.category === "Treasury" ? 14_000 : 3_200;
  const amountUsd = opts?.amountUsd ?? Math.round((base * (0.3 + r() * 2.1)) / 50) * 50;

  return {
    id: `INT-${Date.now().toString(36).toUpperCase()}-${counter}`,
    agentId: agent.id,
    kind,
    asset,
    venue,
    amountUsd,
    maxSlippageBps: Math.round(10 + r() * 110),
    counterparty:
      kind === "private_transfer"
        ? r() > 0.88
          ? "0x0d3f…sanctioned"
          : "0x04a7…9f21"
        : undefined,
    deadline: Date.now() + 120_000,
    rationale: RATIONALES[kind][Math.floor(r() * RATIONALES[kind].length)],
    nonce: Math.floor(r() * 1_000_000),
    createdAt: Date.now(),
  };
}
