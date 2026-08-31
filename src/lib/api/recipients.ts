import { db } from "../db/client";
import type { DbApprovedRecipient } from "../db/schema";

/**
 * POST /recipients
 * DELETE /recipients/:id
 * PATCH /recipients/:id
 */

export function addRecipient(
  userId: string,
  policyId: string,
  name: string,
  address: string,
  asset: string,
): DbApprovedRecipient {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  if (!name || !address) throw new Error("Name and address required");
  if (!address.startsWith("0x")) throw new Error("Invalid address — must start with 0x");

  const policy = db.getById<any>("policies", policyId);
  if (!policy) throw new Error("Policy not found");
  if (policy.userId !== userId) throw new Error("Unauthorized: policy does not belong to user");

  const existing = db.getRecipientsByPolicy(policyId).find((r: any) => r.address.toLowerCase() === address.toLowerCase() && r.asset === asset);
  if (existing) {
    if (!existing.active) {
      return db.update<DbApprovedRecipient>("approved_recipients", existing.id, { active: true, name })!;
    }
    throw new Error("Recipient already exists in allowlist");
  }

  return db.create<DbApprovedRecipient>("approved_recipients", {
    userId,
    policyId,
    name,
    address,
    asset,
    active: true,
    updatedAt: Date.now(),
  });
}

export function editRecipient(id: string, userId: string, updates: { name?: string; address?: string; asset?: string }): DbApprovedRecipient | null {
  const rec = db.getById<DbApprovedRecipient>("approved_recipients", id);
  if (!rec) throw new Error("Recipient not found");
  if (rec.userId !== userId) throw new Error("Unauthorized");
  if (updates.address && !updates.address.startsWith("0x")) throw new Error("Invalid address");
  return db.update<DbApprovedRecipient>("approved_recipients", id, updates);
}

export function removeRecipient(id: string, userId?: string): boolean {
  if (userId) {
    const rec = db.getById<DbApprovedRecipient>("approved_recipients", id);
    if (!rec) throw new Error("Recipient not found");
    if (rec.userId !== userId) throw new Error("Unauthorized");
  }
  return db.delete("approved_recipients", id);
}

export function disableRecipient(id: string, userId?: string): DbApprovedRecipient | null {
  if (userId) {
    const rec = db.getById<DbApprovedRecipient>("approved_recipients", id);
    if (rec && rec.userId !== userId) throw new Error("Unauthorized");
  }
  return db.update<DbApprovedRecipient>("approved_recipients", id, { active: false });
}

export function enableRecipient(id: string, userId?: string): DbApprovedRecipient | null {
  if (userId) {
    const rec = db.getById<DbApprovedRecipient>("approved_recipients", id);
    if (rec && rec.userId !== userId) throw new Error("Unauthorized");
  }
  return db.update<DbApprovedRecipient>("approved_recipients", id, { active: true });
}

export function getRecipientsByPolicy(policyId: string, userId?: string): DbApprovedRecipient[] {
  const policy = db.getById<any>("policies", policyId);
  if (userId && policy && policy.userId !== userId) throw new Error("Unauthorized");
  return db.getRecipientsByPolicy(policyId);
}

export function getActiveRecipientsByPolicy(policyId: string): DbApprovedRecipient[] {
  return db.getActiveRecipientsByPolicy(policyId);
}

export function getRecipientsByUser(userId: string): DbApprovedRecipient[] {
  return db.getAll<DbApprovedRecipient>("approved_recipients").filter((r) => r.userId === userId);
}

export function isRecipientApproved(policyId: string, address: string): boolean {
  const recipients = getActiveRecipientsByPolicy(policyId);
  return recipients.some((r) => r.address.toLowerCase() === address.toLowerCase());
}
