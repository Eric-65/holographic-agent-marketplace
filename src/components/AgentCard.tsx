import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Link } from "../app/router";
import { ACTION_LABEL, num } from "../lib/format";
import type { Agent } from "../lib/types";
import AgentStatus from "./AgentStatus";
import { Badge } from "./ui/primitives";
import { useStore } from "../lib/store";
import { isContractDeployed } from "../lib/contracts/config";

export default function AgentCard({
  agent,
  href,
  compact = false,
}: {
  agent: Agent;
  href?: string;
  compact?: boolean;
}) {
  const { deployments, dbPolicies, dbReceipts } = useStore();
  const deployment = deployments.find((d) => d.agentId === agent.id);
  const hasPolicy = deployment ? dbPolicies.some((p) => p.id === deployment.policyId) : false;
  const hasReceipt = dbReceipts.some((r) => r.agentId === agent.id);
  const isLive = agent.priceLabel === "LIVE" || agent.id === "holographic-treasury" || agent.id === "helix-payroll";
  const isBeta = agent.priceLabel === "BETA";
  const isPrepared = agent.priceLabel === "PREPARED";

  // Verification badges per TASK 16 — only show when backed by actual implementation
  const badges: { label: string; tone: "good" | "neutral" | "warn" | "cyan"; show: boolean }[] = [
    { label: "REGISTERED", tone: "good", show: !!deployment },
    { label: "POLICY-CONTROLLED", tone: "good", show: hasPolicy || isLive },
    { label: "STRK20 READY", tone: "cyan", show: isLive && !isPrepared },
    { label: "ATTESTED", tone: "good", show: hasReceipt },
    { label: "VERIFIED", tone: "good", show: hasReceipt && isLive && !isPrepared },
  ];

  return (
    <Link
      href={href ?? `/agents/${agent.id}`}
      className="group surface rounded-xl p-5 flex flex-col hover:surface-2 transition-all duration-200 hover:-translate-y-[1px] block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="h-9 w-9 rounded-lg grid place-items-center shrink-0 mono text-[13px] font-semibold"
            style={{
              background: `color-mix(in oklab, ${agent.accent} 14%, transparent)`,
              border: `1px solid color-mix(in oklab, ${agent.accent} 34%, transparent)`,
              color: agent.accent,
            }}
          >
            {agent.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-[14.5px] font-semibold tracking-tight truncate">{agent.name}</span>
              <span className="mono text-[10px] faint">v{agent.version}</span>
            </div>
            <div className="text-[11.5px] faint truncate">
              {agent.publisher} · {agent.category}
            </div>
          </div>
        </div>
        <AgentStatus state={agent.runtime} />
      </div>

      <p className="text-[12.5px] dim leading-relaxed mt-4 flex-1">{agent.summary}</p>

      {!compact && (
        <>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {agent.actionSurface.slice(0, 3).map((a) => (
              <span key={a} className="mono text-[10px] px-1.5 py-[3px] rounded chip faint">
                {ACTION_LABEL[a]}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 mt-3">
            {badges
              .filter((b) => b.show)
              .map((b) => (
                <Badge key={b.label} tone={b.tone}>
                  {b.label}
                </Badge>
              ))}
            {isPrepared && <Badge tone="neutral">PREPARED</Badge>}
            {isBeta && !badges.some((b) => b.show) && <Badge tone="neutral">BETA</Badge>}
          </div>
        </>
      )}

      <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <Metric label="Trust" value={String(agent.metrics.trustScore)} tone={isLive ? "good" : isBeta ? "cyan" : "neutral"} />
        <Metric label="Executions" value={num(agent.metrics.executions / 1000, 1) + "k"} />
        <Metric label="Reject rate" value={agent.metrics.rejectRate.toFixed(1) + "%"} />
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="mono text-[11.5px]" style={{ color: agent.accent }}>
            {agent.priceLabel}
          </span>
          {agent.auditedBy && (
            <Badge tone="neutral">
              <ShieldCheck size={9} /> audited
            </Badge>
          )}
        </div>
        <ArrowUpRight size={14} className="faint group-hover:text-[var(--text)] group-hover:translate-x-[1px] transition-all" />
      </div>

      <div className="mt-3 text-[10px] faint mono">
        {deployment ? `Application: ${deployment.status} · Onchain: ${isContractDeployed("agent_registry") ? "REGISTERED" : "NOT ANCHORED"}` : "Application: OFFCHAIN AGENT · Onchain: NOT ANCHORED"}
      </div>
    </Link>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const color =
    tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "cyan" ? "var(--accent-3)" : undefined;
  return (
    <div>
      <div className="text-[10px] faint uppercase tracking-wider">{label}</div>
      <div className="mono text-[13px] font-medium mt-0.5" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
