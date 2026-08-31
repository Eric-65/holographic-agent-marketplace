import { poseidonish } from "../hash";
import type { Agent, PolicyDocument, PolicyRecord } from "../types";
import { MOCK_AGENTS } from "./agents";

export function defaultPolicy(agent: Agent): PolicyDocument {
  return {
    version: 1,
    agentId: agent.id,
    allowedActions: [...agent.actionSurface],
    assetScope: [...agent.assets],
    venueAllowlist: [...agent.venues],
    perActionCapUsd: 5_000,
    dailyCapUsd: 25_000,
    cooldownSeconds: 30,
    maxSlippageBps: 75,
    confirmAboveUsd: 10_000,
    counterpartyDenyList: ["0x0d3f…sanctioned"],
    requireDisclosureReceipt: true,
    killSwitch: false,
  };
}

const record = (
  agent: Agent,
  label: string,
  overrides: Partial<PolicyDocument>,
  status: PolicyRecord["status"],
  ageHours: number,
  commit?: boolean,
): PolicyRecord => {
  const doc = { ...defaultPolicy(agent), ...overrides };
  return {
    id: `pol_${agent.id}_${status}_${doc.version}`,
    agentId: agent.id,
    label,
    doc,
    docHash: poseidonish(doc),
    createdAt: Date.now() - ageHours * 3_600_000,
    onchainCommitTx: commit ? poseidonish({ c: agent.id, v: doc.version }) : undefined,
    status,
  };
};

export const MOCK_POLICIES: PolicyRecord[] = [
  record(MOCK_AGENTS[0], "Conservative vault rotation", { perActionCapUsd: 25_000, dailyCapUsd: 120_000, cooldownSeconds: 900 }, "active", 72, true),
  record(MOCK_AGENTS[1], "BTC accumulation — 90 day", { perActionCapUsd: 2_500, dailyCapUsd: 10_000, cooldownSeconds: 3600, maxSlippageBps: 40 }, "active", 240, true),
  record(MOCK_AGENTS[2], "Contributor payroll Q3", { perActionCapUsd: 18_000, dailyCapUsd: 90_000, cooldownSeconds: 60, confirmAboveUsd: 15_000 }, "active", 18, true),
  record(MOCK_AGENTS[3], "Hedge — tight leash", { perActionCapUsd: 4_000, dailyCapUsd: 12_000, cooldownSeconds: 1800, maxSlippageBps: 30, confirmAboveUsd: 2_000 }, "draft", 3),
  record(MOCK_AGENTS[4], "Quarterly grants", { perActionCapUsd: 5_000, dailyCapUsd: 20_000, cooldownSeconds: 300 }, "active", 500, true),
  record(MOCK_AGENTS[5], "Leverage guardrails", { perActionCapUsd: 30_000, dailyCapUsd: 60_000, killSwitch: true }, "superseded", 900, true),
];
