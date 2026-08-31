import type { WalletAdapter } from "./types";
import { MockWalletAdapter } from "./mockAdapter";
import { RealWalletAdapter } from "./realAdapter";
import { ReadyWalletAdapter } from "./readyAdapter";
import { MobileWalletConnectAdapter } from "./walletConnectAdapter";

export * from "./types";
export { MockWalletAdapter } from "./mockAdapter";
export { RealWalletAdapter } from "./realAdapter";
export { ReadyWalletAdapter } from "./readyAdapter";
export { MobileWalletConnectAdapter } from "./walletConnectAdapter";

export type WalletAdapterKind = "mock" | "real" | "ready" | "walletconnect";

let _mockInstance: MockWalletAdapter | null = null;
let _realInstance: RealWalletAdapter | null = null;
let _readyInstance: ReadyWalletAdapter | null = null;
let _wcInstance: MobileWalletConnectAdapter | null = null;

export function getMockWalletAdapter(): MockWalletAdapter {
  if (!_mockInstance) _mockInstance = new MockWalletAdapter();
  return _mockInstance;
}

export function getRealWalletAdapter(): RealWalletAdapter {
  if (!_realInstance) _realInstance = new RealWalletAdapter();
  return _realInstance;
}

export function getReadyWalletAdapter(): ReadyWalletAdapter {
  if (!_readyInstance) _readyInstance = new ReadyWalletAdapter();
  return _readyInstance;
}

export function getWalletConnectAdapter(): MobileWalletConnectAdapter {
  if (!_wcInstance) _wcInstance = new MobileWalletConnectAdapter();
  return _wcInstance;
}

/**
 * Factory — respects localStorage hint but defaults to mock until
 * real wallet verification. Supports both legacy "real" and new "ready"/"walletconnect".
 */
export function getWalletAdapter(kind: WalletAdapterKind = "mock"): WalletAdapter {
  switch (kind) {
    case "ready":
      return getReadyWalletAdapter();
    case "walletconnect":
      return getWalletConnectAdapter();
    case "real":
      return getRealWalletAdapter();
    case "mock":
    default:
      return getMockWalletAdapter();
  }
}

export function detectPreferredAdapterKind(): WalletAdapterKind {
  try {
    const stored = localStorage.getItem("holographic:wallet:adapter");
    if (stored === "real" || stored === "mock" || stored === "ready" || stored === "walletconnect") {
      return stored as WalletAdapterKind;
    }
  } catch {}
  return "mock";
}
