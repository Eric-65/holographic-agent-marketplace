import type { Hex, WalletCapabilities, WalletState } from "../../types";
import type { WalletAdapter } from "./types";
import { WalletNotAvailableError } from "./types";
import { logStep, clearLogs } from "../debugLogger";

const EMPTY_CAPS: WalletCapabilities = {
  privacyApi: false,
  specVersion: null,
  shield: false,
  privateTransfer: false,
  privateSwap: false,
  multicall: false,
};

const SEPOLIA_RPC_URL = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";

export class MobileWalletConnectAdapter implements WalletAdapter {
  readonly id: string = "walletconnect";
  readonly label: string = "Mobile WalletConnect — Argent / Braavos mobile";
  readonly isMock = false;

  private _provider: any | null = null;
  private _walletObj: any = null;
  private _address: Hex | null = null;
  private _chainId: string | null = null;
  private _caps: WalletCapabilities = EMPTY_CAPS;
  private _state: WalletState = {
    status: "disconnected",
    address: null,
    chainId: null,
    walletName: null,
    capabilities: EMPTY_CAPS,
  };

  async connect(): Promise<WalletState> {
    clearLogs();
    logStep("STEP_1_DISCOVERY_STARTED", true, { message: "Mobile WalletConnect discovery started", data: { adapter: this.id } });
    this._state = { ...this._state, status: "connecting" };

    let walletObj: any = null;
    let starknetInstance: any = null;

    try {
      const { getStarknet } = await import("@starknet-io/get-starknet-core");
      starknetInstance = getStarknet();
      const discovery = (await starknetInstance.getDiscoveryWallets()) as any[];
      const argentMobile = discovery.find((w: any) => w.id?.toLowerCase().includes("argent") && w.id?.toLowerCase().includes("mobile"));
      const braavosMobile = discovery.find((w: any) => w.id?.toLowerCase().includes("braavos") && w.id?.toLowerCase().includes("mobile"));
      const genericMobile = discovery.find((w: any) => w.name?.toLowerCase().includes("mobile") || w.id?.toLowerCase().includes("walletconnect"));

      const available = (await starknetInstance.getAvailableWallets()) as any[];
      logStep("STEP_2_AVAILABLE_WALLETS", true, {
        message: `Available: ${available.length}, Discovery: ${discovery.length}`,
        data: {
          availableIds: available.map((w: any) => w.id),
          discoveryMobile: [argentMobile?.id, braavosMobile?.id, genericMobile?.id].filter(Boolean),
        },
      });

      const availableMobile = available.find((w: any) => w.id?.toLowerCase().includes("mobile") || w.id?.toLowerCase().includes("argent"));
      walletObj = availableMobile ?? argentMobile ?? braavosMobile ?? genericMobile ?? null;

      if (!walletObj) {
        throw new WalletNotAvailableError(
          "No mobile WalletConnect wallet found. Install Argent Mobile or use Desktop Wallet.",
        );
      }

      logStep("STEP_3_SELECTED_WALLET", true, {
        message: "Selected mobile wallet",
        data: { id: walletObj?.id, name: walletObj?.name },
      });

      // Enable triggers QR modal
      logStep("STEP_5_CALLING_WALLETACCOUNT_CONNECT", true, { message: "Calling starknet.enable() for mobile — triggers QR" });
      const connectedWallet = await starknetInstance.enable(walletObj);
      walletObj = connectedWallet ?? walletObj;
      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", true, { message: "Mobile wallet enable succeeded" });
    } catch (e) {
      if (e instanceof WalletNotAvailableError) {
        logStep("STEP_2_AVAILABLE_WALLETS", false, { message: "Mobile discovery failed", error: e });
        throw e;
      }
      logStep("STEP_2_AVAILABLE_WALLETS", false, { message: "Mobile discovery fallback", error: e });
      if (typeof window !== "undefined") {
        const w = window as Record<string, unknown>;
        walletObj = (w["starknet"] as any) ?? null;
      }
      if (!walletObj) {
        this._state = {
          status: "disconnected",
          address: null,
          chainId: null,
          walletName: null,
          capabilities: EMPTY_CAPS,
        };
        const err = new WalletNotAvailableError(
          "Mobile WalletConnect not available. Use Desktop Wallet (Ready) or install Argent Mobile and scan QR.",
        );
        logStep("STEP_3_SELECTED_WALLET", false, { message: "No mobile wallet via fallback", error: err });
        throw err;
      }
    }

    if (!walletObj) throw new WalletNotAvailableError("Mobile wallet not found");

    try {
      const { RpcProvider } = await import("starknet");
      this._provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC_URL });
      logStep("STEP_4_CREATING_PROVIDER", true, { data: { rpcUrl: SEPOLIA_RPC_URL } });
    } catch (e) {
      logStep("STEP_4_CREATING_PROVIDER", false, { error: e });
      throw e;
    }

    this._walletObj = walletObj;

    // Address detection
    let detectedAddress: string | null = null;
    try {
      if (Array.isArray(walletObj)) detectedAddress = walletObj[0];
      else if (typeof walletObj === "string") detectedAddress = walletObj;
      else if (walletObj?.address) detectedAddress = walletObj.address;
      else if (walletObj?.selectedAddress) detectedAddress = walletObj.selectedAddress;
      else if (Array.isArray((walletObj as any)?.accounts)) detectedAddress = (walletObj as any).accounts[0];
      else if (typeof walletObj.request === "function") {
        try {
          const accs = await walletObj.request({ type: "wallet_requestAccounts" });
          if (Array.isArray(accs) && accs.length > 0) detectedAddress = accs[0];
        } catch {}
      }
      if (!detectedAddress) {
        if (typeof window !== "undefined") {
          const w = window as any;
          if (w.starknet?.selectedAddress) detectedAddress = w.starknet.selectedAddress;
        }
      }
      if (!detectedAddress) throw new WalletNotAvailableError("Account unavailable");
      this._address = detectedAddress as Hex;
      logStep("STEP_7_ADDRESS_DETECTED", true, { data: { address: this._address.slice(0, 10) + "..." } });
    } catch (e) {
      logStep("STEP_7_ADDRESS_DETECTED", false, { error: e });
      throw e;
    }

    const normalizeChainId = (raw: unknown): string | null => {
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "bigint") return "0x" + raw.toString(16);
      if (typeof raw === "number") return "0x" + raw.toString(16);
      if (typeof raw === "string") {
        const s = raw.trim();
        if (s === "") return null;
        if (s === "SN_SEPOLIA") return "0x534e5f5345504f4c4941";
        if (s === "SN_MAIN") return "0x534e5f5f4d41494e";
        if (s.startsWith("0x")) return s;
        const n = Number(s);
        if (!Number.isNaN(n)) return "0x" + n.toString(16);
        return s;
      }
      return null;
    };

    let walletChainId: string | null = null;
    try {
      if (typeof walletObj.request === "function") {
        for (const method of ["wallet_requestChainId", "starknet_chainId"]) {
          try {
            const result = await walletObj.request({ type: method });
            const normalized = normalizeChainId(result);
            if (normalized) {
              walletChainId = normalized;
              logStep("STEP_8_CHAIN_ID_DETECTED", true, { data: { method, normalized } });
              break;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {}

    let providerChainId: string | null = null;
    try {
      const chainId = (await this._provider.getChainId()) as unknown;
      providerChainId = normalizeChainId(chainId);
    } catch {}

    this._chainId = walletChainId ?? providerChainId ?? null;
    logStep("STEP_8_CHAIN_ID_DETECTED", !!this._chainId, { data: { chainId: this._chainId } });

    try {
      this._caps = await this.detectCapabilities(walletObj);
      logStep("STEP_9_CAPABILITY_DETECTION", true, { data: { capabilities: this._caps as any } });
    } catch (e) {
      logStep("STEP_9_CAPABILITY_DETECTION", false, { error: e });
      this._caps = EMPTY_CAPS;
    }

    if (!this._address) throw new WalletNotAvailableError("Address missing after detection");
    this._state = {
      status: "connected",
      address: this._address,
      chainId: this._chainId,
      walletName: this.getWalletName(walletObj),
      capabilities: this._caps,
    };

    logStep("STEP_10_CONNECTION_COMPLETE", true, { data: { address: this._address.slice(0, 10) + "...", chainId: this._chainId } });

    try {
      localStorage.setItem("holographic:wallet:adapter", "walletconnect");
      localStorage.setItem("holographic:wallet", "1");
    } catch {}

    return this._state;
  }

  async connectSilent(): Promise<WalletState> {
    logStep("STEP_1_DISCOVERY_STARTED", true, { message: "Mobile silent reconnect started", data: { adapter: this.id } });
    try {
      const { getStarknet } = await import("@starknet-io/get-starknet-core");
      const starknet = getStarknet();
      const lastWallet = await starknet.getLastConnectedWallet();
      if (!lastWallet) throw new WalletNotAvailableError("No last mobile wallet for silent reconnect");

      const { RpcProvider: RpcProviderSilent } = await import("starknet");
      this._provider = new RpcProviderSilent({ nodeUrl: SEPOLIA_RPC_URL });
      let address: string | null = null;
      try {
        if (typeof (lastWallet as any).request === "function") {
          const accounts = await (lastWallet as any).request({ type: "wallet_requestAccounts", params: { silent_mode: true } });
          if (Array.isArray(accounts) && accounts.length > 0) address = accounts[0];
        }
      } catch {}

      if (!address) throw new WalletNotAvailableError("Silent mobile: no address without prompt");

      this._address = address as Hex;
      this._walletObj = lastWallet;

      try {
        const chainId = (await this._provider.getChainId()) as unknown;
        this._chainId = typeof chainId === "bigint" ? "0x" + chainId.toString(16) : typeof chainId === "string" ? chainId : String(chainId ?? "");
      } catch {
        this._chainId = null;
      }

      this._caps = EMPTY_CAPS;
      this._state = {
        status: "connected",
        address: this._address,
        chainId: this._chainId,
        walletName: this.getWalletName(lastWallet),
        capabilities: this._caps,
      };
      logStep("STEP_10_CONNECTION_COMPLETE", true, { data: { silent: true, address: this._address.slice(0, 10) + "..." } });
      return this._state;
    } catch (e) {
      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", false, { message: "Mobile silent reconnect failed", error: e });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    try {
      const { disconnect } = await import("@starknet-io/get-starknet");
      await disconnect();
    } catch {}
    this._provider = null;
    this._walletObj = null;
    this._address = null;
    this._chainId = null;
    this._caps = EMPTY_CAPS;
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

  isConnected(): boolean {
    return !!this._address && this._state.status === "connected";
  }

  getAddress(): Hex | null {
    return this._address;
  }

  getAccount(): Hex | null {
    return this._address;
  }

  getRealAccount(): any | null {
    return this._walletObj;
  }

  getProvider(): any | null {
    return this._provider;
  }

  getChainId(): string | null {
    return this._chainId;
  }

  getStatus() {
    return this._state.status;
  }

  async getCapabilities(): Promise<WalletCapabilities> {
    return this._caps;
  }

  async request<T>(type: string, params?: unknown): Promise<T> {
    if (!this._walletObj) throw new WalletNotAvailableError("Wallet not connected");
    if (typeof this._walletObj.request === "function") {
      return this._walletObj.request({ type, params });
    }
    throw new WalletNotAvailableError(`Wallet does not support request ${type}`);
  }

  getInternalState(): WalletState {
    return this._state;
  }

  private async detectCapabilities(walletObj: any): Promise<WalletCapabilities> {
    try {
      if (!walletObj?.request) return EMPTY_CAPS;
      const specs = await walletObj.request({ type: "wallet_supportedSpecs" });
      return {
        privacyApi: Array.isArray(specs) && specs.some((s: string) => s.includes("0.10")),
        specVersion: Array.isArray(specs) ? specs[0] ?? null : null,
        shield: false,
        privateTransfer: false,
        privateSwap: false,
        multicall: false,
      };
    } catch {
      return EMPTY_CAPS;
    }
  }

  private getWalletName(walletObj: any): string {
    try {
      return walletObj?.name ?? walletObj?.id ?? "Mobile wallet";
    } catch {
      return "Mobile wallet";
    }
  }
}
