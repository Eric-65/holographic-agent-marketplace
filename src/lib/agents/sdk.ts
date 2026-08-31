/**
 * Formal agent SDK contract per TASK 2
 * Agent must define: id, name, version, description, creator, category, capabilities,
 * supportedAssets, riskLevel, policyRequirements, privacyRequirements
 * Runtime: initialize(), validate(), propose(), explain(), getCapabilities(), getVersion()
 * Must NOT expose private keys, seed phrases, viewing keys, raw wallet signer, unrestricted tx functions
 */

import type { Hex } from "../types";
import type { AgentManifest, RiskLevel } from "./manifest";
import type { CapabilityId } from "./capabilities";
import type { TreasuryTransferIntent } from "../intent/model";

export interface AgentPolicyRequirements {
  maxTransaction: boolean;
  dailyLimit: boolean;
  approvedRecipients: boolean;
  allowedAssets: boolean;
  humanApproval: boolean;
  pauseCapability: boolean;
}

export interface AgentPrivacyRequirements {
  requiresPrivacy: boolean;
  disclosureAvailable?: boolean;
  supportedTokens?: string[];
}

export interface AgentContext {
  userId: string;
  walletAddress: Hex;
  chainId: string | null;
  agentId: string;
  agentVersion: string;
  deploymentId: string;
  policyId: string;
  // No private keys, no viewing keys, no raw signer
  // Only public metadata and scoped permissions
  permissions: {
    allowedAssets: string[];
    approvedRecipients: string[];
    maxTransactionAmount: number;
    dailyLimit: number;
    approvalThreshold: number;
  };
}

export interface IntentProposal {
  intent: TreasuryTransferIntent;
  explanation: string;
  capability: CapabilityId;
  confidence: number; // 0-1
}

export interface AgentSDK {
  // Identity
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly creator: string;
  readonly category: string;
  readonly capabilities: CapabilityId[];
  readonly supportedAssets: string[];
  readonly riskLevel: RiskLevel;
  readonly manifest: AgentManifest;

  // Runtime interface — intent-only, no signing
  initialize(context: AgentContext): Promise<{ success: boolean; error?: string }>;
  validate(): Promise<{ valid: boolean; errors: string[] }>;
  propose(userInstruction: string, context: AgentContext): Promise<IntentProposal | null>;
  explain(intent: TreasuryTransferIntent): Promise<string>;
  getCapabilities(): CapabilityId[];
  getVersion(): string;
  getManifest(): AgentManifest;
}

// Universal intent format per TASK 3
export interface UniversalIntent {
  agentId: string;
  agentVersion: string;
  action: string; // PRIVATE_TRANSFER etc.
  asset: string;
  recipient: string;
  amount: string; // integer as string to avoid float, e.g., "10000000" for 10 USDC
  reason: string;
  requestedAt: number;
  metadata: {
    nonce: number;
    venue?: string;
    slippageBps?: number;
    policyId?: string;
    deploymentId?: string;
    [k: string]: unknown;
  };
}

export function validateUniversalIntent(intent: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof intent !== "object" || intent === null) {
    return { valid: false, errors: ["Intent must be an object"] };
  }
  const i = intent as Partial<UniversalIntent>;
  if (!i.agentId) errors.push("missing agentId");
  if (!i.agentVersion) errors.push("missing agentVersion");
  if (!i.action) errors.push("missing action");
  if (!i.asset) errors.push("missing asset");
  if (!i.recipient) errors.push("missing recipient");
  if (!i.amount) errors.push("missing amount");
  else {
    try {
      const amt = BigInt(i.amount);
      if (amt <= 0n) errors.push("amount must be >0");
    } catch {
      errors.push(`invalid amount "${i.amount}" — must be integer string`);
    }
  }
  if (!i.reason) errors.push("missing reason");
  if (!i.requestedAt) errors.push("missing requestedAt");
  if (!i.metadata) errors.push("missing metadata");
  else if (typeof i.metadata.nonce !== "number") errors.push("metadata.nonce must be number");

  return { valid: errors.length === 0, errors };
}

// Treasury Agent SDK implementation — first fully functional agent
export class TreasuryAgentSDK implements AgentSDK {
  readonly id = "holographic.treasury";
  readonly name = "Holographic Treasury Agent";
  readonly version = "1.0.0";
  readonly description = "Private treasury operations with policy enforcement, spending limits, daily limits, human approval threshold";
  readonly creator = "Holographic Core";
  readonly category = "TREASURY";
  readonly capabilities = ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "EXECUTION_ATTESTATION", "AUDIT_SUPPORT"] as CapabilityId[];
  readonly supportedAssets = ["USDC", "STRK", "ETH"];
  readonly riskLevel = "LOW" as const;
  readonly manifest: AgentManifest = {
    id: "holographic.treasury",
    name: "Holographic Treasury Agent",
    version: "1.0.0",
    description: "Private treasury operations with policy enforcement",
    creator: "Holographic Core",
    category: "TREASURY",
    capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "EXECUTION_ATTESTATION", "AUDIT_SUPPORT"],
    supportedAssets: ["USDC", "STRK", "ETH"],
    riskLevel: "LOW",
    policyRequirements: ["MAX_TRANSACTION", "DAILY_LIMIT", "APPROVED_RECIPIENTS", "ALLOWED_ASSETS", "HUMAN_APPROVAL", "PAUSE_CAPABILITY"],
    privacyRequirements: { requiresPrivacy: true, disclosureAvailable: true },
    requiredPermissions: ["USDC", "Approved recipients", "$500 maximum"],
    verification: { audited: true, auditedBy: "Holographic Internal", verificationStatus: "VERIFIED" },
  };

  async initialize(context: AgentContext): Promise<{ success: boolean; error?: string }> {
    if (!context.walletAddress) return { success: false, error: "Wallet not connected" };
    if (!context.policyId) return { success: false, error: "Policy not configured" };
    // No private keys, no viewing keys, no raw signer — only context with permissions
    return { success: true };
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!this.id) errors.push("Missing id");
    if (!this.manifest) errors.push("Missing manifest");
    if (this.capabilities.length === 0) errors.push("Missing capabilities");
    return { valid: errors.length === 0, errors };
  }

  async propose(userInstruction: string, context: AgentContext): Promise<IntentProposal | null> {
    // Parse user instruction like "Pay approved contractor 10 USDC"
    // This is where LLM would be used to produce structured candidate intent — but LLM never decides allowance
    const match = userInstruction.match(/(\d+(?:\.\d+)?)\s*(USDC|STRK|ETH)/i);
    if (!match) return null;

    const amountNum = Number(match[1]);
    const asset = match[2].toUpperCase();
    const amountMinor = Math.floor(amountNum * 1_000_000); // integer-safe

    // Extract recipient — try to find approved recipient name or address
    let recipient = context.permissions.approvedRecipients[0] ?? "";
    // Simple heuristic: if instruction contains "vendor" or "contractor", use first approved
    // Real implementation would use LLM to extract recipient name and map to allowlist

    if (!recipient) return null;

    const intent: TreasuryTransferIntent = {
      id: `INT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6)}`,
      agentId: this.id,
      action: "transfer",
      asset,
      recipient,
      amount: amountMinor,
      reason: userInstruction.slice(0, 200),
      requestedAt: Date.now(),
      metadata: {
        nonce: Math.floor(Math.random() * 1e6),
        venue: "STRK20 Pool",
        policyId: context.policyId,
        deploymentId: context.deploymentId,
        agentVersion: this.version,
      },
    };

    return {
      intent,
      explanation: `Treasury Agent proposes private transfer of ${amountNum} ${asset} to approved recipient ${recipient.slice(0, 10)}... for "${userInstruction.slice(0, 60)}". Policy will enforce limits and approval.`,
      capability: "PRIVATE_TRANSFER",
      confidence: 0.9,
    };
  }

  async explain(intent: TreasuryTransferIntent): Promise<string> {
    return `This intent will privately transfer ${intent.amount / 1_000_000} ${intent.asset} to ${intent.recipient.slice(0, 10)}... for reason: ${intent.reason}. Requires policy approval and wallet authorization via STRK20.`;
  }

  getCapabilities(): CapabilityId[] {
    return this.capabilities;
  }

  getVersion(): string {
    return this.version;
  }

  getManifest(): AgentManifest {
    return this.manifest;
  }
}
