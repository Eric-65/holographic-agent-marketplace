import type { Hex } from "../lib/types";
import { short } from "../lib/hash";
import { Panel, PanelHeader, Badge } from "./ui/primitives";

type Diagnostic = {
  walletName: string | null;
  network: string | null;
  chainId: string | null;
  blockNumber?: number;
  blockHash?: string;
  connectionStatus: string;
  isMock: boolean;
  adapterKind?: string;
  error?: string;
};

type Props = {
  wallet: { address: Hex | null; chainId: string | null };
  diagnostic: Diagnostic;
  adapter?: { getProvider?: () => unknown };
};

export default function DiagnosticPanel({ wallet, diagnostic, adapter }: Props) {
  const rpcAvailable = (() => {
    try {
      const provider = adapter?.getProvider?.() as { getChainId?: unknown } | null;
      return !!provider;
    } catch {
      return false;
    }
  })();

  // Always show in dev, show when connected or error in prod per task
  const shouldShow = true; // per debug UI requirement, always show for verification

  if (!shouldShow) return null;

  return (
    <Panel padded={false} edge>
      <PanelHeader
        title="Debug — Wallet / Network"
        sub="Read-only verification, no transactions, no secrets"
        right={
          <Badge tone={diagnostic.connectionStatus === "ERROR" ? "bad" : diagnostic.isMock ? "warn" : "good"}>
            {diagnostic.connectionStatus}
          </Badge>
        }
      />
      <div className="p-5 grid sm:grid-cols-2 gap-x-8 gap-y-3 mono text-[11.5px]">
        <Field k="Connection" v={diagnostic.connectionStatus} tone={diagnostic.connectionStatus === "ERROR" ? "bad" : diagnostic.connectionStatus === "CONNECTED" || diagnostic.connectionStatus === "NETWORK_VERIFIED" || diagnostic.connectionStatus === "PRIVACY_CAPABLE" ? "good" : undefined} />
        <Field k="Adapter" v={diagnostic.adapterKind ?? (diagnostic.isMock ? "mock" : "ready")} />
        <Field k="Wallet" v={wallet.address ? short(wallet.address, 12, 8) : "—"} />
        <Field k="Chain" v={diagnostic.chainId ? short(diagnostic.chainId, 12, 6) : short(wallet.chainId ?? "—", 12, 6)} />
        <Field k="Network" v={diagnostic.network ?? "—"} />
        <Field k="RPC" v={rpcAvailable ? "provider available" : "provider unavailable"} tone={rpcAvailable ? "good" : "warn"} />
        <Field k="Block" v={diagnostic.blockNumber !== undefined ? `#${diagnostic.blockNumber.toLocaleString()}` : "—"} />
        <Field k="Mode" v={diagnostic.isMock ? "DEMO MODE (mock)" : "REAL WALLET"} />
        {diagnostic.error && <Field k="Error" v={diagnostic.error.slice(0, 80)} tone="bad" />}
      </div>
      <div className="px-5 pb-4 text-[11px] faint">
        Verified: chain ID via wallet_requestChainId / account.getChainId() first, provider.getChainId() fallback. Block via getBlockNumber(). No transaction sent. Adapter: {diagnostic.adapterKind ?? "mock"}.
      </div>
    </Panel>
  );
}

function Field({ k, v, tone }: { k: string; v: string; tone?: "bad" | "good" | "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="faint shrink-0">{k}</span>
      <span className="truncate text-right" style={tone === "bad" ? { color: "var(--bad)" } : tone === "good" ? { color: "var(--good)" } : tone === "warn" ? { color: "var(--warn)" } : undefined}>
        {v}
      </span>
    </div>
  );
}
