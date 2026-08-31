/**
 * Secure Agent Runtime per TASK 6, 20, 25
 * Defines clean runtime boundary: Agent Runtime → receives user instruction → produces structured intent → validates capability → sends to policy engine
 * Must NOT: sign, send raw blockchain transactions, modify policies, modify recipients, modify permissions, access viewing keys, private keys, execute STRK20 directly
 * Only Holographic's controlled execution service can continue after policy approval
 */

import type { CapabilityId } from "./capabilities";
import { validateIntentCapability } from "./capabilities";
import { validateUniversalIntent, type UniversalIntent } from "./sdk";
import type { AgentContext, IntentProposal, AgentSDK } from "./sdk";
import { validateAction } from "../policy/validateAction";

export interface RuntimeValidationResult {
  valid: boolean;
  errors: string[];
  capabilityAllowed: boolean;
  policyAllowed?: boolean;
  policyResult?: ReturnType<typeof validateAction>;
}

export class SecureAgentRuntime {
  /**
   * Receives user instruction, executes agent logic, proposes structured intent, returns proposal
   * Does NOT sign, does NOT call wallet APIs directly, does NOT modify policy/recipients/permissions, does NOT access viewing keys/private keys, does NOT execute STRK20 directly
   */
  async proposeIntent(
    userInstruction: string,
    agent: AgentSDK,
    context: AgentContext,
  ): Promise<{ proposal: IntentProposal | null; validation: RuntimeValidationResult }> {
    const errors: string[] = [];

    // 1. Validate agent can handle instruction (capability check)
    const proposal = await agent.propose(userInstruction, context);
    if (!proposal) {
      return {
        proposal: null,
        validation: {
          valid: false,
          errors: ["Agent could not produce intent from instruction — invalid intent"],
          capabilityAllowed: false,
        },
      };
    }

    // 2. Validate universal intent schema before policy engine receives it
    const universalIntent: UniversalIntent = {
      agentId: proposal.intent.agentId,
      agentVersion: (proposal.intent.metadata?.agentVersion as string) ?? agent.getVersion(),
      action: proposal.capability,
      asset: proposal.intent.asset,
      recipient: proposal.intent.recipient,
      amount: proposal.intent.amount.toString(), // integer as string
      reason: proposal.intent.reason,
      requestedAt: proposal.intent.requestedAt,
      metadata: {
        nonce: (proposal.intent.metadata?.nonce as number) ?? Math.floor(Math.random() * 1e6),
        venue: (proposal.intent.metadata?.venue as string) ?? "STRK20 Pool",
        policyId: context.policyId,
        deploymentId: context.deploymentId,
      },
    };

    const schemaValidation = validateUniversalIntent(universalIntent);
    if (!schemaValidation.valid) {
      errors.push(...schemaValidation.errors);
    }

    // 3. Capability validation — every proposed action must correspond to registered capability
    const capabilityAllowed = validateIntentCapability(proposal.capability, agent.getCapabilities() as string[]);
    if (!capabilityAllowed) {
      errors.push(`Capability mismatch: intent ${proposal.capability} not in agent capabilities [${agent.getCapabilities().join(", ")}] — rejected`);
    }

    // 4. Check agent capabilities vs requested operation
    // Example: Agent capability PRIVATE_TRANSFER but intent PRIVATE_DISTRIBUTION → rejected
    if (proposal.intent.action === "transfer" && !agent.getCapabilities().includes("PRIVATE_TRANSFER" as CapabilityId)) {
      errors.push(`Agent capability PRIVATE_TRANSFER required for transfer intent, but agent only has [${agent.getCapabilities().join(", ")}]`);
    }

    // 5. Policy engine is authoritative — but we do NOT call wallet here, only capability
    // For runtime validation, we only validate capability, policy is evaluated in execution pipeline separate service

    const validation: RuntimeValidationResult = {
      valid: errors.length === 0 && capabilityAllowed,
      errors,
      capabilityAllowed,
    };

    return { proposal: validation.valid ? proposal : null, validation };
  }

  /**
   * Validates capability before activation — per TASK 7, 18
   * If agent does not support PRIVATE_DISTRIBUTION, do not show or enable distribution permissions
   */
  validateCapabilitiesForPermissions(
    agentCapabilities: string[],
    requestedPermissions: string[],
  ): { allowed: string[]; rejected: { permission: string; reason: string }[] } {
    const allowed: string[] = [];
    const rejected: { permission: string; reason: string }[] = [];

    for (const perm of requestedPermissions) {
      const permUpper = perm.toUpperCase();
      if (permUpper.includes("DISTRIBUTION") && !agentCapabilities.includes("PRIVATE_DISTRIBUTION")) {
        rejected.push({ permission: perm, reason: "Agent does not support PRIVATE_DISTRIBUTION" });
      } else if (permUpper.includes("TRANSFER") && !agentCapabilities.includes("PRIVATE_TRANSFER") && !agentCapabilities.includes("TREASURY_MANAGEMENT")) {
        rejected.push({ permission: perm, reason: "Agent does not support PRIVATE_TRANSFER" });
      } else {
        allowed.push(perm);
      }
    }

    return { allowed, rejected };
  }

  /**
   * Security boundary check — per TASK 19, 25
   * Agent must NOT receive unrestricted access to private keys, seed phrases, viewing keys, wallet credentials
   * Execution architecture: Agent → Intent → Policy Engine → Approval if required → Wallet → STRK20
   */
  enforceSecurityBoundary(agentId: string, operation: string): { allowed: boolean; reason?: string } {
    const forbiddenOperations = [
      "sign",
      "signTransaction",
      "sendTransaction",
      "modifyPolicy",
      "modifyRecipients",
      "modifyPermissions",
      "accessViewingKeys",
      "accessPrivateKeys",
      "accessSeedPhrase",
      "accessWalletCredentials",
      "executeSTRK20Directly",
      "callWalletApiDirectly",
    ];

    if (forbiddenOperations.some((op) => operation.toLowerCase().includes(op.toLowerCase()))) {
      return {
        allowed: false,
        reason: `Security boundary violation: Agent ${agentId} attempted ${operation} — agents must NOT sign, send raw blockchain transactions, modify policies/recipients/permissions, access viewing keys/private keys, execute STRK20 directly. Only Holographic's controlled execution service can continue after policy approval.`,
      };
    }

    return { allowed: true };
  }
}

export const agentRuntime = new SecureAgentRuntime();
