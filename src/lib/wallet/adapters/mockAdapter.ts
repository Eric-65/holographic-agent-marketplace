import type { Hex, WalletCapabilities, WalletState } from "../../types";
import { getPrivacyProvider } from "../../privacy";
import type { WalletAdapter } from "./types";
import { WalletNotAvailableError } from "./types";

const DEMO_ADDRESS =
  "0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5" as Hex;

const EMPTY_CAPS: WalletCapabilities = {
  privacyApi: false,
  specVersion: null,
  shield: false,
  privateTransfer: false,
  privateSwap: false,
  multicall: false,
};

export class MockWalletAdapter implements WalletAdapter {
  readonly id: string = "mock";
  readonly label: string = "Mock wallet — demo mode";
  readonly isMock = true;

  private _state: WalletState = {
    status: "disconnected",
    address: null,
    chainId: null,
    walletName: null,
    capabilities: EMPTY_CAPS,
  };

  async connect(): Promise<WalletState> {
    this._state = { ...this._state, status: "connecting" };
    await new Promise((r) => setTimeout(r, 420));
    try {
      const caps = await getPrivacyProvider().detectCapabilities();
      this._state = {
        status: "connected",
        address: DEMO_ADDRESS,
        chainId: "0x534e5f5345504f4c4941",
        walletName: "Ready X (mock)",
        capabilities: caps,
      };
      try {
        localStorage.setItem("holographic:wallet:adapter", "mock");
        localStorage.setItem("holographic:wallet", "1");
      } catch {}
      return this._state;
    } catch (e) {
      this._state = { ...this._state, status: "disconnected" };
      throw e;
    }
  }

  async connectSilent(): Promise<WalletState> {
    // Mock can always silently reconnect
    return this.connect();
  }

  async disconnect(): Promise<void> {
    this._state = {
      status: "disconnected",
      address: null,
      chainId: null,
      walletName: null,
      capabilities: EMPTY_CAPS,
    };
    try {
      localStorage.removeItem("holographic:wallet:adapter");
      localStorage.removeItem("holographic:wallet");
    } catch {}
  }

  getAccount(): Hex | null {
    return this._state.address;
  }

  getAddress(): Hex | null {
    return this._state.address;
  }

  getChainId(): string | null {
    return this._state.chainId;
  }

  getStatus() {
    return this._state.status;
  }

  isConnected(): boolean {
    return this._state.status === "connected" && !!this._state.address;
  }

  getProvider(): null {
    return null;
  }

  getRealAccount(): null {
    return null;
  }

  async getCapabilities(): Promise<WalletCapabilities> {
    return this._state.capabilities;
  }

  async request<T>(): Promise<T> {
    throw new WalletNotAvailableError("Mock adapter does not support wallet_request");
  }

  hydrate(state: WalletState) {
    this._state = state;
  }

  getInternalState() {
    return this._state;
  }
}
