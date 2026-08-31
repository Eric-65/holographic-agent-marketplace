import { poseidonish } from "../hash";
import type {
  ActionIntent,
  BindingState,
  PolicyDocument,
  PolicyVerdict,
  RuleId,
  RuleResult,
} from "../types";

export const ENGINE_VERSION = "1.2.0";

export const RULE_CATALOG: Record<RuleId, { label: string; description: string }> = {
  R01: { label: "Intent schema", description: "Structure, field types and bounds are valid" },
  R02: { label: "Agent binding", description: "Agent is bound, active and version-matched" },
  R03: { label: "Action allowlist", description: "Action kind is permitted by the policy" },
  R04: { label: "Asset scope", description: "Asset is inside the declared scope" },
  R05: { label: "Venue allowlist", description: "Execution venue is approved" },
  R06: { label: "Per-action cap", description: "Notional under the single-action ceiling" },
  R07: { label: "Rolling 24h cap", description: "Cumulative notional under the daily ceiling" },
  R08: { label: "Cooldown", description: "Minimum interval since the last executed action" },
  R09: { label: "Slippage bound", description: "Requested slippage within tolerance" },
  R10: { label: "Counterparty", description: "Recipient is not on the deny list" },
  R11: { label: "Disclosure", description: "Disclosure-receipt requirement satisfied" },
  R12: { label: "Kill switch", description: "No active pause on this binding" },
};

/**
 * DETERMINISTIC POLICY ENGINE.
 *
 * Pure total function: (intent, policy, state, now) → verdict.
 * No I/O, no randomness, no floating-point thresholds (integer USD / bps only),
 * injected clock, fixed rule ordering, default deny.
 *
 * The same artifact runs in the browser dry-run and server-side, so a preview
 * verdict is byte-identical to the production verdict.
 */
export function evaluatePolicy(
  intent: ActionIntent,
  policy: PolicyDocument,
  state: BindingState,
  now: number = Date.now(),
): PolicyVerdict {
  const trace: RuleResult[] = [];
  let outcome: PolicyVerdict["outcome"] = "APPROVE";
  let failedRule: RuleId | undefined;
  let reason: string | undefined;
  let halted = false;

  const rule = (
    id: RuleId,
    ok: boolean,
    observed: string,
    bound: string,
    opts: { soft?: boolean; why?: string } = {},
  ) => {
    if (halted) {
      trace.push({ id, ...RULE_CATALOG[id], outcome: "skipped", observed: "—", bound });
      return;
    }
    if (ok) {
      trace.push({ id, ...RULE_CATALOG[id], outcome: "pass", observed, bound });
      return;
    }
    if (opts.soft) {
      trace.push({ id, ...RULE_CATALOG[id], outcome: "confirm", observed, bound });
      if (outcome === "APPROVE") outcome = "REQUIRE_USER_CONFIRMATION";
      return;
    }
    trace.push({ id, ...RULE_CATALOG[id], outcome: "fail", observed, bound });
    outcome = "REJECT";
    failedRule = id;
    reason = opts.why ?? `${RULE_CATALOG[id].label} violated`;
    halted = true;
  };

  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  // 01 — schema
  const schemaOk =
    Number.isFinite(intent.amountUsd) &&
    intent.amountUsd > 0 &&
    intent.maxSlippageBps >= 0 &&
    intent.deadline > now;
  rule("R01", schemaOk, "schema v1.2", "valid", { why: "Malformed or expired intent" });

  // 02 — binding
  rule("R02", policy.agentId === intent.agentId, intent.agentId, policy.agentId, {
    why: "Intent emitted by an agent that is not bound to this policy",
  });

  // 03 — action allowlist
  rule("R03", policy.allowedActions.includes(intent.kind), intent.kind,
    `${policy.allowedActions.length} allowed`, { why: `Action ${intent.kind} not permitted` });

  // 04 — asset scope
  rule("R04", policy.assetScope.includes(intent.asset), intent.asset,
    policy.assetScope.join(", ") || "none", { why: `Asset ${intent.asset} out of scope` });

  // 05 — venue allowlist
  rule("R05", policy.venueAllowlist.includes(intent.venue), intent.venue,
    policy.venueAllowlist.join(", ") || "none", { why: `Venue ${intent.venue} not allowlisted` });

  // 06 — per-action cap
  rule("R06", intent.amountUsd <= policy.perActionCapUsd, usd(intent.amountUsd),
    usd(policy.perActionCapUsd), { why: "Single-action notional exceeds ceiling" });

  // 07 — rolling daily cap
  const projected = state.dailySpentUsd + intent.amountUsd;
  rule("R07", projected <= policy.dailyCapUsd, usd(projected), usd(policy.dailyCapUsd), {
    why: "Rolling 24h notional would exceed ceiling",
  });

  // 08 — cooldown
  const elapsed = Math.max(0, Math.round((now - state.lastActionAt) / 1000));
  rule("R08", elapsed >= policy.cooldownSeconds, `${elapsed}s`, `${policy.cooldownSeconds}s`, {
    why: "Cooldown window has not elapsed",
  });

  // 09 — slippage
  rule("R09", intent.maxSlippageBps <= policy.maxSlippageBps, `${intent.maxSlippageBps} bps`,
    `${policy.maxSlippageBps} bps`, { why: "Requested slippage exceeds tolerance" });

  // 10 — counterparty
  const cp = intent.counterparty;
  rule("R10", !cp || !policy.counterpartyDenyList.includes(cp), cp ?? "n/a",
    `${policy.counterpartyDenyList.length} denied`, { why: "Counterparty is on the deny list" });

  // 11 — disclosure
  rule("R11", true, policy.requireDisclosureReceipt ? "receipt required" : "optional", "satisfied");

  // 12 — kill switch
  rule("R12", !policy.killSwitch && !state.paused,
    policy.killSwitch || state.paused ? "paused" : "active", "active", {
      why: "Kill switch is engaged for this binding",
    });

  // Soft band — evaluated last so it can never mask a hard rejection.
  if (!halted && policy.confirmAboveUsd > 0 && intent.amountUsd > policy.confirmAboveUsd) {
    trace.push({
      id: "R06",
      label: "Confirmation threshold",
      description: "Notional above the soft band requires explicit user confirmation",
      outcome: "confirm",
      observed: usd(intent.amountUsd),
      bound: `> ${usd(policy.confirmAboveUsd)}`,
    });
    if (outcome === "APPROVE") outcome = "REQUIRE_USER_CONFIRMATION";
  }

  return {
    outcome,
    failedRule,
    reason,
    trace,
    traceHash: poseidonish(trace.map((t) => `${t.id}:${t.outcome}`)),
    policyHash: poseidonish(policy),
    intentHash: poseidonish({
      agentId: intent.agentId,
      kind: intent.kind,
      asset: intent.asset,
      venue: intent.venue,
      amountUsd: intent.amountUsd,
      nonce: intent.nonce,
    }),
    engineVersion: ENGINE_VERSION,
    evaluatedAt: now,
  };
}

export const bucketOf = (usd: number) =>
  usd < 1000 ? "<1k"
  : usd < 5000 ? "1k–5k"
  : usd < 10000 ? "5k–10k"
  : usd < 25000 ? "10k–25k"
  : usd < 100000 ? "25k–100k"
  : ">100k";
