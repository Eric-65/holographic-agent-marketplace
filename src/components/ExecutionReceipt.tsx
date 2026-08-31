import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { short } from "../lib/hash";
import { ACTION_LABEL, datetime, timeAgo } from "../lib/format";
import type { ExecutionReceiptData, ReceiptStatus } from "../lib/types";
import { Badge, KeyValue } from "./ui/primitives";

const STATUS: Record<ReceiptStatus, { label: string; tone: "good" | "bad" | "warn" | "neutral"; icon: typeof CheckCircle2 }> = {
  executed: { label: "Executed", tone: "good", icon: CheckCircle2 },
  blocked: { label: "Blocked by policy", tone: "bad", icon: Ban },
  awaiting_confirmation: { label: "Awaiting confirmation", tone: "warn", icon: Clock },
  reverted: { label: "Reverted", tone: "bad", icon: RotateCcw },
  pending: { label: "Pending", tone: "neutral", icon: Clock },
};

const TONE: Record<string, string> = {
  good: "var(--good)",
  bad: "var(--bad)",
  warn: "var(--warn)",
  neutral: "var(--text-faint)",
};

export default function ExecutionReceipt({
  receipt,
  variant = "row",
  defaultOpen = false,
}: {
  receipt: ExecutionReceiptData;
  variant?: "row" | "card";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const s = STATUS[receipt.status];
  const Icon = s.icon;
  const color = TONE[s.tone];

  const detail = (
    <div className="grid sm:grid-cols-2 gap-x-8">
      <div>
        <KeyValue k="Receipt" v={receipt.id} />
        <KeyValue k="Intent hash" v={short(receipt.intentHash, 12, 6)} />
        <KeyValue k="Policy hash" v={short(receipt.policyHash, 12, 6)} />
        <KeyValue k="Trace hash" v={short(receipt.traceHash, 12, 6)} />
      </div>
      <div>
        <KeyValue
          k="Transaction"
          v={
            receipt.txHash ? (
              <span className="inline-flex items-center gap-1.5">
                {short(receipt.txHash, 12, 6)}
                <ExternalLink size={10} className="faint" />
              </span>
            ) : (
              "not submitted"
            )
          }
        />
        <KeyValue k="Block" v={receipt.block ? `#${receipt.block.toLocaleString()}` : "—"} />
        <KeyValue
          k="Proof"
          v={
            <span style={{ color: receipt.proofVerified ? "var(--good)" : "var(--text-faint)" }}>
              {receipt.proofVerified ? "verified on-chain" : "n/a"}
            </span>
          }
        />
        <KeyValue k="Attestation" v={short(receipt.attestationSig, 12, 6)} />
      </div>
      <div className="sm:col-span-2 mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="cyan">notional {receipt.bucket}</Badge>
        <Badge tone="neutral">amounts not stored</Badge>
        {receipt.latencyMs && <Badge tone="neutral">{(receipt.latencyMs / 1000).toFixed(1)}s intent→receipt</Badge>}
        {receipt.failedRule && <Badge tone="bad">failed {receipt.failedRule}</Badge>}
      </div>
    </div>
  );

  if (variant === "card") {
    return (
      <div className="surface rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Icon size={15} style={{ color }} />
            <div>
              <div className="text-[13px] font-medium">
                {ACTION_LABEL[receipt.kind]} · {receipt.asset}
              </div>
              <div className="text-[11.5px] faint">
                {receipt.agentName} via {receipt.venue} · {datetime(receipt.createdAt)}
              </div>
            </div>
          </div>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        {detail}
      </div>
    );
  }

  return (
    <div className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-3 grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] items-center gap-4 hover:bg-[var(--track)] transition-colors"
      >
        <span
          className="h-7 w-7 rounded-md grid place-items-center shrink-0"
          style={{ background: `color-mix(in oklab, ${color} 12%, transparent)` }}
        >
          <Icon size={13} style={{ color }} />
        </span>

        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium truncate">
            {ACTION_LABEL[receipt.kind]} · {receipt.asset}
            <span className="faint font-normal"> · {receipt.venue}</span>
          </span>
          <span className="block mono text-[10.5px] faint truncate">
            {receipt.id} · trace {short(receipt.traceHash, 8, 4)}
          </span>
        </span>

        <span className="hidden sm:block text-[12px] dim truncate">{receipt.agentName}</span>

        <span className="text-right">
          <span className="block mono text-[12px]">{receipt.bucket}</span>
          <span className="block mono text-[10.5px] faint">{timeAgo(receipt.createdAt)}</span>
        </span>

        <span className="flex items-center gap-2 justify-end">
          {receipt.proofVerified && <ShieldCheck size={12} style={{ color: "var(--good)" }} />}
          <ChevronRight
            size={13}
            className="faint transition-transform"
            style={{ transform: open ? "rotate(90deg)" : undefined }}
          />
        </span>
      </button>

      {open && <div className="px-5 pb-5 pt-1">{detail}</div>}
    </div>
  );
}
