import { ReadyWalletAdapter } from "./readyAdapter";

/**
 * RealWalletAdapter — legacy alias for ReadyWalletAdapter
 * Kept for backwards compatibility with existing imports.
 * New code should use ReadyWalletAdapter (desktop) or MobileWalletConnectAdapter (mobile).
 */
export class RealWalletAdapter extends ReadyWalletAdapter {
  override readonly id: string = "real";
  override readonly label: string = "Starknet wallet (Ready/Xverse) — via starknet.js v10.4.0";
}
