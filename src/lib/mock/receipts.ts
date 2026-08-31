import { poseidonish } from "../hash";
import type {
  ActionKind,
  AssetSymbol,
  ExecutionReceiptData,
  NotionalBucket,
  ReceiptStatus,
  RuleId,
  Venue,
} from "../types";
import { MOCK_AGENTS } from "./agents";

/** Deterministic PRNG so mock history is stable across renders. */
function makeRng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const BUCKETS: NotionalBucket[] = ["<1k", "1k–5k", "5k–10k", "10k–25k", "25k–100k"];
const FAIL_RULES: RuleId[] = ["R06", "R07", "R08", "R09", "R05"];

export function generateReceiptHistory(count = 42): ExecutionReceiptData[] {
  const rng = makeRng(20260715);
  const out: ExecutionReceiptData[] = [];
  let t = Date.now() - 60_000;

  for (let i = 0; i < count; i++) {
    const agent = MOCK_AGENTS[Math.floor(rng() * MOCK_AGENTS.length)];
    const kind = agent.actionSurface[Math.floor(rng() * agent.actionSurface.length)] as ActionKind;
    const asset = agent.assets[Math.floor(rng() * agent.assets.length)] as AssetSymbol;
    const venue = agent.venues[Math.floor(rng() * agent.venues.length)] as Venue;
    const roll = rng();
    const status: ReceiptStatus =
      roll > 0.86 ? "blocked" : roll > 0.83 ? "awaiting_confirmation" : roll > 0.815 ? "reverted" : "executed";
    const executed = status === "executed";
    const seed = { i, a: agent.id, k: kind };

    out.push({
      id: `RCP-${poseidonish(seed).slice(2, 10).toUpperCase()}`,
      agentId: agent.id,
      agentName: agent.name,
      kind,
      asset,
      venue,
      bucket: BUCKETS[Math.floor(rng() * BUCKETS.length)],
      intentHash: poseidonish({ ...seed, s: "intent" }),
      policyHash: poseidonish({ a: agent.id, s: "policy" }),
      traceHash: poseidonish({ ...seed, s: "trace" }),
      txHash: executed || status === "reverted" ? poseidonish({ ...seed, s: "tx" }) : undefined,
      block: executed ? 1_284_000 - i * 37 : undefined,
      proofVerified: executed,
      attestationSig: poseidonish({ ...seed, s: "sig" }),
      status,
      failedRule: status === "blocked" ? FAIL_RULES[Math.floor(rng() * FAIL_RULES.length)] : undefined,
      createdAt: t,
      latencyMs: executed ? Math.round(2400 + rng() * 9000) : undefined,
    });

    t -= Math.round(400_000 + rng() * 5_400_000);
  }
  return out;
}

export const MOCK_RECEIPTS = generateReceiptHistory();

/** 14-day daily volume series for the activity chart, bucketed counts only. */
export function dailySeries(receipts: ExecutionReceiptData[], days = 14) {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => {
    const start = now - (days - i) * 86_400_000;
    const end = start + 86_400_000;
    const slice = receipts.filter((r) => r.createdAt >= start && r.createdAt < end);
    return {
      day: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      executed: slice.filter((r) => r.status === "executed").length,
      blocked: slice.filter((r) => r.status === "blocked").length,
    };
  });
}
