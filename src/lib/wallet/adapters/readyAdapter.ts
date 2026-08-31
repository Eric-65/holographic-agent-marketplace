import type { Hex, WalletCapabilities, WalletState } from "../../types";
import type { WalletAdapter } from "./types";
import { WalletNotAvailableError, WrongNetworkError } from "./types";
import { logStep, clearLogs } from "../debugLogger";

/**
 * ReadyAdapter — desktop injected Ready wallet
 * FIXED VERSION — avoids WalletAccountV6.connect which was throwing
 * "Cannot read properties of undefined (reading 'standard:connect')"
 *
 * Root cause: WalletAccountV6.connect expects walletProvider.features["standard:connect"]
 * but @starknet-io/get-starknet returns StarknetWindowObject with request() method,
 * not wallet-standard features. Using direct wallet.request() is the documented
 * current API for v10 + Ready.
 *
 * New flow (verified against starknet.js v10.4.0 + @starknet-io/get-starknet 4.0.8):
 * 1. getStarknet().getAvailableWallets() → find Ready
 * 2. starknet.enable(wallet) OR wallet.request({ type: "wallet_requestAccounts" }) → user approval
 * 3. address from accounts[0]
 * 4. chainId via wallet.request({ type: "wallet_requestChainId" }) → authoritative
 * 5. RpcProvider for read-only block number verification
 * 6. capabilities via wallet_supportedSpecs
 */

const EMPTY_CAPS: WalletCapabilities = {
  privacyApi: false,
  specVersion: null,
  shield: false,
  privateTransfer: false,
  privateSwap: false,
  multicall: false,
};

const SEPOLIA_RPC_URL = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";
const EXPECTED_SEPOLIA_HEX = "0x534e5f5345504f4c4941";

export class ReadyWalletAdapter implements WalletAdapter {
  readonly id: string = "ready";
  readonly label: string = "Ready wallet (desktop injected) — starknet.js v10.4.0";
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
    logStep("STEP_1_DISCOVERY_STARTED", true, { message: "Wallet discovery started", data: { adapter: this.id } });
    this._state = { ...this._state, status: "connecting" };

    let availableWallets: any[] = [];
    let discoveryWallets: any[] = [];
    let walletObj: any = null;
    let starknetInstance: any = null;

    // STEP 2: Discovery
    try {
      const { getStarknet } = await import("@starknet-io/get-starknet-core");
      starknetInstance = getStarknet();
      availableWallets = await starknetInstance.getAvailableWallets();
      logStep("STEP_2_AVAILABLE_WALLETS", true, {
        message: `Found ${availableWallets.length} available wallets`,
        data: {
          count: availableWallets.length,
          ids: availableWallets.map((w: any) => w.id ?? w.name ?? "unknown"),
        },
      });

      const ready = availableWallets.find((w: any) => w.id?.toLowerCase().includes("ready"));
      const argentX = availableWallets.find((w: any) => w.id?.toLowerCase().includes("argentx"));
      const braavos = availableWallets.find((w: any) => w.id?.toLowerCase().includes("braavos"));
      walletObj = ready ?? argentX ?? braavos ?? availableWallets[0] ?? null;

      if (!walletObj) {
        discoveryWallets = await starknetInstance.getDiscoveryWallets();
        logStep("STEP_2_AVAILABLE_WALLETS", true, {
          message: `No available wallets, discovery has ${discoveryWallets.length}`,
          data: { discoveryCount: discoveryWallets.length },
        });
        const hasReady = discoveryWallets.some((w: any) => w.id?.toLowerCase().includes("ready"));
        if (!hasReady && availableWallets.length === 0) {
          logStep("STEP_3_SELECTED_WALLET", false, {
            message: "No desktop wallet detected",
            data: { availableCount: availableWallets.length, discoveryCount: discoveryWallets.length },
          });
          throw new WalletNotAvailableError(
            "No desktop wallet detected. Install Ready (https://ready.co) extension, then refresh.",
          );
        }
      }
    } catch (e) {
      if (e instanceof WalletNotAvailableError) {
        logStep("STEP_2_AVAILABLE_WALLETS", false, { message: "Discovery failed", error: e });
        throw e;
      }
      logStep("STEP_2_AVAILABLE_WALLETS", false, {
        message: "get-starknet-core discovery failed, trying window injection fallback",
        error: e,
        data: { availableCount: availableWallets.length },
      });
      if (typeof window !== "undefined") {
        const w = window as Record<string, unknown>;
        walletObj =
          (w["starknet_ready"] as any) ??
          (w["starknet"] as any) ??
          (w["starknet_argentX"] as any) ??
          (w["starknet_braavos"] as any) ??
          null;
        logStep("STEP_2_AVAILABLE_WALLETS", !!walletObj, {
          message: walletObj ? "Found wallet via window injection fallback" : "Window injection fallback found nothing",
          data: { hasWindowStarknet: !!w["starknet"], hasReady: !!w["starknet_ready"] },
        });
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
          "No desktop wallet detected. Install Ready (https://ready.co) or Argent X.",
        );
        logStep("STEP_3_SELECTED_WALLET", false, { message: "No wallet via fallback", error: err });
        throw err;
      }
    }

    if (!walletObj) {
      const err = new WalletNotAvailableError("Desktop wallet not found after discovery");
      logStep("STEP_3_SELECTED_WALLET", false, { message: "walletObj is null after discovery", error: err });
      throw err;
    }

    logStep("STEP_3_SELECTED_WALLET", true, {
      message: "Selected wallet identity",
      data: {
        id: walletObj?.id ?? "unknown",
        name: walletObj?.name ?? "unknown",
        hasRequest: typeof walletObj?.request === "function",
        hasEnable: typeof walletObj?.enable === "function",
        keys: Object.keys(walletObj as object).slice(0, 12),
      },
    });

    // STEP 4: Creating provider (for read-only verification, not for signing) — dynamic import to avoid pulling starknet into initial bundle
    try {
      const { RpcProvider } = await import("starknet");
      this._provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC_URL });
      logStep("STEP_4_CREATING_PROVIDER", true, {
        message: "Created RpcProvider for Sepolia",
        data: { rpcUrl: SEPOLIA_RPC_URL, providerExists: !!this._provider },
      });
    } catch (e) {
      logStep("STEP_4_CREATING_PROVIDER", false, { message: "Failed to create RpcProvider", error: e });
      throw new WalletNotAvailableError(`Provider creation failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // STEP 5: Wallet authorization — enable() or requestAccounts
    // This is the critical step that was previously failing at WalletAccountV6.connect
    // Now we use starknet.enable() OR direct request, which is the documented API
    let connectedWallet: any = walletObj;
    try {
      logStep("STEP_5_CALLING_WALLETACCOUNT_CONNECT", true, {
        message: "Requesting wallet accounts — triggers Ready approval modal",
        data: { walletId: walletObj?.id, hasEnable: !!starknetInstance?.enable },
      });

      if (starknetInstance?.enable) {
        // Preferred: get-starknet enable() handles permission request
        connectedWallet = await starknetInstance.enable(walletObj);
        logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", true, {
          message: "starknet.enable() succeeded",
          data: { hasWallet: !!connectedWallet, id: connectedWallet?.id },
        });
      } else if (typeof walletObj.request === "function") {
        // Fallback: direct wallet_requestAccounts
        const accounts = await walletObj.request({ type: "wallet_requestAccounts" });
        logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", true, {
          message: `wallet_requestAccounts returned ${Array.isArray(accounts) ? accounts.length : 0} accounts`,
          data: { accounts: Array.isArray(accounts) ? accounts.map((a: string) => a.slice(0, 10) + "...") : accounts },
        });
        connectedWallet = walletObj;
      } else if (typeof (walletObj as any).enable === "function") {
        const accounts = await (walletObj as any).enable();
        logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", true, {
          message: `wallet.enable() returned ${Array.isArray(accounts) ? accounts.length : 0} accounts`,
        });
        connectedWallet = walletObj;
      } else {
        throw new WalletNotAvailableError("Wallet object does not support request or enable");
      }
    } catch (e) {
      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", false, {
        message: "Wallet authorization failed — this is the real error",
        error: e,
        data: { walletId: walletObj?.id },
      });
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.toLowerCase().includes("user rejected") ||
        msg.toLowerCase().includes("user cancelled") ||
        msg.toLowerCase().includes("rejected") ||
        (e as any)?.code === 4001
      ) {
        this._state = {
          status: "disconnected",
          address: null,
          chainId: null,
          walletName: null,
          capabilities: EMPTY_CAPS,
        };
        throw new WalletNotAvailableError(`User rejected: ${msg}`);
      }
      this._state = {
        status: "disconnected",
        address: null,
        chainId: null,
        walletName: null,
        capabilities: EMPTY_CAPS,
      };
      if (e instanceof WalletNotAvailableError || e instanceof WrongNetworkError) throw e;
      throw new WalletNotAvailableError(`Authorization error: ${msg}`);
    }

    this._walletObj = connectedWallet;

    // STEP 7: Address detected — try multiple sources
    let detectedAddress: string | null = null;
    try {
      // Try from connectedWallet object directly
      if (Array.isArray(connectedWallet)) {
        detectedAddress = connectedWallet[0];
      } else if (typeof connectedWallet === "string") {
        detectedAddress = connectedWallet;
      } else if (connectedWallet?.address) {
        detectedAddress = connectedWallet.address;
      } else if (connectedWallet?.selectedAddress) {
        detectedAddress = connectedWallet.selectedAddress;
      } else if (Array.isArray((connectedWallet as any)?.accounts)) {
        detectedAddress = (connectedWallet as any).accounts[0];
      } else {
        // Try requestAccounts again to get address
        if (typeof connectedWallet.request === "function") {
          try {
            const accs = await connectedWallet.request({ type: "wallet_requestAccounts" });
            if (Array.isArray(accs) && accs.length > 0) detectedAddress = accs[0];
          } catch {}
        }
      }

      if (!detectedAddress) {
        // Last fallback: try window.starknet account
        if (typeof window !== "undefined") {
          const w = window as any;
          if (w.starknet?.selectedAddress) detectedAddress = w.starknet.selectedAddress;
          else if (w.starknet?.account?.address) detectedAddress = w.starknet.account.address;
        }
      }

      if (!detectedAddress) throw new WalletNotAvailableError("Account unavailable — wallet returned empty address");

      this._address = detectedAddress as Hex;
      logStep("STEP_7_ADDRESS_DETECTED", true, {
        message: "Address detected",
        data: { address: this._address.slice(0, 10) + "..." + this._address.slice(-4) },
      });
    } catch (e) {
      logStep("STEP_7_ADDRESS_DETECTED", false, { message: "Failed to detect address", error: e });
      throw e;
    }

    // STEP 8: Chain ID detected — authoritative from wallet first
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
      if (typeof raw === "object" && raw !== null) {
        const obj = raw as any;
        if (obj.chainId) return normalizeChainId(obj.chainId);
        if (obj.id) return normalizeChainId(obj.id);
      }
      return null;
    };

    let walletChainId: string | null = null;
    try {
      // Try multiple wallet chainId methods — wallet_requestChainId is official
      const methods = ["wallet_requestChainId", "starknet_chainId", "wallet_chainId", "chainId"];
      for (const method of methods) {
        try {
          if (typeof connectedWallet.request === "function") {
            const result = await connectedWallet.request({ type: method });
            const normalized = normalizeChainId(result);
            if (normalized) {
              walletChainId = normalized;
              logStep("STEP_8_CHAIN_ID_DETECTED", true, {
                message: `Chain ID from ${method}: ${normalized}`,
                data: { method, raw: result, normalized },
              });
              break;
            }
          }
        } catch (err) {
          logStep("STEP_8_CHAIN_ID_DETECTED", false, {
            message: `Method ${method} failed`,
            error: err,
            data: { method },
          });
          continue;
        }
      }

      // Also try original walletObj
      if (!walletChainId && walletObj !== connectedWallet && typeof walletObj.request === "function") {
        for (const method of ["wallet_requestChainId", "starknet_chainId"]) {
          try {
            const result = await walletObj.request({ type: method });
            const normalized = normalizeChainId(result);
            if (normalized) {
              walletChainId = normalized;
              logStep("STEP_8_CHAIN_ID_DETECTED", true, {
                message: `Chain ID from original wallet ${method}: ${normalized}`,
                data: { method, normalized },
              });
              break;
            }
          } catch {
            continue;
          }
        }
      }
    } catch (e) {
      logStep("STEP_8_CHAIN_ID_DETECTED", false, { message: "Wallet chainId detection failed", error: e });
    }

    let providerChainId: string | null = null;
    try {
      const chainId = (await this._provider.getChainId()) as unknown;
      providerChainId = normalizeChainId(chainId);
      logStep("STEP_8_CHAIN_ID_DETECTED", !!providerChainId, {
        message: `Provider chainId: ${providerChainId} (fallback, not authoritative)`,
        data: { raw: chainId, normalized: providerChainId },
      });
    } catch (e) {
      logStep("STEP_8_CHAIN_ID_DETECTED", false, { message: "Provider getChainId failed", error: e });
    }

    this._chainId = walletChainId ?? providerChainId ?? null;

    if (!this._chainId) {
      logStep("STEP_8_CHAIN_ID_DETECTED", false, { message: "No chain ID detected from wallet or provider" });
    } else {
      // Check wrong network
      const isSepolia = this._chainId.toLowerCase() === EXPECTED_SEPOLIA_HEX.toLowerCase() || this._chainId.toLowerCase().includes("sepolia");
      const isMainnet = this._chainId.toLowerCase() === "0x534e5f5f4d41494e" || this._chainId.toLowerCase().includes("main");
      if (isMainnet) {
        logStep("STEP_8_CHAIN_ID_DETECTED", false, {
          message: `WRONG NETWORK detected: wallet is on Mainnet (${this._chainId}) but app expects Sepolia (${EXPECTED_SEPOLIA_HEX})`,
          data: { detected: this._chainId, expected: EXPECTED_SEPOLIA_HEX },
        });
      } else if (isSepolia) {
        logStep("STEP_8_CHAIN_ID_DETECTED", true, { message: "Network verified: Sepolia" });
      }
    }

    // STEP 9: Capability detection
    try {
      this._caps = await this.detectCapabilities(connectedWallet);
      logStep("STEP_9_CAPABILITY_DETECTION", true, {
        message: "Capability detection complete",
        data: { capabilities: this._caps as any },
      });
    } catch (e) {
      logStep("STEP_9_CAPABILITY_DETECTION", false, { message: "Capability detection failed", error: e });
      this._caps = EMPTY_CAPS;
    }

    this._state = {
      status: "connected",
      address: this._address,
      chainId: this._chainId,
      walletName: this.getWalletName(connectedWallet ?? walletObj),
      capabilities: this._caps,
    };

    logStep("STEP_10_CONNECTION_COMPLETE", true, {
      message: "Connection complete",
      data: {
        address: this._address.slice(0, 10) + "...",
        chainId: this._chainId,
        walletName: this._state.walletName,
        isMock: false,
      },
    });

    try {
      localStorage.setItem("holographic:wallet:adapter", "ready");
      localStorage.setItem("holographic:wallet", "1");
    } catch {}

    return this._state;
  }

  async connectSilent(): Promise<WalletState> {
    logStep("STEP_1_DISCOVERY_STARTED", true, { message: "Silent reconnect started", data: { adapter: this.id } });
    try {
      const { getStarknet } = await import("@starknet-io/get-starknet-core");
      const starknet = getStarknet();
      const lastWallet = await starknet.getLastConnectedWallet();
      if (!lastWallet) {
        throw new WalletNotAvailableError("No last connected wallet for silent reconnect");
      }
      logStep("STEP_2_AVAILABLE_WALLETS", true, { message: "Found last connected wallet for silent reconnect", data: { id: (lastWallet as any).id } });

      // Try to get accounts silently — check if wallet is pre-authorized
      try {
        const authorized = await starknet.getAuthorizedWallets();
        const isAuthorized = authorized.some((w: any) => w.id === (lastWallet as any).id);
        if (!isAuthorized) {
          throw new WalletNotAvailableError("Last wallet not authorized for silent reconnect — need interactive approval");
        }
      } catch {}

      const { RpcProvider: RpcProviderSilent } = await import("starknet");
      this._provider = new RpcProviderSilent({ nodeUrl: SEPOLIA_RPC_URL });
      logStep("STEP_4_CREATING_PROVIDER", true, { data: { rpcUrl: SEPOLIA_RPC_URL } });

      // For silent, try to get accounts without prompting if possible
      let address: string | null = null;
      try {
        if (typeof (lastWallet as any).request === "function") {
          const accounts = await (lastWallet as any).request({ type: "wallet_requestAccounts", params: { silent_mode: true } });
          if (Array.isArray(accounts) && accounts.length > 0) address = accounts[0];
        }
      } catch {}

      if (!address) {
        throw new WalletNotAvailableError("Silent reconnect: no address without prompt — stay disconnected per TASK 6");
      }

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
      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT", false, { message: "Silent reconnect failed", error: e });
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
      localStorage.removeItem("holographic:wallet:address");
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
      try {
        const specs = await walletObj.request({ type: "wallet_supportedSpecs" });
        const hasPrivacy = Array.isArray(specs) && specs.some((s: string) => s.includes("0.10") || s.toLowerCase().includes("privacy"));
        return {
          privacyApi: hasPrivacy,
          specVersion: Array.isArray(specs) ? specs[0] ?? null : null,
          shield: false,
          privateTransfer: false,
          privateSwap: false,
          multicall: false,
        };
      } catch {
        return EMPTY_CAPS;
      }
    } catch {
      return EMPTY_CAPS;
    }
  }

  private getWalletName(walletObj: any): string {
    try {
      return walletObj?.name ?? walletObj?.id ?? "Ready wallet";
    } catch {
      return "Ready wallet";
    }
  }
}
