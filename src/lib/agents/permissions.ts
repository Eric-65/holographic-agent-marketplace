/**
 * Permission model per TASK 5, 8, 18
 * Separate: CAPABILITY (what agent supports), PERMISSION (what deployment allows), POLICY (what owner permits)
 */

import type { CapabilityId } from "./capabilities";
import type { AgentPolicy } from "../policy/model";

export interface AgentCapability {
  id: CapabilityId;
  supported: boolean;
}

export interface DeploymentPermission {
  id: string;
  label: string;
  allowed: boolean;
  value?: string;
  source: "capability" | "policy" | "recipient";
}

export interface PermissionModel {
  agentId: string;
  deploymentId: string;
  capabilities: AgentCapability[];
  permissions: DeploymentPermission[];
  policy: AgentPolicy;
  // Actual authority — intersection of capability + permission + policy
  actualAuthority: {
    capabilities: CapabilityId[];
    assets: string[];
    maxTransaction: number;
    dailyLimit: number;
    approvalThreshold: number;
    approvedRecipients: string[];
    canModifyPolicy: boolean;
    canAddRecipients: boolean;
    canBypassPolicy: boolean;
    canAccessWalletAuthority: boolean;
  };
}

export function buildPermissionModel(
  agentId: string,
  deploymentId: string,
  agentCapabilities: string[],
  policy: AgentPolicy,
): PermissionModel {
  const capabilities: AgentCapability[] = agentCapabilities.map((cap) => ({
    id: cap as CapabilityId,
    supported: true,
  }));

  const permissions: DeploymentPermission[] = [
    ...policy.allowedAssets.map((asset) => ({
      id: `asset_${asset}`,
      label: asset,
      allowed: true,
      value: asset,
      source: "policy" as const,
    })),
    ...policy.approvedRecipients.map((recipient) => ({
      id: `recipient_${recipient}`,
      label: `Recipient ${recipient.slice(0, 8)}...`,
      allowed: true,
      value: recipient,
      source: "recipient" as const,
    })),
    {
      id: "max_transaction",
      label: `$${policy.maximumTransactionAmount / 1_000_000} maximum`,
      allowed: true,
      value: `${policy.maximumTransactionAmount}`,
      source: "policy",
    },
    {
      id: "daily_limit",
      label: `$${policy.dailySpendingLimit / 1_000_000} / day`,
      allowed: true,
      value: `${policy.dailySpendingLimit}`,
      source: "policy",
    },
    {
      id: "modify_policy",
      label: "Policy modification",
      allowed: false,
      source: "capability",
    },
    {
      id: "add_recipients",
      label: "Add recipients",
      allowed: false,
      source: "capability",
    },
    {
      id: "bypass_policy",
      label: "Bypass policy",
      allowed: false,
      source: "capability",
    },
    {
      id: "wallet_authority",
      label: "Unrestricted wallet authority",
      allowed: false,
      source: "capability",
    },
  ];

  // Actual authority is intersection — agent must never infer additional authority
  const actualAuthority = {
    capabilities: agentCapabilities.filter((c) => ["PRIVATE_TRANSFER", "PRIVATE_DISTRIBUTION", "PAYMENT_SCHEDULING"].includes(c)) as CapabilityId[],
    assets: policy.allowedAssets,
    maxTransaction: policy.maximumTransactionAmount,
    dailyLimit: policy.dailySpendingLimit,
    approvalThreshold: policy.approvalThreshold,
    approvedRecipients: policy.approvedRecipients,
    canModifyPolicy: false,
    canAddRecipients: false,
    canBypassPolicy: false,
    canAccessWalletAuthority: false,
  };

  return {
    agentId,
    deploymentId,
    capabilities,
    permissions,
    policy,
    actualAuthority,
  };
}

export function validatePermission(
  permission: DeploymentPermission,
  agentCapabilities: string[],
): { valid: boolean; reason?: string } {
  // If agent does not support PRIVATE_DISTRIBUTION, do not allow distribution permissions
  if (permission.label.toLowerCase().includes("distribution") && !agentCapabilities.includes("PRIVATE_DISTRIBUTION")) {
    return { valid: false, reason: "Agent does not support PRIVATE_DISTRIBUTION — cannot enable distribution permissions" };
  }
  if (permission.label.toLowerCase().includes("recipient") && permission.allowed === false) {
    // Disallow unapproved recipients — this is correct, not an error
    return { valid: true };
  }
  return { valid: true };
}

export function validatePermissions(
  permissions: DeploymentPermission[],
  agentCapabilities: string[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const perm of permissions) {
    const result = validatePermission(perm, agentCapabilities);
    if (!result.valid) errors.push(result.reason ?? `Invalid permission ${perm.id}`);
  }
  return { valid: errors.length === 0, errors };
}
