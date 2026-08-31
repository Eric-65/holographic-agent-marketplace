import { MockPrivacyProvider } from "./mockProvider";
import { Strk20WalletApiProvider } from "./strk20Provider";
import type { PrivacyProvider } from "./provider";

export * from "./provider";
export { MockPrivacyProvider } from "./mockProvider";
export { Strk20WalletApiProvider } from "./strk20Provider";

/**
 * Privacy backend selection
 * - "mock" = DEMO MODE, always works
 * - "strk20" = real STRK20 via wallet_strk20InvokeTransaction
 * 
 * Auto-detection: if real wallet (ready/walletconnect) is connected and has privacy capability,
 * we use strk20 provider, otherwise mock. This keeps Demo Mode as fallback.
 */
export const PRIVACY_BACKEND: "mock" | "strk20" | "auto" = "auto";

let mockInstance: MockPrivacyProvider | null = null;
let strk20Instance: Strk20WalletApiProvider | null = null;

export function getMockPrivacyProvider(): MockPrivacyProvider {
  if (!mockInstance) mockInstance = new MockPrivacyProvider();
  return mockInstance;
}

export function getStrk20PrivacyProvider(): Strk20WalletApiProvider {
  if (!strk20Instance) strk20Instance = new Strk20WalletApiProvider();
  return strk20Instance;
}

export function getPrivacyProvider(): PrivacyProvider {
  if (PRIVACY_BACKEND === "mock") return getMockPrivacyProvider();
  if (PRIVACY_BACKEND === "strk20") return getStrk20PrivacyProvider();

  // Auto mode: check if real wallet adapter is connected and has privacy capability
  try {
    const adapterKind = localStorage.getItem("holographic:wallet:adapter");
    const isReal = adapterKind === "ready" || adapterKind === "walletconnect" || adapterKind === "real";
    if (isReal) {
      // Try to get capabilities from wallet state if available
      // For now, return strk20 provider — it will handle disconnected case with proper error
      return getStrk20PrivacyProvider();
    }
  } catch {}

  return getMockPrivacyProvider();
}

/**
 * Explicit getter for execution — decides based on current wallet adapter
 * Used by Treasury UI to clearly distinguish DEMO vs STRK20 execution
 */
export function getExecutionProvider(isMock: boolean): PrivacyProvider {
  return isMock ? getMockPrivacyProvider() : getStrk20PrivacyProvider();
}
