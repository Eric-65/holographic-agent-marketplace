import { db } from "../db/client";
import type { DbUser } from "../db/schema";
import type { Hex } from "../types";

export function ensureUser(address: Hex): DbUser {
  if (!db.isAvailable()) throw new Error("Backend unavailable: database not available");
  const existing = db.getUserByAddress(address);
  if (existing) {
    db.update("users", existing.id, { lastActiveAt: Date.now() });
    return existing;
  }
  return db.create<DbUser>("users", {
    address,
    lastActiveAt: Date.now(),
  } as any);
}

export function getUserByAddress(address: string): DbUser | null {
  return db.getUserByAddress(address);
}

export function getAllUsers(): DbUser[] {
  return db.getAll<DbUser>("users");
}
