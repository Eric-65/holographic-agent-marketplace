import { Activity, CircleSlash, Pause, ShieldAlert, Unplug } from "lucide-react";
import type { AgentRuntimeState } from "../lib/types";
import { Dot } from "./ui/primitives";

const MAP: Record<
  AgentRuntimeState,
  { label: string; tone: "good" | "warn" | "bad" | "neutral"; icon: typeof Activity }
> = {
  active: { label: "Active", tone: "good", icon: Activity },
  idle: { label: "Idle", tone: "neutral", icon: CircleSlash },
  paused: { label: "Paused", tone: "warn", icon: Pause },
  quarantined: { label: "Quarantined", tone: "bad", icon: ShieldAlert },
  unbound: { label: "Unbound", tone: "neutral", icon: Unplug },
};

const TONE: Record<string, string> = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  neutral: "var(--text-faint)",
};

export default function AgentStatus({
  state,
  variant = "chip",
  detail,
}: {
  state: AgentRuntimeState;
  variant?: "chip" | "inline" | "block";
  detail?: string;
}) {
  const m = MAP[state];
  const color = TONE[m.tone];

  if (variant === "inline") {
    return (
      <span className="inline-flex items-center gap-1.5 mono text-[11px]" style={{ color }}>
        <Dot tone={m.tone} pulse={state === "active"} />
        {m.label}
      </span>
    );
  }

  if (variant === "block") {
    const Icon = m.icon;
    return (
      <div
        className="rounded-lg px-3.5 py-3 flex items-center gap-3"
        style={{
          background: `color-mix(in oklab, ${color} 9%, transparent)`,
          border: `1px solid color-mix(in oklab, ${color} 26%, transparent)`,
        }}
      >
        <Icon size={15} style={{ color }} />
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium" style={{ color }}>
            Runtime · {m.label}
          </div>
          {detail && <div className="text-[11.5px] faint truncate">{detail}</div>}
        </div>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 mono text-[10.5px] px-2 py-[3px] rounded-md"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      <Dot tone={m.tone} pulse={state === "active"} />
      {m.label.toUpperCase()}
    </span>
  );
}
