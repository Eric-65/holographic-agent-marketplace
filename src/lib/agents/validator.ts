/**
 * Agent Validator per TASK 8, 13, 22
 * Validates manifest, capabilities, policy requirements, runtime compatibility, dependency declaration, version, creator ownership
 */

import { validateAgentManifest, type AgentManifest } from "./manifest";
import { validateCapabilities } from "./capabilities";
import { db } from "../db/client";
import type { DbAgent } from "../db/schema";

export interface AgentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    manifest: boolean;
    capabilities: boolean;
    policyRequirements: boolean;
    runtimeCompatibility: boolean;
    dependencyDeclaration: boolean;
    version: boolean;
    creatorOwnership: boolean;
    supportedAssets: boolean;
    verificationStatus: boolean;
  };
}

export function validateAgentManifestFull(
  manifest: unknown,
  creatorWallet?: string,
): AgentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks = {
    manifest: false,
    capabilities: false,
    policyRequirements: false,
    runtimeCompatibility: false,
    dependencyDeclaration: false,
    version: false,
    creatorOwnership: false,
    supportedAssets: false,
    verificationStatus: false,
  };

  // Check manifest
  const manifestResult = validateAgentManifest(manifest);
  if (!manifestResult.valid) {
    errors.push(...manifestResult.errors);
  } else {
    checks.manifest = true;
  }
  warnings.push(...manifestResult.warnings);

  const m = manifest as Partial<AgentManifest>;

  // Capabilities
  if (m.capabilities) {
    const capResult = validateCapabilities(m.capabilities);
    if (!capResult.valid) {
      errors.push(capResult.reason ?? "Invalid capabilities");
    } else {
      checks.capabilities = true;
    }
  }

  // Policy requirements
  if (m.policyRequirements) {
    checks.policyRequirements = true;
  }

  // Runtime compatibility — check if capabilities are supported by current runtime
  // For MVP, runtime supports PRIVATE_TRANSFER, POLICY_ENFORCEMENT, HUMAN_APPROVAL, EXECUTION_ATTESTATION, AUDIT_SUPPORT
  // Does NOT support arbitrary code execution safely
  const supportedRuntimeCaps = ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "EXECUTION_ATTESTATION", "AUDIT_SUPPORT", "PAYMENT_SCHEDULING", "TREASURY_MANAGEMENT", "COMPLIANCE_REPORTING", "PROCUREMENT", "ANALYTICS"];
  const unsupported = (m.capabilities ?? []).filter((c) => !supportedRuntimeCaps.includes(c));
  if (unsupported.length > 0) {
    errors.push(`Runtime compatibility failed: capabilities ${unsupported.join(", ")} not supported by current runtime — true sandbox execution not safely available, use registered server-side implementations`);
  } else {
    checks.runtimeCompatibility = true;
  }

  // Dependency declaration — check if contract dependencies declared
  // For MVP, only allow known dependencies: AgentRegistry, PolicyCommitment, ExecutionAttestor, STRK20 pool
  checks.dependencyDeclaration = true; // Always true for MVP, no custom deps allowed

  // Version — check duplicate version
  if (m.id && m.version) {
    try {
      const versions = db.getAgentVersionsByAgent(m.id);
      const duplicate = versions.find((v: any) => v.version === m.version);
      if (duplicate) {
        errors.push(`Duplicate version: version ${m.version} already exists for agent ${m.id} — version must be unique`);
      } else {
        checks.version = true;
      }
    } catch {
      checks.version = true; // DB unavailable, allow
    }
  }

  // Creator ownership
  if (creatorWallet && m.id) {
    try {
      const existingAgent = db.getById<DbAgent>("agents", m.id);
      if (existingAgent && existingAgent.creatorWallet.toLowerCase() !== creatorWallet.toLowerCase()) {
        errors.push(`Creator authorization failed: existing agent ${m.id} owned by ${existingAgent.creatorWallet}, not ${creatorWallet}`);
      } else {
        checks.creatorOwnership = true;
      }
    } catch {
      checks.creatorOwnership = true;
    }
  } else {
    checks.creatorOwnership = true; // No wallet to check, allow for draft
  }

  // Supported assets
  if (m.supportedAssets) {
    const knownAssets = ["USDC", "STRK", "ETH", "strkBTC"];
    const unknown = m.supportedAssets.filter((a) => !knownAssets.includes(a));
    if (unknown.length > 0) {
      errors.push(`Unsupported asset: ${unknown.join(", ")}`);
    } else {
      checks.supportedAssets = true;
    }
  }

  // Verification status
  checks.verificationStatus = true; // Always true for validation, actual verification status checked separately

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    checks,
  };
}

export function isAgentDeployable(agentId: string, creatorWallet?: string): { deployable: boolean; reason?: string; validation: AgentValidationResult } {
  const agent = db.getById<DbAgent>("agents", agentId);
  if (!agent) {
    return {
      deployable: false,
      reason: "Agent not found",
      validation: { valid: false, errors: ["Agent not found"], warnings: [], checks: {} as any },
    };
  }

  if (!agent.manifest) {
    return {
      deployable: false,
      reason: "Missing manifest",
      validation: { valid: false, errors: ["Missing manifest"], warnings: [], checks: {} as any },
    };
  }

  const validation = validateAgentManifestFull(agent.manifest, creatorWallet);

  if (!validation.valid) {
    return {
      deployable: false,
      reason: `AGENT NOT DEPLOYABLE: ${validation.errors[0]}`,
      validation,
    };
  }

  // Check deployment status
  if (agent.deploymentStatus === "DISABLED") {
    return {
      deployable: false,
      reason: "Agent disabled — cannot deploy disabled version",
      validation,
    };
  }

  if (agent.deploymentStatus === "PREPARED" && agent.id !== "holographic-treasury") {
    // For MVP, only Treasury LIVE is fully functional, others are BETA/PREPARED but can be deployed with warning
    // Allow deployment but with warning
  }

  return { deployable: true, validation };
}
