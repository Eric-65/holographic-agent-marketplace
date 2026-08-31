import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, LogOut, Wallet as WalletIcon, AlertTriangle, Monitor, Smartphone, FlaskConical } from "lucide-react";
import { short } from "../lib/hash";
import { chainLabel } from "../lib/wallet/useWallet";
import type { WalletState } from "../lib/types";
import { Badge, Button, Dot } from "./ui/primitives";

type Diagnostic = {
  walletName: string | null;
  network: string | null;
  chainId: string | null;
  blockNumber?: number;
  connectionStatus: string;
  isMock: boolean;
  adapterKind?: string;
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
  expectedChain?: string;
  detectedChain?: string;
  logs?: { step: string; success: boolean; error?: { name: string; message: string; code?: string | number }; message?: string }[];
};

type Props = {
  wallet: WalletState;
  diagnostic?: Diagnostic;
  error?: string | null;
  errorDetails?: { errorClass: string; errorMessage: string; errorCode?: string | number; adapter: string; step?: string } | null;
  onConnect: () => void | Promise<unknown>;
  onConnectReal?: () => void | Promise<unknown>;
  onConnectReady?: () => void | Promise<unknown>;
  onConnectWalletConnect?: () => void | Promise<unknown>;
  onConnectMock?: () => void | Promise<unknown>;
  onDisconnect: () => void | Promise<void>;
};

export default function WalletConnect({
  wallet,
  diagnostic,
  error,
  errorDetails,
  onConnect,
  onConnectReal,
  onConnectReady,
  onConnectWalletConnect,
  onConnectMock,
  onDisconnect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (chooserRef.current && !chooserRef.current.contains(e.target as Node)) setChooserOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const status = diagnostic?.connectionStatus ?? (wallet.status === "connected" ? "CONNECTED" : wallet.status === "connecting" ? "CONNECTING" : "DISCONNECTED");
  const isDemo = diagnostic?.isMock ?? wallet.walletName?.toLowerCase().includes("mock") ?? false;

  // DISCONNECTED — chooser
  if (wallet.status !== "connected") {
    return (
      <div className="relative overflow-visible" ref={chooserRef}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setChooserOpen((o) => !o)}
          disabled={wallet.status === "connecting"}
          title={error ?? undefined}
          className="pointer-events-auto"
        >
          <WalletIcon size={13} />
          {wallet.status === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>

        {chooserOpen && (
          <div className="absolute right-0 mt-2 w-[340px] rounded-xl z-[60] shadow-xl flex flex-col max-h-[85vh] overflow-hidden border"
               style={{ background: "color-mix(in oklab, var(--bg-2) 94%, rgb(var(--surface-rgb) / 0.5))", backdropFilter: "blur(24px) saturate(150%)" }}>
            <div className="p-3 pb-2 shrink-0">
              <div className="text-[11px] faint uppercase tracking-wider">Choose connection</div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-thin">
              <button
                onClick={() => {
                  setChooserOpen(false);
                  void (onConnectReady ? onConnectReady() : onConnectReal ? onConnectReal() : onConnect());
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg surface hover:surface-2 flex items-center gap-3 transition-all pointer-events-auto"
              >
                <span className="h-8 w-8 rounded-lg grid place-items-center surface-2">
                  <Monitor size={14} style={{ color: "var(--accent-3)" }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-medium">Desktop Wallet</span>
                  <span className="block text-[11px] faint">Ready / Argent X / Braavos (injected)</span>
                </span>
              </button>

              <button
                onClick={() => {
                  setChooserOpen(false);
                  void (onConnectWalletConnect ? onConnectWalletConnect() : onConnectReal ? onConnectReal() : onConnect());
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg surface hover:surface-2 flex items-center gap-3 transition-all pointer-events-auto"
              >
                <span className="h-8 w-8 rounded-lg grid place-items-center surface-2">
                  <Smartphone size={14} style={{ color: "var(--accent)" }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-medium">Mobile WalletConnect</span>
                  <span className="block text-[11px] faint">Argent Mobile / Braavos Mobile via QR</span>
                </span>
              </button>

              <div className="h-px my-2" style={{ background: "var(--border)" }} />

              <button
                onClick={() => {
                  setChooserOpen(false);
                  void (onConnectMock ? onConnectMock() : onConnect());
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--track)] flex items-center gap-3 transition-all pointer-events-auto"
              >
                <span className="h-7 w-7 rounded-lg grid place-items-center" style={{ background: "color-mix(in oklab, var(--warn) 14%, transparent)" }}>
                  <FlaskConical size={12} style={{ color: "var(--warn)" }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] dim">Demo Mode</span>
                  <span className="block text-[10.5px] faint">Mock wallet — no extension needed</span>
                </span>
              </button>

              {status === "ERROR" && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] px-2.5 py-2 rounded flex items-start gap-1.5" style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad)" }}>
                    <AlertTriangle size={11} className="mt-[1px] shrink-0" />
                    <span className="break-words">Unable to connect wallet. {error ?? ""}</span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setChooserOpen(false)}>
                    Try again
                  </Button>

                  <div className="rounded-lg p-2.5 mono text-[10.5px] space-y-1" style={{ background: "var(--track)" }}>
                    <div className="text-[10px] uppercase tracking-wider faint">Developer diagnostic</div>
                    <div>Error class: {errorDetails?.errorClass ?? diagnostic?.errorClass ?? "—"}</div>
                    <div>Error message: {errorDetails?.errorMessage ?? diagnostic?.error ?? error ?? "—"}</div>
                    <div>Error code: {String(errorDetails?.errorCode ?? diagnostic?.errorCode ?? "—")}</div>
                    <div>Adapter: {errorDetails?.adapter ?? diagnostic?.adapterKind ?? "—"}</div>
                    <div>Wallet name: {diagnostic?.walletName ?? "—"}</div>
                    <div>Chain ID: {diagnostic?.chainId ?? "—"}</div>
                    <div>Network: {diagnostic?.network ?? "—"}</div>
                    <div>Expected: {diagnostic?.expectedChain ?? "Starknet Sepolia (0x534e5f5345504f4c4941)"}</div>
                    <div>Detected window.starknet: {String(diagnostic?.detectionState?.hasWindowStarknet ?? false)}</div>
                    <div>Detected Ready: {String(diagnostic?.detectionState?.hasReady ?? false)}</div>
                    <div>Available wallets: {diagnostic?.detectionState?.availableCount ?? 0} [{diagnostic?.detectionState?.availableIds?.join(", ") ?? ""}]</div>
                    {diagnostic?.logs && diagnostic.logs.length > 0 && (
                      <div className="pt-1 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
                        <div className="faint mb-1">Steps:</div>
                        {diagnostic.logs.slice(-6).map((l, i) => (
                          <div key={i} className={l.success ? "" : "text-[var(--bad)]"}>
                            {l.step}: {l.success ? "✓" : `✗ ${l.error?.message?.slice(0, 80) ?? l.message ?? ""}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {status === "WRONG_NETWORK" && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] px-2.5 py-2 rounded" style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)", color: "var(--warn)" }}>
                    <div className="font-medium">WRONG NETWORK</div>
                    <div>Expected: Starknet Sepolia</div>
                    <div>Detected: {diagnostic?.network ?? diagnostic?.chainId ?? "unknown"}</div>
                    <div className="mt-1 faint">Switch network in your wallet to Sepolia, then reconnect.</div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 pt-2 border-t shrink-0 text-[10.5px] faint leading-relaxed" style={{ borderColor: "var(--border)" }}>
              Desktop uses injected Ready wallet via starknet.js v10.4.0 + @starknet-io/get-starknet. Mobile uses WalletConnect QR. STRK20 transactions not yet implemented.
            </div>
          </div>
        )}
      </div>
    );
  }

  // CONNECTED — wallet details dropdown with real Disconnect
  const tone: "good" | "warn" | "neutral" | "bad" =
    status === "PRIVACY_CAPABLE" ? "good" : status === "NETWORK_VERIFIED" ? "good" : status === "CONNECTED" ? "good" : status === "DEMO_MODE" ? "warn" : status === "WRONG_NETWORK" ? "bad" : "neutral";

  return (
    <div className="relative overflow-visible" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-8 pl-2.5 pr-2 rounded-lg surface hover:surface-2 inline-flex items-center gap-2 text-[12px] transition-all pointer-events-auto"
      >
        <Dot tone={status === "ERROR" ? "bad" : status === "WRONG_NETWORK" ? "bad" : isDemo ? "warn" : "good"} pulse={status !== "ERROR"} />
        <span className="mono">{short(wallet.address ?? "", 6, 4)}</span>
        <Badge tone={tone}>{status}</Badge>
        <ChevronDown size={12} className="faint" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] rounded-xl z-[60] shadow-xl flex flex-col max-h-[85vh] overflow-hidden border"
             style={{ background: "color-mix(in oklab, var(--bg-2) 94%, rgb(var(--surface-rgb) / 0.5))", backdropFilter: "blur(24px) saturate(150%)" }}>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium truncate">{wallet.walletName ?? diagnostic?.walletName ?? "Wallet"}</span>
              <Badge tone={wallet.capabilities.privacyApi ? "good" : isDemo ? "warn" : status === "WRONG_NETWORK" ? "bad" : "neutral"}>
                {isDemo ? "DEMO MODE" : status === "WRONG_NETWORK" ? "WRONG NETWORK" : wallet.capabilities.privacyApi ? "PRIVACY CAPABLE" : status}
              </Badge>
            </div>

            <div className="rounded-lg p-2.5 space-y-2" style={{ background: "var(--track)" }}>
              <div>
                <div className="text-[10.5px] faint uppercase tracking-wider">Wallet name</div>
                <div className="text-[12px] font-medium">{wallet.walletName ?? diagnostic?.walletName ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10.5px] faint uppercase tracking-wider">Wallet address</div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="mono text-[11px] truncate">{short(wallet.address ?? "", 14, 8)}</span>
                  <button className="faint hover:text-[var(--text)]" onClick={() => void navigator.clipboard?.writeText(wallet.address ?? "")}>
                    <Copy size={11} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="faint text-[10px] uppercase">Network</div>
                  <div className="mono truncate">{diagnostic?.network ?? chainLabel(wallet.chainId)}</div>
                </div>
                <div>
                  <div className="faint text-[10px] uppercase">Chain ID</div>
                  <div className="mono truncate">{short(diagnostic?.chainId ?? wallet.chainId ?? "—", 12, 6)}</div>
                </div>
                {diagnostic?.blockNumber !== undefined && (
                  <div>
                    <div className="faint text-[10px] uppercase">Block</div>
                    <div className="mono truncate">#{diagnostic.blockNumber.toLocaleString()}</div>
                  </div>
                )}
                <div>
                  <div className="faint text-[10px] uppercase">Adapter</div>
                  <div className="mono truncate">{diagnostic?.adapterKind ?? (isDemo ? "mock" : "ready")}</div>
                </div>
                <div className="col-span-2">
                  <div className="faint text-[10px] uppercase">Status</div>
                  <div className="mono truncate">{diagnostic?.connectionStatus ?? wallet.status}</div>
                </div>
              </div>

              {status === "WRONG_NETWORK" && (
                <div className="text-[11px] px-2 py-1.5 rounded" style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)", color: "var(--warn)" }}>
                  <div className="font-medium">WRONG NETWORK</div>
                  <div>Expected: Starknet Sepolia</div>
                  <div>Detected: {diagnostic?.network ?? diagnostic?.chainId ?? "unknown"}</div>
                  <div className="mt-1">Switch network in wallet to Sepolia, then reconnect.</div>
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-[11.5px]">
              <Row k="Wallet API" v={wallet.capabilities.specVersion ?? "—"} />
              <Row k="Signer" v="wallet-custodied" />
              <Row k="Mode" v={isDemo ? "DEMO MODE (mock)" : `REAL (${diagnostic?.adapterKind ?? "ready"})`} />
            </div>

            <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="text-[10.5px] faint uppercase tracking-wider mb-2">Diagnostics</div>
              <div className="mono text-[10.5px] space-y-1">
                <div>Wallet: {diagnostic?.walletName ?? "—"}</div>
                <div>Network: {diagnostic?.network ?? "—"}</div>
                <div>Chain ID: {diagnostic?.chainId ?? wallet.chainId ?? "—"}</div>
                <div>Block: {diagnostic?.blockNumber !== undefined ? `#${diagnostic.blockNumber}` : "—"}</div>
                <div>Status: {diagnostic?.connectionStatus ?? "—"}</div>
                <div>Adapter: {diagnostic?.adapterKind ?? "—"}</div>
                <div>Mock: {String(isDemo)}</div>
                <div>RPC: {diagnostic?.blockNumber !== undefined || wallet.chainId ? "provider available" : "provider unavailable"}</div>
              </div>
            </div>
          </div>

          {/* Sticky disconnect — always visible, never clipped */}
          <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg-2) 96%, transparent)" }}>
            <Button
              variant="outline"
              size="sm"
              className="w-full pointer-events-auto"
              onClick={() => {
                setOpen(false);
                void onDisconnect();
              }}
            >
              <LogOut size={12} /> {isDemo ? "Disconnect demo wallet" : "Disconnect wallet"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="faint">{k}</span>
      <span className="mono truncate">{v}</span>
    </div>
  );
}
