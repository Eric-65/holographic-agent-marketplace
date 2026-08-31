/**
 * Agent composition preparation — future interface for Agent A → Agent B workflows
 * Do NOT allow Agent A → directly instruct Agent B → transfer funds without explicit policy and approval layer
 * This is future preparation only, not autonomous agent-to-agent financial transactions
 */

import type { TreasuryTransferIntent } from "../intent/model";
import type { CapabilityId } from "./capabilities";

export interface CompositionStep {
  agentId: string;
  capability: CapabilityId;
  intent: TreasuryTransferIntent;
  dependsOn?: string; // previous step id
}

export interface AgentComposition {
  id: string;
  steps: CompositionStep[];
  policyId: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "EXECUTING" | "COMPLETED" | "FAILED";
  createdAt: number;
}

export interface CompositionValidation {
  valid: boolean;
  errors: string[];
}

export function validateComposition(composition: AgentComposition): CompositionValidation {
  const errors: string[] = [];

  // Rule: Agent A cannot directly instruct Agent B to transfer funds without explicit policy and approval
  for (let i = 0; i < composition.steps.length; i++) {
    const step = composition.steps[i];
    if (i > 0) {
      const prev = composition.steps[i - 1];
      if (step.dependsOn && step.dependsOn !== prev.intent.id) {
        errors.push(`Composition step ${step.agentId} depends on ${step.dependsOn} but previous is ${prev.intent.id} — invalid dependency`);
      }
      // Check if Agent A is trying to directly instruct Agent B to transfer without policy
      if (step.intent.action === "transfer" && prev.intent.action === "transfer") {
        // This would be Agent A → Agent B transfer without explicit Holographic policy layer
        // For now, we allow only if both steps share same policyId and policy approves both
        // In real, would require explicit composition policy
        if (composition.policyId !== prev.intent.metadata?.policyId) {
          errors.push(`Agent ${prev.agentId} → directly instruct ${step.agentId} to transfer funds without explicit Holographic policy — rejected. Composition requires policy approval for each step.`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Interface that could eventually support Agent A → proposes work → Agent B → proposes work
export interface ComposableAgent {
  agentId: string;
  proposeNext(currentIntent: TreasuryTransferIntent, context: { policyId: string }): Promise<TreasuryTransferIntent | null>;
}

// Example future agents — not implemented yet, only interface
export const futureCompositionExample = {
  description: "Agent A proposes work → Agent B proposes work, but Agent A cannot directly instruct Agent B to transfer funds without explicit Holographic policy and approval layer",
  allowed: "Agent A proposes intent → Policy Engine approves → Wallet executes → Receipt → Agent B can propose next intent based on receipt (not direct fund transfer)",
  forbidden: "Agent A → directly instruct Agent B → transfer funds without policy",
};
