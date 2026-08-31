/**
 * Agent manifest formalized per TASK 7
 * Example:
 * {
 *   "id": "holographic.treasury",
 *   "name": "Holographic Treasury Agent",
 *   "version": "1.0.0",
 *   "creator": "...",
 *   "category": "TREASURY",
 *   "capabilities": ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT"],
 *   "supportedAssets": ["USDC"],
 *   "riskLevel": "LOW",
 *   "policyRequirements": ["MAX_TRANSACTION", "DAILY_LIMIT", "APPROVED_RECIPIENTS"]
 * }
 */

import { validateCapabilities } from "./capabilities";

export const AGENT_CATEGORIES = ["TREASURY", "PAYMENTS", "DISTRIBUTION", "COMPLIANCE", "PROCUREMENT", "ANALYTICS", "Yield", "Accumulation", "Risk", "Credit"] as const;
export type AgentCategoryId = typeof AGENT_CATEGORIES[number];

export const POLICY_REQUIREMENTS = [
  "MAX_TRANSACTION",
  "DAILY_LIMIT",
  "APPROVED_RECIPIENTS",
  "ALLOWED_ASSETS",
  "HUMAN_APPROVAL",
  "PAUSE_CAPABILITY",
  "COOLDOWN",
  "SLIPPAGE_BOUND",
] as const;
export type PolicyRequirementId = typeof POLICY_REQUIREMENTS[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

export const SUPPORTED_ASSETS = ["USDC", "STRK", "ETH", "strkBTC", "STRK", "USDC"] as const;

export interface AgentManifest {
  id: string;
  name: string;
  version: string; // semver
  description: string;
  creator: string;
  creatorWallet?: string;
  category: AgentCategoryId;
  capabilities: string[];
  supportedAssets: string[];
  riskLevel: RiskLevel;
  policyRequirements: PolicyRequirementId[];
  privacyRequirements?: {
    requiresPrivacy: boolean;
    disclosureAvailable?: boolean;
  };
  requiredPermissions?: string[];
  verification?: {
    audited: boolean;
    auditedBy?: string;
    verificationStatus: "VERIFIED" | "PENDING" | "FAILED" | "NOT_AVAILABLE";
  };
  metadata?: Record<string, unknown>;
}

export function validateSemver(version: string): boolean {
  // Simple semver check: x.y.z
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(version);
}

export function validateAgentId(id: string): boolean {
  // Must be non-empty, lowercase with dots/dashes, no spaces
  return /^[a-z0-9.-]{3,64}$/.test(id);
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateAgentManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof manifest !== "object" || manifest === null) {
    return { valid: false, errors: ["Manifest must be an object"], warnings: [] };
  }

  const m = manifest as Partial<AgentManifest>;

  if (!m.id) errors.push("missing ID — agent must have id");
  else if (!validateAgentId(m.id)) errors.push(`invalid ID "${m.id}" — must be lowercase alphanumeric with dots/dashes, 3-64 chars`);

  if (!m.name) errors.push("missing name");
  else if (m.name.length < 3 || m.name.length > 80) errors.push("invalid name length — must be 3-80 chars");

  if (!m.version) errors.push("invalid version — missing version");
  else if (!validateSemver(m.version)) errors.push(`invalid version "${m.version}" — must be semver x.y.z`);

  if (!m.description) errors.push("missing description");
  else if (m.description.length < 20) errors.push("description too short — must be at least 20 chars");

  if (!m.creator) errors.push("missing creator");

  if (!m.category) errors.push("invalid category — missing category");
  else if (!(AGENT_CATEGORIES as readonly string[]).includes(m.category)) errors.push(`invalid category "${m.category}" — allowed: ${AGENT_CATEGORIES.join(", ")} — duplicate version check via version must be unique per agent`);

  if (!m.capabilities) errors.push("missing capabilities");
  else {
    const capResult = validateCapabilities(m.capabilities);
    if (!capResult.valid) {
      errors.push(capResult.reason ?? "invalid capabilities");
      if (capResult.invalid) errors.push(`unsupported capability: ${capResult.invalid.join(", ")}`);
    }
  }

  if (!m.supportedAssets || !Array.isArray(m.supportedAssets) || m.supportedAssets.length === 0) {
    errors.push("unsupported asset — missing supportedAssets, agent must declare at least one asset");
  } else {
    const knownAssets = ["USDC", "STRK", "ETH", "strkBTC"];
    const unknownAssets = m.supportedAssets.filter((a) => !knownAssets.includes(a));
    if (unknownAssets.length > 0) {
      errors.push(`unsupported asset: ${unknownAssets.join(", ")} — allowed: ${knownAssets.join(", ")}`);
    }
  }

  if (!m.riskLevel) errors.push("missing riskLevel");
  else if (!(RISK_LEVELS as readonly string[]).includes(m.riskLevel)) errors.push(`invalid riskLevel "${m.riskLevel}" — must be LOW, MEDIUM, HIGH`);

  if (!m.policyRequirements) errors.push("unknown policy requirement — missing policyRequirements");
  else {
    const unknownReq = m.policyRequirements.filter((r) => !(POLICY_REQUIREMENTS as readonly string[]).includes(r as string));
    if (unknownReq.length > 0) {
      errors.push(`unknown policy requirement: ${unknownReq.join(", ")} — allowed: ${POLICY_REQUIREMENTS.join(", ")}`);
    }
  }

  // Warnings for best practices
  if (m.capabilities?.includes("PRIVATE_TRANSFER") && !m.supportedAssets?.includes("USDC")) {
    warnings.push("Agent supports PRIVATE_TRANSFER but does not support USDC — consider adding USDC for vendor payments");
  }

  if (m.riskLevel === "LOW" && m.capabilities?.some((c) => ["PRIVATE_DISTRIBUTION"].includes(c))) {
    warnings.push("Declared LOW risk but capabilities include distribution — calculated risk may be MEDIUM");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isManifestValid(manifest: unknown): boolean {
  return validateAgentManifest(manifest).valid;
}
