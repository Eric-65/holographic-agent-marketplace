import { db } from "../db/client";
import type { DbAgent, DbAgentVersion, DbAgentCapability, DbAgentMetrics, AgentManifest } from "../db/schema";
import { MOCK_AGENTS } from "../mock/agents";

const INITIAL_AGENTS: DbAgent[] = [
  {
    id: "holographic-treasury",
    name: "Holographic Treasury Agent",
    slug: "treasury",
    description: "Private treasury operations with policy enforcement, spending limits, daily limits, human approval threshold. LIVE — fully functional.",
    creator: "Holographic Core",
    creatorWallet: "0x01f9e8d7c6b5a4930281726354ab9cd0ef123456" as any,
    version: "1.0.0",
    category: "TREASURY",
    capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "EXECUTION_ATTESTATION", "AUDIT_SUPPORT", "SCHEDULED_PAYMENTS", "BUDGETS", "BATCH_PAYMENTS", "WORKFLOW_PARTICIPATION"],
    supportedAssets: ["USDC", "STRK", "ETH"],
    riskLevel: "LOW",
    privacySupport: true,
    verificationStatus: "VERIFIED",
    deploymentStatus: "LIVE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadataHash: "0x7f31a9c40e2b8d55" as any,
    manifest: {
      id: "holographic-treasury",
      name: "Holographic Treasury Agent",
      version: "1.0.0",
      creator: "Holographic Core",
      description: "Private treasury operations",
      category: "TREASURY",
      capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "EXECUTION_ATTESTATION", "AUDIT_SUPPORT", "SCHEDULED_PAYMENTS", "BUDGETS", "BATCH_PAYMENTS", "WORKFLOW_PARTICIPATION"],
      supportedAssets: ["USDC", "STRK", "ETH"],
      requiredPermissions: ["USDC", "Approved recipients", "$500 maximum"],
      policyRequirements: { maxTransactionAmount: 500 * 1_000_000, dailyLimit: 2000 * 1_000_000, approvalThreshold: 500 * 1_000_000, allowedAssets: ["USDC"] },
      riskLevel: "LOW",
      verification: { audited: true, auditedBy: "Holographic Internal", verificationStatus: "VERIFIED" },
    },
  },
  {
    id: "holographic-payment",
    name: "Holographic Payment Agent",
    slug: "payment",
    description: "Policy-controlled vendor/payment workflows with approved-recipient payments and transaction limits. BETA.",
    creator: "Holographic Core",
    creatorWallet: "0x02aa11bb22cc33dd44ee55ff66007788990abcde" as any,
    version: "0.8.0",
    category: "PAYMENTS",
    capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "WORKFLOW_PARTICIPATION"],
    supportedAssets: ["USDC"],
    riskLevel: "MEDIUM",
    privacySupport: true,
    verificationStatus: "PENDING",
    deploymentStatus: "BETA",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadataHash: "0x2b90ce77a1d4f832" as any,
    manifest: {
      id: "holographic-payment",
      name: "Holographic Payment Agent",
      version: "0.8.0",
      creator: "Holographic Core",
      description: "Vendor/payment workflows",
      category: "PAYMENTS",
      capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "HUMAN_APPROVAL", "WORKFLOW_PARTICIPATION"],
      supportedAssets: ["USDC"],
      requiredPermissions: ["USDC", "Approved recipients"],
      policyRequirements: { maxTransactionAmount: 1000 * 1_000_000, dailyLimit: 5000 * 1_000_000, approvalThreshold: 500 * 1_000_000, allowedAssets: ["USDC"] },
      riskLevel: "MEDIUM",
      verification: { audited: true, auditedBy: "Nethermind", verificationStatus: "PENDING" },
    },
  },
  {
    id: "holographic-distribution",
    name: "Holographic Distribution Agent",
    slug: "distribution",
    description: "Private multi-recipient distributions with recipient groups and batch intent generation. PREPARED.",
    creator: "Holographic Core",
    creatorWallet: "0x03de45f6789a0bc1d2e3f4a5b6c7d8e9f0123456" as any,
    version: "0.3.0",
    category: "DISTRIBUTION",
    capabilities: ["PRIVATE_DISTRIBUTION", "POLICY_ENFORCEMENT"],
    supportedAssets: ["USDC", "STRK"],
    riskLevel: "MEDIUM",
    privacySupport: true,
    verificationStatus: "NOT_AVAILABLE",
    deploymentStatus: "PREPARED",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadataHash: "0x9c14be03d7a25f61" as any,
    manifest: {
      id: "holographic-distribution",
      name: "Holographic Distribution Agent",
      version: "0.3.0",
      creator: "Holographic Core",
      description: "Multi-recipient distributions",
      category: "DISTRIBUTION",
      capabilities: ["PRIVATE_DISTRIBUTION", "POLICY_ENFORCEMENT"],
      supportedAssets: ["USDC", "STRK"],
      requiredPermissions: ["USDC", "Recipient groups"],
      policyRequirements: { maxTransactionAmount: 1000 * 1_000_000, dailyLimit: 10000 * 1_000_000, approvalThreshold: 1000 * 1_000_000, allowedAssets: ["USDC", "STRK"] },
      riskLevel: "MEDIUM",
      verification: { audited: false, verificationStatus: "NOT_AVAILABLE" },
    },
  },
  {
    id: "holographic-compliance",
    name: "Holographic Compliance Agent",
    slug: "compliance",
    description: "Compliance evidence and verification workflows reusing compliance infrastructure. PREPARED.",
    creator: "Holographic Core",
    creatorWallet: "0x0678abc9def012345678901234567890abcdef12" as any,
    version: "0.2.0",
    category: "COMPLIANCE",
    capabilities: ["AUDIT_SUPPORT", "EXECUTION_ATTESTATION", "WORKFLOW_PARTICIPATION"],
    supportedAssets: ["USDC"],
    riskLevel: "LOW",
    privacySupport: false,
    verificationStatus: "NOT_AVAILABLE",
    deploymentStatus: "PREPARED",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadataHash: "0x6d02fc84e9b71a33" as any,
    manifest: {
      id: "holographic-compliance",
      name: "Holographic Compliance Agent",
      version: "0.2.0",
      creator: "Holographic Core",
      description: "Compliance evidence",
      category: "COMPLIANCE",
      capabilities: ["AUDIT_SUPPORT", "EXECUTION_ATTESTATION", "WORKFLOW_PARTICIPATION"],
      supportedAssets: ["USDC"],
      requiredPermissions: ["Audit evidence", "Verification"],
      policyRequirements: { maxTransactionAmount: 0, dailyLimit: 0, approvalThreshold: 0, allowedAssets: [] },
      riskLevel: "LOW",
      verification: { audited: false, verificationStatus: "NOT_AVAILABLE" },
    },
  },
];

export function seedAgents(): DbAgent[] {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  let existing = db.getAll<DbAgent>("agents");
  if (existing.length > 0) return existing;

  const now = Date.now();
  INITIAL_AGENTS.forEach((agent) => {
    db.create<DbAgent>("agents", { ...agent, createdAt: now, updatedAt: now });
    // Seed versions
    db.create<DbAgentVersion>("agent_versions", {
      agentId: agent.id,
      version: agent.version,
      manifestHash: agent.metadataHash,
      actionSurface: agent.manifest?.capabilities ?? agent.capabilities,
      assets: agent.supportedAssets,
      capabilities: agent.capabilities,
      status: "ACTIVE",
      createdAt: now,
      changes: "Initial version",
    });
    // Seed capabilities
    agent.capabilities.forEach((cap) => {
      db.create<DbAgentCapability>("agent_capabilities", {
        agentId: agent.id,
        capability: cap,
        createdAt: now,
      });
    });
    // Seed metrics
    db.create<DbAgentMetrics>("agent_metrics", {
      agentId: agent.id,
      executionCount: agent.id === "holographic-treasury" ? 3120 : 0,
      successfulExecutions: agent.id === "holographic-treasury" ? 3100 : 0,
      blockedRequests: 20,
      failedExecutions: 0,
      policyViolations: 20,
      humanApprovals: 150,
      humanApprovalRate: 5,
      verificationCoverage: agent.id === "holographic-treasury" ? 98 : 0,
      policyBlockRate: agent.id === "holographic-treasury" ? 0.6 : 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  // Legacy mock agents for variety
  MOCK_AGENTS.forEach((mock) => {
    if (!INITIAL_AGENTS.find((a) => a.id === mock.id)) {
      db.create<DbAgent>("agents", {
        id: mock.id,
        name: mock.name,
        slug: mock.id,
        description: mock.description,
        creator: mock.publisher,
        creatorWallet: mock.publisherAddress,
        version: mock.version,
        category: mock.category.toUpperCase(),
        capabilities: mock.actionSurface.map((a) => a.toUpperCase()),
        supportedAssets: mock.assets,
        riskLevel: mock.metrics.trustScore >= 95 ? "LOW" : mock.metrics.trustScore >= 85 ? "MEDIUM" : "HIGH",
        privacySupport: true,
        verificationStatus: "PENDING",
        deploymentStatus: mock.id === "helix-payroll" ? "LIVE" : "BETA",
        createdAt: now,
        updatedAt: now,
        metadataHash: mock.manifestHash,
      });
    }
  });

  return db.getAll<DbAgent>("agents");
}

export function getAllAgents(): DbAgent[] {
  if (db.getAll<DbAgent>("agents").length === 0) {
    return seedAgents();
  }
  return db.getAll<DbAgent>("agents");
}

export function getAgentById(id: string): DbAgent | null {
  return db.getById<DbAgent>("agents", id);
}

export function getLiveAgents(): DbAgent[] {
  return getAllAgents().filter((a) => a.deploymentStatus === "LIVE");
}

export function getAgentVersions(agentId: string): DbAgentVersion[] {
  return db.getAgentVersionsByAgent(agentId);
}

export function getAgentCapabilities(agentId: string): DbAgentCapability[] {
  return db.getAll<DbAgentCapability>("agent_capabilities").filter((c) => c.agentId === agentId);
}

export function getAgentMetrics(agentId: string): DbAgentMetrics | null {
  return db.getAll<DbAgentMetrics>("agent_metrics").find((m) => m.agentId === agentId) ?? null;
}

// Validation per TASK 22
export function validateManifest(manifest: AgentManifest): { valid: boolean; reason?: string } {
  if (!manifest.id) return { valid: false, reason: "Missing id" };
  if (!manifest.name) return { valid: false, reason: "Missing name" };
  if (!manifest.version) return { valid: false, reason: "Missing version" };
  if (!manifest.creator) return { valid: false, reason: "Missing creator" };
  if (!manifest.category) return { valid: false, reason: "Missing category" };
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) return { valid: false, reason: "Missing capabilities" };
  if (!Array.isArray(manifest.supportedAssets) || manifest.supportedAssets.length === 0) return { valid: false, reason: "Missing supportedAssets" };
  if (!["LOW", "MEDIUM", "HIGH"].includes(manifest.riskLevel)) return { valid: false, reason: "Invalid riskLevel" };
  // Check capability conflict
  const allowedCaps = [
    "PRIVATE_TRANSFER",
    "PRIVATE_DISTRIBUTION",
    "POLICY_ENFORCEMENT",
    "HUMAN_APPROVAL",
    "EXECUTION_ATTESTATION",
    "AUDIT_SUPPORT",
    "SCHEDULED_PAYMENTS",
    "BUDGETS",
    "BATCH_PAYMENTS",
    "WORKFLOW_PARTICIPATION",
  ];
  for (const cap of manifest.capabilities) {
    if (!allowedCaps.includes(cap)) return { valid: false, reason: `Invalid capability ${cap}` };
  }
  return { valid: true };
}

// Publishing preparation per TASK 24
export function registerAgent(manifest: AgentManifest, creatorWallet: string): DbAgent {
  const validation = validateManifest(manifest);
  if (!validation.valid) throw new Error(`AGENT NOT DEPLOYABLE: ${validation.reason}`);
  if (!db.isAvailable()) throw new Error("Backend unavailable");

  const existing = db.getById<DbAgent>("agents", manifest.id);
  if (existing) throw new Error("Agent already registered");

  const now = Date.now();
  const agent: DbAgent = {
    id: manifest.id,
    name: manifest.name,
    slug: manifest.id,
    description: manifest.description,
    creator: manifest.creator,
    creatorWallet: creatorWallet as any,
    version: manifest.version,
    category: manifest.category,
    capabilities: manifest.capabilities,
    supportedAssets: manifest.supportedAssets,
    riskLevel: manifest.riskLevel,
    privacySupport: manifest.capabilities.includes("PRIVATE_TRANSFER"),
    verificationStatus: "PENDING",
    deploymentStatus: "PREPARED",
    createdAt: now,
    updatedAt: now,
    metadataHash: `0x${Math.random().toString(16).slice(2, 10)}` as any,
    manifest,
  };

  return db.create<DbAgent>("agents", agent);
}

export function createVersion(agentId: string, version: string, changes: string): DbAgentVersion {
  const agent = getAgentById(agentId);
  if (!agent) throw new Error("Agent not found");
  const existingVersions = getAgentVersions(agentId);
  if (existingVersions.some((v) => v.version === version)) throw new Error("Version already exists");

  const now = Date.now();
  const newVersion = db.create<DbAgentVersion>("agent_versions", {
    agentId,
    version,
    manifestHash: agent.metadataHash,
    actionSurface: agent.capabilities,
    assets: agent.supportedAssets,
    capabilities: agent.capabilities,
    status: "ACTIVE",
    createdAt: now,
    changes,
  });

  // Supersede old versions
  existingVersions.forEach((v) => {
    if (v.status === "active" || v.status === "ACTIVE") {
      db.update("agent_versions", v.id, { status: "superseded" });
    }
  });

  // Update agent version
  db.update("agents", agentId, { version, updatedAt: now });

  // Notification for version update available
  try {
    const { db: dbClient } = require("../db/client");
    const deployments = dbClient.getAll("agent_deployments").filter((d: any) => d.agentId === agentId);
    deployments.forEach((dep: any) => {
      dbClient.create("notifications", {
        userId: dep.userId,
        type: "version_update_available",
        title: `Agent version update available: ${agentId} v${version}`,
        message: `New version v${version} for ${agentId}: ${changes}. Current: v${dep.agentVersion}. Review update.`,
        read: false,
        relatedId: dep.id,
        createdAt: now,
      });
    });
  } catch {}

  return newVersion;
}
