import {
  RECIPIENT_REQUIRED,
  REASON,
  SPEND_BEARING,
  type AgentAction,
  type AgentPolicy,
  type ValidationResult,
} from "./model";

export const VALIDATOR_VERSION = "2.0.0";

/**
 * validateAction — THE decision point of the entire system.
 *
 * Determinism contract
 * --------------------
 *  1. Pure. No I/O, no network, no database, no model inference.
 *  2. No randomness. No `Math.random`, no UUIDs generated inside.
 *  3. No ambient clock. `action.timestamp` is injected by the caller.
 *  4. No floating point. All comparisons are integer minor units.
 *  5. Total. Every input produces a result; nothing throws.
 *  6. Fixed rule order. Reasons always appear in the same sequence.
 *  7. Default deny. Any doubt resolves to `allowed: false`.
 *
 * Given identical (action, policy) it returns an identical result forever.
 * That is what lets a receipt be re-verified years after execution.
 *
 * WHY NO LLM
 * ----------
 * A language model is non-deterministic, non-auditable, and steerable by the
 * very text it is asked to judge. Putting one on this path would mean a
 * prompt-injected rationale could talk its way past a spending limit. Here,
 * an agent's rationale is *never read* by the validator — only its structured
 * fields are. The worst a malicious or hallucinating agent can do is emit an
 * action that these rules reject.
 *
 * Reason accumulation
 * -------------------
 * Unlike a short-circuiting gate, this collects EVERY violation. An operator
 * fixing a policy should see all four problems at once, not discover them one
 * failed run at a time.
 */
export function validateAction(
  action: AgentAction,
  policy: AgentPolicy,
): ValidationResult {
  const reasons: string[] = [];

  /* -- R00 · schema ------------------------------------------------------ */
  // Integer minor units only. Rejects NaN, Infinity, floats and negatives.
  if (!Number.isSafeInteger(action.amount) || action.amount <= 0) {
    reasons.push(
      `${REASON.SCHEMA}: amount must be a positive safe integer in minor units, received ${String(action.amount)}`,
    );
  }
  if (!Number.isSafeInteger(action.spentToday) || action.spentToday < 0) {
    reasons.push(
      `${REASON.SCHEMA}: spentToday must be a non-negative safe integer, received ${String(action.spentToday)}`,
    );
  }

  /* -- R01 · binding ----------------------------------------------------- */
  if (action.agentId !== policy.agentId) {
    reasons.push(
      `${REASON.AGENT_MISMATCH}: action from "${action.agentId}" cannot be evaluated against a policy bound to "${policy.agentId}"`,
    );
  }

  /* -- R02 · kill switch ------------------------------------------------- */
  // Evaluated early but does NOT short-circuit: an operator unpausing an agent
  // deserves to know what else is wrong before it starts executing.
  if (policy.paused) {
    reasons.push(`${REASON.PAUSED}: agent "${policy.agentId}" is paused`);
  }

  /* -- R03 · action allowlist -------------------------------------------- */
  if (!policy.allowedActions.includes(action.action)) {
    reasons.push(
      `${REASON.ACTION_NOT_ALLOWED}: action "${action.action}" is not in allowedActions [${policy.allowedActions.join(", ")}]`,
    );
  }

  /* -- R04 · asset scope ------------------------------------------------- */
  if (!policy.allowedAssets.includes(action.asset)) {
    reasons.push(
      `${REASON.ASSET_NOT_ALLOWED}: asset "${action.asset}" is not in allowedAssets [${policy.allowedAssets.join(", ")}]`,
    );
  }

  /* -- R05 · recipient allowlist ----------------------------------------- */
  if (RECIPIENT_REQUIRED.has(action.action)) {
    if (!action.recipient) {
      reasons.push(
        `${REASON.RECIPIENT_MISSING}: action "${action.action}" requires a recipient`,
      );
    } else if (!policy.approvedRecipients.includes(action.recipient)) {
      reasons.push(
        `${REASON.RECIPIENT_NOT_APPROVED}: recipient "${action.recipient}" is not in approvedRecipients`,
      );
    }
  }

  /* -- R06 · per-transaction ceiling ------------------------------------- */
  if (action.amount > policy.maximumTransactionAmount) {
    reasons.push(
      `${REASON.ABOVE_TX_LIMIT}: amount ${action.amount} exceeds maximumTransactionAmount ${policy.maximumTransactionAmount}`,
    );
  }

  /* -- R07 · rolling daily ceiling --------------------------------------- */
  // Only spend-bearing actions consume the daily allowance. Reshielding your
  // own funds is not spending, and treating it as such would silently strangle
  // legitimate treasury operations.
  if (SPEND_BEARING.has(action.action)) {
    const projected = action.spentToday + action.amount;
    if (projected > policy.dailySpendingLimit) {
      reasons.push(
        `${REASON.DAILY_LIMIT_EXCEEDED}: projected 24h spend ${projected} (${action.spentToday} + ${action.amount}) exceeds dailySpendingLimit ${policy.dailySpendingLimit}`,
      );
    }
  }

  const allowed = reasons.length === 0;

  /* -- soft band · human confirmation ------------------------------------ */
  // A threshold of 0 disables the band. Confirmation is only meaningful for an
  // otherwise-valid action: a human cannot "approve away" a hard violation, and
  // offering that option would be a dangerous affordance.
  const breachesThreshold =
    policy.approvalThreshold > 0 && action.amount >= policy.approvalThreshold;

  return {
    allowed,
    reasons,
    requiresHumanApproval: allowed && breachesThreshold,
  };
}

/**
 * Convenience wrapper for callers that only need the boolean.
 * Kept separate so no call site can accidentally ignore `reasons`.
 */
export const isAllowed = (a: AgentAction, p: AgentPolicy): boolean =>
  validateAction(a, p).allowed;
