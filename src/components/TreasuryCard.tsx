import { Eye, EyeOff, TrendingDown, TrendingUp } from "lucide-react";
import { num, pct, usd } from "../lib/format";
import { ASSETS, usdValue } from "../lib/mock/treasury";
import type { TreasuryPosition } from "../lib/types";
import { Badge } from "./ui/primitives";

export default function TreasuryCard({
  position,
  masked = false,
}: {
  position: TreasuryPosition;
  masked?: boolean;
}) {
  const meta = ASSETS[position.asset];
  const shieldedUsd = usdValue(position.asset, position.shieldedBalance);
  const publicUsd = usdValue(position.asset, position.publicBalance);
  const total = shieldedUsd + publicUsd;
  const shieldedPct = total > 0 ? (shieldedUsd / total) * 100 : 0;
  const up = position.change24hPct >= 0;
  const mask = (s: string) => (masked ? "••••••" : s);

  return (
    <div className="surface rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold tracking-tight">
              {position.asset}
            </span>
            <span className="text-[11.5px] faint">{meta.name}</span>
          </div>
          <div className="mono text-[22px] font-semibold mt-2 tracking-tight">
            {mask(usd(total, { compact: total > 100_000 }))}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 mono text-[11px]"
          style={{ color: up ? "var(--good)" : "var(--bad)" }}
        >
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {pct(position.change24hPct)}
        </span>
      </div>

      <div className="mt-4">
        <div className="h-[5px] rounded-full overflow-hidden flex" style={{ background: "var(--track)" }}>
          <div
            className="h-full"
            style={{
              width: `${shieldedPct}%`,
              background: "linear-gradient(90deg, var(--accent), var(--accent-3))",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2.5 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5 dim">
            <EyeOff size={11} style={{ color: "var(--accent-3)" }} />
            Shielded
            <span className="mono">{mask(num(position.shieldedBalance, position.asset === "strkBTC" ? 4 : 2))}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 faint">
            <Eye size={11} />
            Public
            <span className="mono">{mask(num(position.publicBalance, position.asset === "strkBTC" ? 4 : 2))}</span>
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-between mt-4 pt-3.5 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <Badge tone="cyan">{position.noteCount} notes</Badge>
        <span className="text-[11.5px] faint">
          allocated{" "}
          <span className="mono" style={{ color: "var(--text-dim)" }}>
            {mask(usd(usdValue(position.asset, position.allocatedToAgents), { compact: true }))}
          </span>
        </span>
      </div>
    </div>
  );
}
