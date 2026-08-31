import { useCallback, useEffect, useState } from "react";
import type { Hex, WalletCapabilities, WalletState } from "../types";
import {
  getMockWalletAdapter,
  getReadyWalletAdapter,
  getWalletConnectAdapter,
  getRealWalletAdapter,
  detectPreferredAdapterKind,
  type WalletAdapter,
  type WalletAdapterKind,
} from "./adapters";
import { WrongNetworkError } from "./adapters/types";
import { logStep, getLogs, clearLogs } from "./debugLogger";
import type { LogEntry } from "./debugLogger";

const EMPTY_CAPS: WalletCapabilities = {
  privacyApi: false,
  specVersion: null,
  shield: false,
  privateTransfer: false,
  privateSwap: false,
  multicall: false,
};

export type WalletConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "NETWORK_VERIFIED"
  | "PRIVACY_CAPABLE"
  | "ERROR"
  | "DEMO_MODE"
  | "WRONG_NETWORK";

interface DiagnosticInfo {
  walletName: string | null;
  network: string | null;
  chainId: string | null;
  blockNumber?: number;
  connectionStatus: WalletConnectionStatus;
  isMock: boolean;
  adapterKind: WalletAdapterKind;
  error?: string;
  errorClass?: string;
  errorCode?: string | number;
  detectionState?: {
    hasWindowStarknet: boolean;
    hasReady: boolean;
    availableCount: number;
    availableIds: string[];
    discoveryCount?: number;
  };
  logs?: LogEntry[];
  expectedChain?: string;
  detectedChain?: string;
}

export function useWallet() {
  const [adapter, setAdapter] = useState<WalletAdapter>(() => getMockWalletAdapter());
  const [state, setState] = useState<WalletState>(() => {
    const mock = getMockWalletAdapter();
    return mock.getInternalState();
  });
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo>({
    walletName: null,
    network: null,
    chainId: null,
    connectionStatus: "DISCONNECTED",
    isMock: true,
    adapterKind: "mock",
  });
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{
    errorClass: string;
    errorMessage: string;
    errorCode?: string | number;
    adapter: string;
    step?: string;
  } | null>(null);

  const refreshDiagnostic = useCallback(async (currentAdapter: WalletAdapter, currentState: WalletState) => {
    const isMock = currentAdapter.isMock;
    let blockNumber: number | undefined;
    let network: string | null = null;

    if (!isMock) {
      try {
        const provider = (currentAdapter as unknown as { getProvider: () => any | null }).getProvider?.() as any | null;
        if (provider) {
          try {
            const block = await provider.getBlockNumber();
            blockNumber = typeof block === "bigint" ? Number(block) : (block as number);
          } catch {}
          try {
            const chainId = currentState.chainId;
            if (chainId?.toLowerCase().includes("sepolia") || chainId?.toLowerCase().includes("534e5f5345504f4c4941")) {
              network = "Sepolia";
            } else if (chainId?.toLowerCase().includes("main") || chainId?.toLowerCase().includes("534e5f5f4d41494e")) {
              network = "Mainnet";
            } else {
              network = chainId ?? "Unknown";
            }
          } catch {}
        }
      } catch {}
    } else {
      network = "Demo Mode";
    }

    let connectionStatus: WalletConnectionStatus = "DISCONNECTED";
    if (currentState.status === "connecting") {
      connectionStatus = "CONNECTING";
    } else if (currentState.status === "connected") {
      if (isMock) {
        connectionStatus = "DEMO_MODE";
      } else if (currentState.capabilities.privacyApi) {
        connectionStatus = "PRIVACY_CAPABLE";
      } else if (currentState.chainId) {
        // Check wrong network
        const isSepolia = currentState.chainId.toLowerCase().includes("534e5f5345504f4c4941") || currentState.chainId.toLowerCase().includes("sepolia");
        const isMainnet = currentState.chainId.toLowerCase().includes("534e5f5f4d41494e") || currentState.chainId.toLowerCase().includes("main");
        if (isMainnet) {
          connectionStatus = "WRONG_NETWORK";
          network = "Mainnet (expected Sepolia)";
        } else if (isSepolia) {
          connectionStatus = "NETWORK_VERIFIED";
        } else {
          connectionStatus = "CONNECTED";
        }
      } else {
        connectionStatus = "CONNECTED";
      }
    }

    setDiagnostic((prev) => ({
      ...prev,
      walletName: currentState.walletName,
      network,
      chainId: currentState.chainId,
      blockNumber,
      connectionStatus,
      isMock,
      adapterKind: (currentAdapter.id as WalletAdapterKind) ?? "mock",
      logs: getLogs(),
    }));
  }, []);

  const connectWithAdapter = useCallback(async (targetAdapter: WalletAdapter) => {
    clearLogs();
    setState((s) => ({ ...s, status: "connecting" }));
    setError(null);
    setErrorDetails(null);

    // Capture detection state before connect
    let detectionState: DiagnosticInfo["detectionState"] = {
      hasWindowStarknet: false,
      hasReady: false,
      availableCount: 0,
      availableIds: [],
    };

    try {
      if (typeof window !== "undefined") {
        const w = window as Record<string, unknown>;
        detectionState = {
          hasWindowStarknet: !!w["starknet"],
          hasReady: !!(w["starknet_ready"] ?? w["starknet"]),
          availableCount: 0,
          availableIds: [],
        };
      }
      try {
        const { getStarknet } = await import("@starknet-io/get-starknet-core");
        const starknet = getStarknet();
        const available = (await starknet.getAvailableWallets()) as any[];
        detectionState.availableCount = available.length;
        detectionState.availableIds = available.map((w: any) => w.id ?? w.name ?? "unknown");
        const discovery = (await starknet.getDiscoveryWallets()) as any[];
        detectionState.discoveryCount = discovery.length;
      } catch {}
    } catch {}

    setDiagnostic((prev) => ({
      ...prev,
      detectionState,
      adapterKind: targetAdapter.id as WalletAdapterKind,
      isMock: targetAdapter.isMock,
    }));

    try {
      const result = await targetAdapter.connect();
      setAdapter(targetAdapter);
      setState(result);
      await refreshDiagnostic(targetAdapter, result);
      return result;
    } catch (e) {
      const err = e as any;
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = err?.name ?? err?.constructor?.name ?? "UnknownError";
      const errorCode = err?.code ?? err?.status ?? undefined;

      logStep("STEP_6_WALLET_AUTHORIZATION_RESULT" as any, false, {
        message: `Connect failed in ${targetAdapter.id}`,
        error: e,
        data: { adapter: targetAdapter.id },
      });

      setErrorDetails({
        errorClass,
        errorMessage: msg,
        errorCode,
        adapter: targetAdapter.id,
        step: "WalletAccountV6.connect",
      });

      if (msg.toLowerCase().includes("no wallet") || msg.toLowerCase().includes("not detected") || msg.toLowerCase().includes("not installed")) {
        setError("Wallet not installed. Install Ready (https://ready.co) or Xverse.");
        setState({
          status: "disconnected",
          address: null,
          chainId: null,
          walletName: null,
          capabilities: EMPTY_CAPS,
        });
        setDiagnostic((prev) => ({
          ...prev,
          connectionStatus: "ERROR",
          error: "Wallet not detected",
          errorClass,
          errorCode,
          isMock: targetAdapter.isMock,
          adapterKind: targetAdapter.id as WalletAdapterKind,
          detectionState,
          logs: getLogs(),
        }));
        // Clear any stale wallet flag to prevent auto demo mode
        try {
          localStorage.removeItem("holographic:wallet");
          localStorage.removeItem("holographic:wallet:adapter");
        } catch {}
        throw e;
      }

      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("rejected")) {
        setError("User rejected connection");
        setState((s) => ({ ...s, status: "disconnected" }));
        setDiagnostic((prev) => ({
          ...prev,
          connectionStatus: "ERROR",
          error: "User rejected",
          errorClass,
          errorCode,
          isMock: targetAdapter.isMock,
          adapterKind: targetAdapter.id as WalletAdapterKind,
          detectionState,
          logs: getLogs(),
        }));
        throw e;
      }

      if (e instanceof WrongNetworkError) {
        setError(`Wrong network: ${msg}`);
        setDiagnostic((prev) => ({
          ...prev,
          connectionStatus: "WRONG_NETWORK",
          error: msg,
          errorClass,
          errorCode,
          isMock: targetAdapter.isMock,
          adapterKind: targetAdapter.id as WalletAdapterKind,
          expectedChain: "Starknet Sepolia (0x534e5f5345504f4c4941)",
          detectedChain: prev.chainId ?? "unknown",
          detectionState,
          logs: getLogs(),
        }));
        throw e;
      }

      // Do NOT fallback to Demo Mode automatically per TASK 10 — stay DISCONNECTED
      // Clear stale flags to prevent auto demo mode on reload
      try {
        localStorage.removeItem("holographic:wallet");
        localStorage.removeItem("holographic:wallet:adapter");
      } catch {}
      setError(`Unable to connect wallet. ${msg}`);
      setState((s) => ({ ...s, status: "disconnected" }));
      setDiagnostic((prev) => ({
        ...prev,
        connectionStatus: "ERROR",
        error: msg,
        errorClass,
        errorCode,
        isMock: targetAdapter.isMock,
        adapterKind: targetAdapter.id as WalletAdapterKind,
        detectionState,
        logs: getLogs(),
      }));
      throw e;
    }
  }, [refreshDiagnostic]);

  const connect = useCallback(async (preferReal = false) => {
    if (preferReal) {
      try {
        return await connectWithAdapter(getReadyWalletAdapter());
      } catch (e) {
        // Do NOT fallback to Demo Mode automatically — stay DISCONNECTED per TASK 10
        throw e;
      }
    }
    const preferred = detectPreferredAdapterKind();
    let target: WalletAdapter;
    switch (preferred) {
      case "ready":
        target = getReadyWalletAdapter();
        break;
      case "walletconnect":
        target = getWalletConnectAdapter();
        break;
      case "real":
        target = getRealWalletAdapter();
        break;
      default:
        target = getMockWalletAdapter();
        break;
    }
    return connectWithAdapter(target);
  }, [connectWithAdapter]);

  const connectReady = useCallback(async () => {
    return connectWithAdapter(getReadyWalletAdapter());
  }, [connectWithAdapter]);

  const connectWalletConnect = useCallback(async () => {
    return connectWithAdapter(getWalletConnectAdapter());
  }, [connectWithAdapter]);

  const connectReal = useCallback(async () => {
    return connectWithAdapter(getRealWalletAdapter());
  }, [connectWithAdapter]);

  const connectMock = useCallback(async () => {
    const mockAdapter = getMockWalletAdapter();
    const result = await connectWithAdapter(mockAdapter);
    return result;
  }, [connectWithAdapter]);

  const disconnect = useCallback(async () => {
    try {
      await adapter.disconnect();
    } finally {
      setState({
        status: "disconnected",
        address: null,
        chainId: null,
        walletName: null,
        capabilities: EMPTY_CAPS,
      });
      setError(null);
      setErrorDetails(null);
      clearLogs();
      setDiagnostic({
        walletName: null,
        network: null,
        chainId: null,
        connectionStatus: "DISCONNECTED",
        isMock: true,
        adapterKind: "mock",
        logs: [],
      });
      setAdapter(getMockWalletAdapter());
      try {
        localStorage.removeItem("holographic:wallet:adapter");
        localStorage.removeItem("holographic:wallet");
        localStorage.removeItem("holographic:wallet:address");
      } catch {}
    }
  }, [adapter]);

  // TASK 6 — Fix auto-reconnect: silent only, never prompt on reload
  useEffect(() => {
    let cancelled = false;
    const trySilentReconnect = async () => {
      try {
        if (typeof window === "undefined") return;
        if (localStorage.getItem("holographic:wallet") !== "1") return;
        const preferred = detectPreferredAdapterKind();
        if (preferred === "mock") {
          // Do NOT auto-enter demo mode — user must explicitly click Demo Mode
          // This fixes the reported bug where demo mode automatically enters
          return;
        }
        if (preferred === "ready" || preferred === "walletconnect" || preferred === "real") {
          const targetAdapter =
            preferred === "walletconnect"
              ? getWalletConnectAdapter()
              : preferred === "ready"
                ? getReadyWalletAdapter()
                : getRealWalletAdapter();
          try {
            if (targetAdapter.connectSilent) {
              const result = await targetAdapter.connectSilent();
              if (!cancelled) {
                setAdapter(targetAdapter as WalletAdapter);
                setState(result);
                await refreshDiagnostic(targetAdapter as WalletAdapter, result);
              }
              return;
            }
          } catch {
            return;
          }
          return;
        }
      } catch {}
    };
    void trySilentReconnect();
    return () => {
      cancelled = true;
    };
  }, [refreshDiagnostic]);

  useEffect(() => {
    if (state.status !== "connected") return;
    const interval = setInterval(() => {
      void refreshDiagnostic(adapter, state);
    }, 15000);
    void refreshDiagnostic(adapter, state);
    return () => clearInterval(interval);
  }, [state, adapter, refreshDiagnostic]);

  const getAccount = useCallback((): Hex | null => adapter.getAccount(), [adapter]);
  const getAddress = useCallback((): Hex | null => {
    return (adapter as any).getAddress?.() ?? adapter.getAccount();
  }, [adapter]);
  const getChainId = useCallback((): string | null => adapter.getChainId(), [adapter]);
  const getProvider = useCallback(() => {
    return (adapter as any).getProvider?.() ?? null;
  }, [adapter]);
  const getRealAccount = useCallback(() => {
    return (adapter as any).getRealAccount?.() ?? null;
  }, [adapter]);
  const getCapabilities = useCallback(() => adapter.getCapabilities(), [adapter]);
  const isConnected = useCallback(() => adapter.isConnected(), [adapter]);

  return {
    wallet: state,
    adapter,
    diagnostic,
    error,
    errorDetails,
    connect,
    connectReady,
    connectWalletConnect,
    connectReal,
    connectMock,
    disconnect,
    getAccount,
    getAddress,
    getChainId,
    getProvider,
    getRealAccount,
    getCapabilities,
    isConnected,
  };
}

export const chainLabel = (chainId: string | null) => {
  if (!chainId) return "Disconnected";
  const lower = chainId.toLowerCase();
  if (lower.includes("534e5f5f4d41494e") || lower.includes("main") || lower.includes("0x534e5f5f4d41494e")) return "Starknet Mainnet";
  if (lower.includes("534e5f5345504f4c4941") || lower.includes("sepolia") || lower.includes("0x534e5f5345504f4c4941")) return "Starknet Sepolia";
  return chainId.slice(0, 18);
};
