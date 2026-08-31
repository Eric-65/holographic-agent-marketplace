/**
 * Agent risk profile per TASK 14
 * LOW: Read-only reasoning / low-value controlled operations
 * MEDIUM: Policy-controlled transfers
 * HIGH: Large-value or complex financial workflows
 * Risk calculated from declared capabilities and policy requirements where possible
 * Do not rely solely on creator-provided risk labels
 */

import type { AgentManifest } from "./manifest";
import { capabilityRiskWeight } from "./capabilities";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskProfile {
  declaredRisk: RiskLevel;
  calculatedRisk: RiskLevel;
  riskScore: number; // 0-10
  reasons: string[];
  factors: {
    capabilities: { id: string; weight: number }[];
    policyRequirements: string[];
    assetCount: number;
    maxTransaction: number;
  };
}

export function calculateRisk(manifest: AgentManifest): RiskProfile {
  const reasons: string[] = [];
  let riskScore = 0;

  // Factor 1: capabilities risk weights
  const capabilityWeights = manifest.capabilities.map((cap) => ({
    id: cap,
    weight: capabilityRiskWeight(cap),
  }));
  const capRisk = capabilityWeights.reduce((sum, c) => sum + c.weight, 0);
  riskScore += capRisk;
  if (capRisk >= 6) reasons.push(`High-risk capabilities: ${manifest.capabilities.filter((c) => capabilityRiskWeight(c) >= 3).join(", ")}`);
  else if (capRisk >= 3) reasons.push(`Medium-risk capabilities: ${manifest.capabilities.join(", ")}`);
  else reasons.push(`Low-risk capabilities: ${manifest.capabilities.join(", ")}`);

  // Factor 2: policy requirements
  const policyReqCount = manifest.policyRequirements.length;
  riskScore += policyReqCount * 0.5;
  if (policyReqCount >= 5) reasons.push(`Complex policy requirements: ${manifest.policyRequirements.join(", ")}`);

  // Factor 3: supported assets count
  const assetCount = manifest.supportedAssets.length;
  riskScore += assetCount * 0.3;
  if (assetCount >= 3) reasons.push(`Multiple assets supported: ${manifest.supportedAssets.join(", ")} — increases risk surface`);

  // Factor 4: max transaction amount
  const maxTx = manifest.policyRequirements.includes("MAX_TRANSACTION" as any) ? manifest.policyRequirements.length : 0;
  // For actual max, we'd read from policy doc, but for manifest we use heuristic
  // If agent supports PRIVATE_DISTRIBUTION, higher risk
  if (manifest.capabilities.includes("PRIVATE_DISTRIBUTION")) {
    riskScore += 2;
    reasons.push("Supports PRIVATE_DISTRIBUTION — batch operations increase risk");
  }

  // Normalize riskScore 0-10
  riskScore = Math.min(10, Math.max(0, riskScore));

  let calculatedRisk: RiskLevel = "LOW";
  if (riskScore >= 7) calculatedRisk = "HIGH";
  else if (riskScore >= 3) calculatedRisk = "MEDIUM";
  else calculatedRisk = "LOW";

  // Compare declared vs calculated
  if (manifest.riskLevel !== calculatedRisk) {
    reasons.push(`Declared risk ${manifest.riskLevel} differs from calculated ${calculatedRisk} — using calculated for safety`);
  }

  return {
    declaredRisk: manifest.riskLevel as RiskLevel,
    calculatedRisk,
    riskScore,
    reasons,
    factors: {
      capabilities: capabilityWeights,
      policyRequirements: manifest.policyRequirements as string[],
      assetCount,
      maxTransaction: maxTx,
    },
  };
}

export function getRiskLabel(risk: RiskLevel): { label: string; description: string } {
  switch (risk) {
    case "LOW":
      return { label: "LOW", description: "Read-only reasoning / low-value controlled operations" };
    case "MEDIUM":
      return { label: "MEDIUM", description: "Policy-controlled transfers" };
    case "HIGH":
      return { label: "HIGH", description: "Large-value or complex financial workflows" };
  }
}
