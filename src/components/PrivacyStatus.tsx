import { KeyRound, Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { getPrivacyProvider, PRIVACY_BACKEND } from "../lib/privacy";
import type { WalletState } from "../lib/types";
import { Badge, Dot } from "./ui/primitives";

type Diagnostic = {
  connectionStatus: string;
  isMock: boolean;
  network?: string | null;
  chainId?: string | null;
};

/**
 * Surfaces the state of the privacy integration boundary.
 * Updated for real wallet states: DISCONNECTED, CONNECTING, CONNECTED,
 * NETWORK_VERIFIED, PRIVACY_CAPABLE, ERROR, DEMO_MODE
 */
export default function PrivacyStatus({
  wallet,
  diagnostic,
  variant = "chip",
}: {
  wallet: WalletState;
  diagnostic?: Diagnostic;
  variant?: "chip" | "panel";
}) {
  const provider = getPrivacyProvider();
  const live = PRIVACY_BACKEND === "strk20" && provider.isLive;
  const ready = wallet.status === "connected" && wallet.capabilities.privacyApi;
  const status = diagnostic?.connectionStatus ?? (wallet.status === "connected" ? "CONNECTED" : wallet.status === "connecting" ? "CONNECTING" : "DISCONNECTED");
  const isDemo = diagnostic?.isMock ?? wallet.walletName?.toLowerCase().includes("mock") ?? true;

  const toneForStatus = (s: string) => {
    switch (s) {
      case "PRIVACY_CAPABLE":
        return "good" as const;
      case "NETWORK_VERIFIED":
        return "good" as const;
      case "CONNECTED":
        return "good" as const;
      case "DEMO_MODE":
        return "warn" as const;
      case "CONNECTING":
        return "neutral" as const;
      case "ERROR":
        return "bad" as const;
      default:
        return "neutral" as const;
    }
  };

  if (variant === "chip") {
    return (
      <span
        className="inline-flex items-center gap-1.5 mono text-[10.5px] px-2 py-[5px] rounded-md chip"
        title={
          isDemo
            ? "DEMO MODE — mock privacy layer"
            : live
              ? "STRK20 Privacy Wallet API — live"
              : "Real wallet connected, privacy not yet verified"
        }
      >
        <Dot tone={toneForStatus(status)} pulse={status === "CONNECTING" || status === "CONNECTED" || status === "NETWORK_VERIFIED" || status === "PRIVACY_CAPABLE"} />
        {isDemo ? "MOCK" : live ? "STRK20" : "REAL"}
        <span className="faint">
          {status === "ERROR"
            ? "error"
            : isDemo
              ? diagnostic?.connectionStatus?.toLowerCase() ?? "offline"
              : status.toLowerCase()}
        </span>
      </span>
    );
  }

  const caps: [string, boolean][] = [
    ["wallet_shield", wallet.capabilities.shield],
    ["wallet_privateTransfer", wallet.capabilities.privateTransfer],
    ["wallet_privateSwap", wallet.capabilities.privateSwap],
    ["wallet_privateMulticall", wallet.capabilities.multicall],
  ];

  return (
    <div className="surface rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {ready ? (
            <ShieldCheck size={16} style={{ color: live ? "var(--good)" : "var(--warn)" }} />
          ) : (
            <ShieldOff size={16} className="faint" />
          )}
          <div>
            <div className="font-display text-[14px] font-semibold tracking-tight">Privacy layer</div>
            <div className="text-[11.5px] faint">{provider.label}</div>
            {diagnostic && (
              <div className="text-[10.5px] mono faint mt-0.5">
                {diagnostic.connectionStatus} {diagnostic.isMock ? "· DEMO MODE" : "· REAL"} {diagnostic.network ? `· ${diagnostic.network}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={live ? "good" : isDemo ? "warn" : "neutral"}>{live ? "live" : isDemo ? "DEMO MODE" : "CONNECTED"}</Badge>
          <Badge tone={toneForStatus(status)}>{status}</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {caps.map(([k, ok]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="mono text-[11px] dim">{k}</span>
            <span className="mono text-[10.5px]" style={{ color: ok ? "var(--good)" : "var(--text-faint)" }}>
              {ok ? "available" : "unavailable"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t space-y-1.5" style={{ borderColor: "var(--border)" }}>
        <Boundary icon={KeyRound} label="Viewing keys" value="wallet-custodied" tone="bad" />
        <Boundary icon={Lock} label="Note selection" value="wallet-side" tone="bad" />
        <Boundary icon={ShieldCheck} label="Proof generation" value="wallet-side" tone="bad" />
      </div>
      <p className="text-[11.5px] faint mt-3 leading-relaxed">
        Holographic never holds a viewing key, never sees a note and never signs. Those operations stay inside the user's privacy-enabled wallet.
      </p>
      {status === "ERROR" && diagnostic && (
        <div className="mt-3 text-[11px] px-2 py-1.5 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
          Connection error — check wallet extension is installed and unlocked.
        </div>
      )}
    </div>
  );
}

function Boundary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof KeyRound;
  label: string;
  value: string;
  tone: "bad" | "good";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-[11.5px] dim">
        <Icon size={11} className="faint" />
        {label}
      </span>
      <span className="mono text-[10.5px]" style={{ color: tone === "bad" ? "var(--bad)" : "var(--good)" }}>
        {value}
      </span>
    </div>
  );
}
