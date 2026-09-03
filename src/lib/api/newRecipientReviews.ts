import { db } from "../db/client";
import type { DbNewRecipientReview, DbPolicy } from "../db/schema";
import { addRecipient } from "./recipients";
import { updatePolicy } from "./policies";

/**
 * New-recipient safety net. An agent can never approve its own recipient —
 * a payment blocked purely because the recipient isn't on the policy
 * allowlist yet surfaces here for an explicit human decision, instead of
 * just being another opaque policy rejection.
 */

export function flagNewRecipientReview(
  userId: string,
  policyId: string,
  recipient: string,
  asset: string,
  sourceType: DbNewRecipientReview["sourceType"],
  sourceId: string,
): DbNewRecipientReview {
  const existing = db.find<DbNewRecipientReview>(
    "new_recipient_reviews",
    (r) => r.userId === userId && r.policyId === policyId && r.recipient.toLowerCase() === recipient.toLowerCase() && r.status === "PENDING",
  )[0];
  if (existing) return existing;

  const review = db.create<DbNewRecipientReview>("new_recipient_reviews", {
    userId,
    policyId,
    recipient,
    asset,
    sourceType,
    sourceId,
    status: "PENDING",
  });

  try {
    db.create("notifications", {
      userId,
      type: "new_recipient_review_required",
      title: "New recipient needs review",
      message: `A payment to an unapproved recipient is waiting on your decision before it can be evaluated`,
      read: false,
      relatedId: review.id,
      createdAt: Date.now(),
    });
  } catch {}

  return review;
}

export function getNewRecipientReviewsByUser(userId: string): DbNewRecipientReview[] {
  return db.find<DbNewRecipientReview>("new_recipient_reviews", (r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Adds the recipient to the policy's allowlist and marks the review
 * resolved — the agent never does this itself. Two recipient records exist
 * in this codebase (the UI-facing `approved_recipients` table AND the
 * `approvedRecipients` array embedded in the policy document itself, which
 * is what validateAction actually reads) — both must be updated or the
 * approval would silently fail to unblock anything.
 */
export function approveNewRecipientReview(id: string, userId: string, name: string): DbNewRecipientReview {
  const review = db.getById<DbNewRecipientReview>("new_recipient_reviews", id);
  if (!review) throw new Error("Review not found");
  if (review.userId !== userId) throw new Error("Unauthorized");
  if (review.status !== "PENDING") return review;

  addRecipient(userId, review.policyId, name || "Approved recipient", review.recipient, review.asset);

  const policy = db.getById<DbPolicy>("policies", review.policyId);
  if (policy && !policy.doc.approvedRecipients.includes(review.recipient)) {
    updatePolicy(policy.id, userId, { ...policy.doc, approvedRecipients: [...policy.doc.approvedRecipients, review.recipient] });
  }

  return db.update<DbNewRecipientReview>("new_recipient_reviews", id, { status: "APPROVED", resolvedAt: Date.now() })!;
}

export function rejectNewRecipientReview(id: string, userId: string): DbNewRecipientReview {
  const review = db.getById<DbNewRecipientReview>("new_recipient_reviews", id);
  if (!review) throw new Error("Review not found");
  if (review.userId !== userId) throw new Error("Unauthorized");
  if (review.status !== "PENDING") return review;
  return db.update<DbNewRecipientReview>("new_recipient_reviews", id, { status: "REJECTED", resolvedAt: Date.now() })!;
}
