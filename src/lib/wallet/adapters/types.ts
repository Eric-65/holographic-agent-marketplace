import type { Hex, WalletCapabilities, WalletState, WalletStatus } from "../../types";

/**
 * WalletAdapter — single boundary for all wallet interactions.
 *
 * MockWalletAdapter: DEMO MODE, no external deps.
 * RealWalletAdapter: starknet.js v10.4.0 + @starknet-io/get-starknet, injected wallet detection.
 *
 * The rest of the app (store, components) only consumes WalletState and
 * the adapter's explicit methods, never window.starknet directly.
 */

export interface WalletAdapter {
  readonly id: string;
  readonly label: string;
  readonly isMock: boolean;

  /** Connect, returns full WalletState — triggers wallet permission request */
  connect(): Promise<WalletState>;
  /** Silent connect — tries to reconnect without UI prompt if supported */
  connectSilent?(): Promise<WalletState>;
  disconnect(): Promise<void>;

  /** Read-only accessors — never trigger UI */
  getAccount(): Hex | null;
  /** Alias for getAccount — required by TASK 2 spec */
  getAddress(): Hex | null;
  getChainId(): string | null;
  getStatus(): WalletStatus;
  /** TASK 2: isConnected */
  isConnected(): boolean;
  /** TASK 2: getProvider — returns RpcProvider or null */
  getProvider(): unknown | null;
  /** TASK 2: getAccount returns WalletAccountV6 or address — we keep address for compat + real account via getRealAccount */
  getRealAccount?(): unknown | null;

  /** Capabilities: privacyApi, specVersion, etc. */
  getCapabilities(): Promise<WalletCapabilities>;

  /**
   * Generic wallet request — thin wrapper over WalletAccount.request()
   */
  request<T = unknown>(type: string, params?: unknown): Promise<T>;

  /** For store hydration — mock only */
  getInternalState?(): WalletState;
}

export class WalletNotAvailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "WalletNotAvailableError";
  }
}

export class WrongNetworkError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "WrongNetworkError";
  }
}

export class UserRejectedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UserRejectedError";
  }
}

export const EXPECTED_CHAINS = {
  SEPOLIA: "0x534e5f5345504f4c4941",
  MAINNET: "0x534e5f5f4d41494e",
} as const;

export const CHAIN_LABELS: Record<string, string> = {
  "0x534e5f5345504f4c4941": "Starknet Sepolia",
  "0x534e5f5f4d41494e": "Starknet Mainnet",
  SN_SEPOLIA: "Starknet Sepolia",
  SN_MAIN: "Starknet Mainnet",
};
