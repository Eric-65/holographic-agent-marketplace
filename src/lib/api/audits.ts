import { db } from "../db/client";
import type { DbAuditRequest, DbAuditEvent, DbVerificationResult, VerificationStatus } from "../db/schema";

/**
 * POST /audit_requests
 * GET /audit_requests
 * PATCH /audit_requests/:id
 */

export function createAuditRequest(
  userId: string,
  subjectType: DbAuditRequest["subjectType"],
  subjectId: string,
  reason: string,
  scope: DbAuditRequest["scope"],
  requestedBy: string,
): DbAuditRequest {
  if (!db.isAvailable()) throw new Error("database unavailable");
  if (!subjectId || !reason) throw new Error("Subject and reason required");

  const existingPending = db.getAll<DbAuditRequest>("audit_requests").find(
    (r) => r.userId === userId && r.subjectId === subjectId && r.status === "PENDING",
  );
  if (existingPending) throw new Error("Duplicate audit request: pending request already exists for same subject");

  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  const request = db.create<DbAuditRequest>("audit_requests", {
    userId,
    subjectType,
    subjectId,
    reason,
    scope,
    status: "PENDING",
    requestedBy,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  });

  // Audit event
  try {
    db.create<DbAuditEvent>("audit_events", {
      userId,
      type: "audit_requested",
      subjectId,
      subjectType,
      metadata: { reason, scope, requestId: request.id },
      isOnchain: false,
    });
  } catch {}

  return request;
}

export function authorizeAuditRequest(id: string, userId: string, authorizedBy: string): DbAuditRequest | null {
  const req = db.getById<DbAuditRequest>("audit_requests", id);
  if (!req) throw new Error("Audit request not found");
  if (req.userId !== userId) throw new Error("Unauthorized auditor");
  if (req.status !== "PENDING") throw new Error("Request not pending");
  if (Date.now() > req.expiresAt) {
    db.update<DbAuditRequest>("audit_requests", id, { status: "EXPIRED" });
    throw new Error("Audit request expired");
  }

  const updated = db.update<DbAuditRequest>("audit_requests", id, {
    status: "AUTHORIZED",
    authorizedBy,
  });

  try {
    db.create<DbAuditEvent>("audit_events", {
      userId,
      type: "audit_authorized",
      subjectId: req.subjectId,
      subjectType: req.subjectType,
      metadata: { requestId: id, authorizedBy },
      isOnchain: false,
    });
  } catch {}

  return updated;
}

export function fulfillAuditRequest(id: string, userId: string): DbAuditRequest | null {
  const req = db.getById<DbAuditRequest>("audit_requests", id);
  if (!req) throw new Error("Audit request not found");
  if (req.userId !== userId) throw new Error("Unauthorized");
  if (req.status !== "AUTHORIZED") throw new Error("Request not authorized");

  const updated = db.update<DbAuditRequest>("audit_requests", id, {
    status: "FULFILLED",
    fulfilledAt: Date.now(),
  });

  try {
    db.create<DbAuditEvent>("audit_events", {
      userId,
      type: "audit_fulfilled",
      subjectId: req.subjectId,
      subjectType: req.subjectType,
      metadata: { requestId: id },
      isOnchain: false,
    });
  } catch {}

  return updated;
}

export function rejectAuditRequest(id: string, userId: string): DbAuditRequest | null {
  const req = db.getById<DbAuditRequest>("audit_requests", id);
  if (!req) throw new Error("Audit request not found");
  if (req.userId !== userId) throw new Error("Unauthorized");
  return db.update<DbAuditRequest>("audit_requests", id, { status: "REJECTED" });
}

export function getAuditRequestsByUser(userId: string): DbAuditRequest[] {
  return db.getAuditRequestsByUser(userId);
}

export function getAuditRequestById(id: string, userId?: string): DbAuditRequest | null {
  const req = db.getById<DbAuditRequest>("audit_requests", id);
  if (!req) return null;
  if (userId && req.userId !== userId) throw new Error("Unauthorized auditor");
  // Check expiration
  if (req.status === "PENDING" && Date.now() > req.expiresAt) {
    db.update<DbAuditRequest>("audit_requests", id, { status: "EXPIRED" });
    return { ...req, status: "EXPIRED" };
  }
  return req;
}

// Audit events
export function createAuditEvent(
  userId: string,
  type: DbAuditEvent["type"],
  subjectId: string,
  subjectType: DbAuditEvent["subjectType"],
  metadata: DbAuditEvent["metadata"],
  isOnchain: boolean,
): DbAuditEvent {
  return db.create<DbAuditEvent>("audit_events", {
    userId,
    type,
    subjectId,
    subjectType,
    metadata,
    isOnchain,
  });
}

export function getAuditEventsByUser(userId: string): DbAuditEvent[] {
  return db.getAuditEventsByUser(userId).sort((a, b) => b.createdAt - a.createdAt);
}

// Verification results
export function createVerificationResult(
  userId: string,
  subjectType: DbVerificationResult["subjectType"],
  subjectId: string,
  status: VerificationStatus,
  details: DbVerificationResult["details"],
): DbVerificationResult {
  return db.create<DbVerificationResult>("verification_results", {
    userId,
    subjectType,
    subjectId,
    status,
    details,
    updatedAt: Date.now(),
  });
}

export function getVerificationResultsByUser(userId: string): DbVerificationResult[] {
  return db.getVerificationResultsByUser(userId);
}

export function getVerificationResultBySubject(userId: string, subjectType: string, subjectId: string): DbVerificationResult | null {
  return (
    db.getAll<DbVerificationResult>("verification_results").find((r) => r.userId === userId && r.subjectType === subjectType && r.subjectId === subjectId) ?? null
  );
}
