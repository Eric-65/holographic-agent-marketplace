import { db } from "../db/client";
import type { DbWallet } from "../db/schema";
import type { Hex } from "../types";

export function ensureWallet(userId: string, address: Hex, chainId: string | null, name: string | null, isMock: boolean, adapterKind: DbWallet["adapterKind"]): DbWallet {
  if (!db.isAvailable()) throw new Error("Backend unavailable");
  const existing = db.getAll<DbWallet>("wallets").find((w) => w.userId === userId && w.address.toLowerCase() === address.toLowerCase() && w.status === "connected");
  if (existing) {
    return db.update<DbWallet>("wallets", existing.id, { chainId, name, isMock, adapterKind })!;
  }
  return db.create<DbWallet>("wallets", {
    userId,
    address,
    chainId,
    name,
    isMock,
    adapterKind,
    status: "connected",
    connectedAt: Date.now(),
  });
}

export function disconnectWalletsByUser(userId: string): void {
  const wallets = db.getWalletsByUser(userId);
  wallets.forEach((w) => {
    if (w.status === "connected") {
      db.update("wallets", w.id, { status: "disconnected", disconnectedAt: Date.now() });
    }
  });
}

export function getActiveWalletByUser(userId: string): DbWallet | null {
  const wallets = db.getWalletsByUser(userId);
  return wallets.find((w) => w.status === "connected") ?? null;
}
