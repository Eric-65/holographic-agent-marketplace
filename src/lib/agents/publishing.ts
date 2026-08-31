/**
 * Controlled publishing lifecycle per TASK 9, 10, 12, 24
 * States: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, LIVE, SUSPENDED, DEPRECATED
 * Flow: Create Agent → Validate Manifest → Submit → Review → Approve → Register → Publish
 * Keep publishing permissioned, only approved creators can publish LIVE
 */

import { db } from "../db/client";
import type { DbAgent, DbAgentVersion } from "../db/schema";
import type { AgentManifest } from "../db/schema";
import { validateAgentManifest } from "./manifest";
import { createAuditEvent } from "../api/audits";

export type PublishingStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "LIVE" | "SUSPENDED" | "DEPRECATED";

export interface PublishingRecord {
  id: string;
  agentId: string;
  version: string;
  status: PublishingStatus;
  creator: string;
  creatorWallet: string;
  submittedAt?: number;
  reviewedAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  publishedAt?: number;
  suspendedAt?: number;
  deprecatedAt?: number;
  reviewer?: string;
  reviewNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export function createDraftAgent(manifest: AgentManifest, creatorWallet: string): DbAgent {
  const validation = validateAgentManifest(manifest);
  if (!validation.valid) {
    throw new Error(`AGENT NOT DEPLOYABLE: ${validation.errors.join("; ")}`);
  }

  if (!db.isAvailable()) throw new Error("Backend unavailable");

  const existing = db.getById<DbAgent>("agents", manifest.id);
  if (existing) throw new Error("Agent already registered — duplicate ID");

  const now = Date.now();
  const agent: DbAgent = {
    id: manifest.id,
    name: manifest.name,
    slug: manifest.id,
    description: manifest.description,
    creator: manifest.creator,
    creatorWallet: creatorWallet as any,
    version: manifest.version,
    category: manifest.category as any,
    capabilities: manifest.capabilities,
    supportedAssets: manifest.supportedAssets,
    riskLevel: manifest.riskLevel as any,
    privacySupport: manifest.capabilities.includes("PRIVATE_TRANSFER"),
    verificationStatus: "PENDING",
    deploymentStatus: "DISABLED", // DRAFT starts as DISABLED
    createdAt: now,
    updatedAt: now,
    metadataHash: `0x${Math.random().toString(16).slice(2, 10)}` as any,
    manifest,
  };

  const created = db.create<DbAgent>("agents", agent);

  // Create publishing record
  db.create("notifications", {
    userId: `creator_${creatorWallet}`,
    type: "agent_deployed",
    title: `Draft created: ${manifest.id} v${manifest.version}`,
    message: `Draft agent ${manifest.id} v${manifest.version} created — status DRAFT`,
    read: false,
    relatedId: created.id,
    createdAt: now,
  } as any);

  createAuditEvent(
    `creator_${creatorWallet}`,
    "agent_registered",
    created.id,
    "agent",
    { agentId: created.id, version: created.version, status: "DRAFT" },
    false,
  );

  // Create initial version
  db.create<DbAgentVersion>("agent_versions", {
    agentId: created.id,
    version: created.version,
    manifestHash: created.metadataHash,
    actionSurface: created.capabilities,
    assets: created.supportedAssets,
    capabilities: created.capabilities,
    status: "DRAFT",
    createdAt: now,
    changes: "Initial draft",
  });

  // Store publishing record in a separate table (using notifications for simplicity, but also in agent_deployments-like)
  // For MVP, we use a dedicated table publishing_records via localStorage
  try {
    const key = "holographic:db:v4:publishing_records";
    const existingRecords = JSON.parse(localStorage.getItem(key) ?? "[]");
    existingRecords.push({
      id: `pub_${created.id}_${now}`,
      agentId: created.id,
      version: created.version,
      status: "DRAFT",
      creator: manifest.creator,
      creatorWallet,
      createdAt: now,
      updatedAt: now,
    });
    localStorage.setItem(key, JSON.stringify(existingRecords));
  } catch {}

  return created;
}

export function submitForReview(agentId: string, creatorWallet: string): PublishingRecord {
  const agent = db.getById<DbAgent>("agents", agentId);
  if (!agent) throw new Error("Agent not found");
  if (agent.creatorWallet.toLowerCase() !== creatorWallet.toLowerCase()) throw new Error("Unauthorized: not creator");

  const validation = validateAgentManifest(agent.manifest);
  if (!validation.valid) throw new Error(`AGENT NOT DEPLOYABLE: ${validation.errors.join("; ")}`);

  const now = Date.now();
  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    const draft = records.find((r) => r.agentId === agentId && r.status === "DRAFT");
    if (!draft) throw new Error("No DRAFT found to submit");
    draft.status = "SUBMITTED";
    draft.submittedAt = now;
    draft.updatedAt = now;
    localStorage.setItem(key, JSON.stringify(records));

    db.update("agents", agentId, { deploymentStatus: "BETA" as any, verificationStatus: "PENDING" as any });

    createAuditEvent(
      `creator_${creatorWallet}`,
      "agent_registered",
      agentId,
      "agent",
      { agentId, status: "SUBMITTED" },
      false,
    );

    return draft;
  } catch (e) {
    throw e;
  }
}

export function approveAgent(agentId: string, reviewer: string, creatorWallet: string): PublishingRecord {
  if (reviewer.toLowerCase() === creatorWallet.toLowerCase()) {
    throw new Error("Creator cannot approve own agent — security violation");
  }

  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    const record = records.find((r) => r.agentId === agentId && (r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"));
    if (!record) throw new Error("No SUBMITTED/UNDER_REVIEW record found");

    const now = Date.now();
    record.status = "APPROVED";
    record.reviewedAt = now;
    record.approvedAt = now;
    record.reviewer = reviewer;
    record.updatedAt = now;
    localStorage.setItem(key, JSON.stringify(records));

    db.update("agents", agentId, { deploymentStatus: "LIVE" as any, verificationStatus: "VERIFIED" as any });

    createAuditEvent(
      `creator_${creatorWallet}`,
      "agent_registered",
      agentId,
      "agent",
      { agentId, status: "APPROVED", reviewer },
      false,
    );

    return record;
  } catch (e) {
    throw e;
  }
}

export function rejectAgent(agentId: string, reviewer: string, reason: string): PublishingRecord {
  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    const record = records.find((r) => r.agentId === agentId && (r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"));
    if (!record) throw new Error("No record to reject");

    const now = Date.now();
    record.status = "REJECTED";
    record.reviewedAt = now;
    record.rejectedAt = now;
    record.reviewer = reviewer;
    record.reviewNotes = reason;
    record.updatedAt = now;
    localStorage.setItem(key, JSON.stringify(records));

    db.update("agents", agentId, { deploymentStatus: "DISABLED" as any });

    return record;
  } catch (e) {
    throw e;
  }
}

export function publishAgent(agentId: string): DbAgent | null {
  const agent = db.getById<DbAgent>("agents", agentId);
  if (!agent) throw new Error("Agent not found");

  const key = "holographic:db:v4:publishing_records";
  const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
  const approved = records.find((r) => r.agentId === agentId && r.status === "APPROVED");
  if (!approved) throw new Error("Unapproved agent cannot go LIVE — must be APPROVED first");

  const now = Date.now();
  approved.status = "LIVE";
  approved.publishedAt = now;
  approved.updatedAt = now;
  localStorage.setItem(key, JSON.stringify(records));

  return db.update<DbAgent>("agents", agentId, { deploymentStatus: "LIVE" as any, updatedAt: now });
}

export function suspendAgent(agentId: string): DbAgent | null {
  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    const live = records.find((r) => r.agentId === agentId && r.status === "LIVE");
    if (live) {
      live.status = "SUSPENDED";
      live.suspendedAt = Date.now();
      live.updatedAt = Date.now();
      localStorage.setItem(key, JSON.stringify(records));
    }
  } catch {}
  return db.update<DbAgent>("agents", agentId, { deploymentStatus: "DISABLED" as any, verificationStatus: "FAILED" as any });
}

export function deprecateAgent(agentId: string, creatorWallet: string): DbAgent | null {
  const agent = db.getById<DbAgent>("agents", agentId);
  if (!agent) throw new Error("Agent not found");
  if (agent.creatorWallet.toLowerCase() !== creatorWallet.toLowerCase()) throw new Error("Unauthorized: not creator");

  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    const live = records.find((r) => r.agentId === agentId && r.status === "LIVE");
    if (live) {
      live.status = "DEPRECATED";
      live.deprecatedAt = Date.now();
      live.updatedAt = Date.now();
      localStorage.setItem(key, JSON.stringify(records));
    }
  } catch {}

  // No new deployments allowed when deprecated — existing deployments get warning via notifications
  try {
    const deployments = db.getAll<any>("agent_deployments").filter((d: any) => d.agentId === agentId);
    deployments.forEach((dep: any) => {
      db.create("notifications", {
        userId: dep.userId,
        type: "version_update_available",
        title: `Agent deprecated: ${agentId}`,
        message: `Agent ${agentId} deprecated — no new deployments, existing deployments receive warning, historical remains valid`,
        read: false,
        relatedId: dep.id,
        createdAt: Date.now(),
      } as any);
    });
  } catch {}

  return db.update<DbAgent>("agents", agentId, { deploymentStatus: "DISABLED" as any });
}

export function getPublishingRecords(agentId?: string): PublishingRecord[] {
  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    if (agentId) return records.filter((r) => r.agentId === agentId);
    return records;
  } catch {
    return [];
  }
}

export function getCreatorSubmissions(creatorWallet: string): PublishingRecord[] {
  try {
    const key = "holographic:db:v4:publishing_records";
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as PublishingRecord[];
    return records.filter((r) => r.creatorWallet.toLowerCase() === creatorWallet.toLowerCase());
  } catch {
    return [];
  }
}
