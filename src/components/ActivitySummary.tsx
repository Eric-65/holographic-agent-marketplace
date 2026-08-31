import { useMemo } from "react";
import { Activity, Ban, EyeOff, Timer } from "lucide-react";
import { dailySeries } from "../lib/mock/receipts";
import type { ExecutionReceiptData } from "../lib/types";
import { Panel, PanelHeader, Stat } from "./ui/primitives";

/**
 * Aggregate view over receipts. Everything here is derived from non-sensitive
 * receipt metadata — counts, buckets, latencies. No amounts.
 */
export default function ActivitySummary({
  receipts,
  days = 14,
  showChart = true,
}: {
  receipts: ExecutionReceiptData[];
  days?: number;
  showChart?: boolean;
}) {
  const s = useMemo(() => {
    const executed = receipts.filter((r) => r.status === "executed");
    const blocked = receipts.filter((r) => r.status === "blocked");
    const lat = executed.map((r) => r.latencyMs ?? 0).filter(Boolean).sort((a, b) => a - b);
    return {
      total: receipts.length,
      executed: executed.length,
      blocked: blocked.length,
      approval: receipts.length ? Math.round((executed.length / receipts.length) * 100) : 0,
      p50: lat.length ? lat[Math.floor(lat.length / 2)] : 0,
      verified: executed.filter((r) => r.proofVerified).length,
    };
  }, [receipts]);

  const series = useMemo(() => dailySeries(receipts, days), [receipts, days]);
  const max = Math.max(1, ...series.map((d) => d.executed + d.blocked));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Cycles evaluated" value={s.total} sub={`${days}d window`} />
        <Stat label="Executed" value={s.executed} sub={`${s.approval}% approval`} tone="good" />
        <Stat label="Blocked by policy" value={s.blocked} sub="deterministic reject" tone="bad" />
        <Stat label="p50 intent → receipt" value={`${(s.p50 / 1000).toFixed(1)}s`} sub="sealed" tone="cyan" />
      </div>

      {showChart && (
        <Panel padded={false}>
          <PanelHeader
            title="Execution volume"
            sub="Counts only — notional is never aggregated server-side"
            right={
              <div className="flex items-center gap-3 text-[11px]">
                <Legend color="var(--accent-3)" label="executed" />
                <Legend color="var(--bad)" label="blocked" />
              </div>
            }
          />
          <div className="p-5">
            <div className="flex items-end gap-[6px] h-[132px]">
              {series.map((d) => {
                const eh = (d.executed / max) * 100;
                const bh = (d.blocked / max) * 100;
                return (
                  <div key={d.day} className="flex-1 flex flex-col justify-end gap-[2px] group relative">
                    {bh > 0 && (
                      <div
                        className="rounded-t-[2px]"
                        style={{ height: `${bh}%`, background: "color-mix(in oklab, var(--bad) 65%, transparent)" }}
                      />
                    )}
                    <div
                      className="rounded-t-[2px] transition-opacity group-hover:opacity-80"
                      style={{
                        height: `${Math.max(eh, 2)}%`,
                        background: "linear-gradient(180deg, var(--accent-3), color-mix(in oklab, var(--accent) 70%, transparent))",
                      }}
                    />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none mono text-[10px] px-1.5 py-1 rounded surface-2 whitespace-nowrap">
                      {d.executed}✓ {d.blocked}✕
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-3 mono text-[10px] faint">
              <span>{series[0]?.day}</span>
              <span>{series[series.length - 1]?.day}</span>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Mini icon={Activity} label="Proofs verified" value={`${s.verified}/${s.executed}`} />
        <Mini icon={Ban} label="Reject reasons" value={`${new Set(receipts.filter((r) => r.failedRule).map((r) => r.failedRule)).size} distinct rules`} />
        <Mini icon={EyeOff} label="Amounts at rest" value="0 stored" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 faint">
      <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function Mini({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <div className="surface rounded-xl px-4 py-3.5 flex items-center gap-3">
      <Icon size={14} className="faint shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] faint truncate">{label}</div>
        <div className="mono text-[12.5px] mt-0.5 truncate">{value}</div>
      </div>
    </div>
  );
}
