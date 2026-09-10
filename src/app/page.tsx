import { ArrowRight, Bot, EyeOff, ShieldCheck, Vault } from "lucide-react";
import { Link } from "./router";
import { useStore } from "../lib/store";
import { totals } from "../lib/mock/treasury";
import { usd } from "../lib/format";
import AgentCard from "../components/AgentCard";
import ActivitySummary from "../components/ActivitySummary";
import ExecutionReceipt from "../components/ExecutionReceipt";
import PrivacyStatus from "../components/PrivacyStatus";
import DiagnosticPanel from "../components/DiagnosticPanel";
import NotificationPanel from "../components/NotificationPanel";
import { Button, Panel, PanelHeader, SectionTitle, Stat } from "../components/ui/primitives";
import MotionReveal, { MotionRevealGroup } from "../components/motion/MotionReveal";
import MotionCountUp from "../components/motion/MotionCountUp";
import MotionParallax from "../components/motion/MotionParallax";

export default function OverviewPage() {
  const { agents, positions, receipts, policies, wallet, diagnostic, adapter } = useStore();
  const t = totals(positions);
  const activeAgents = agents.filter((a) => a.runtime === "active");
  const activePolicies = policies.filter((p) => p.status === "active");
  const recent = receipts.slice(0, 6);

  return (
    <div className="space-y-7">
      <div className="relative">
        <MotionParallax className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 opacity-40" range={10}>
          <div
            aria-hidden
            className="h-full w-full rounded-full"
            style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent-3) 45%, transparent), transparent 70%)", filter: "blur(6px)" }}
          />
        </MotionParallax>
        <SectionTitle
          eyebrow="Control plane"
          title="Overview"
          sub="Policy-controlled private execution across your bound agents. Agents propose, the deterministic engine decides, your wallet executes through STRK20."
          right={
            <Link href="/agents">
              <Button variant="primary" size="sm">
                Browse agents <ArrowRight size={13} />
              </Button>
            </Link>
          }
        />
      </div>

      <MotionRevealGroup className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MotionReveal>
          <Stat label="Shielded value" value={<MotionCountUp value={t.shielded} format={(n) => usd(n, { compact: true })} />} sub={`${t.notes} notes · wallet-reported`} tone="cyan" />
        </MotionReveal>
        <MotionReveal>
          <Stat label="Public value" value={<MotionCountUp value={t.public} format={(n) => usd(n, { compact: true })} />} sub="unshielded balances" />
        </MotionReveal>
        <MotionReveal>
          <Stat
            label="Agents bound"
            value={
              <>
                <MotionCountUp value={activeAgents.length} />/{agents.length}
              </>
            }
            sub={`${activePolicies.length} active policies`}
            tone="good"
          />
        </MotionReveal>
        <MotionReveal>
          <Stat label="Delegated authority" value="none" sub="no key delegation, ever" tone="good" />
        </MotionReveal>
      </MotionRevealGroup>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <MotionReveal className="space-y-3" mode="inView">
          <ActivitySummary receipts={receipts} />
          <DiagnosticPanel wallet={wallet} diagnostic={diagnostic} adapter={adapter} />
          <NotificationPanel />
        </MotionReveal>

        <MotionReveal className="space-y-3" mode="inView" delay={1}>
          <PrivacyStatus wallet={wallet} diagnostic={diagnostic} variant="panel" />

          <Panel>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} style={{ color: "var(--accent-3)" }} />
              <span className="font-display text-[14px] font-semibold tracking-tight">
                Execution invariants
              </span>
            </div>
            <ul className="space-y-2.5">
              {[
                "An LLM can propose, never sign.",
                "Only an APPROVE verdict produces an envelope.",
                "Envelopes are single-use and expire in 30s.",
                "No exact private amount is ever persisted.",
                "Every execution has a replayable rule trace.",
              ].map((s) => (
                <li key={s} className="flex gap-2.5 text-[12px] dim leading-relaxed">
                  <span
                    className="mt-[6px] h-1 w-1 rounded-full shrink-0"
                    style={{ background: "var(--accent-3)" }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </Panel>
        </MotionReveal>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[16px] font-semibold tracking-tight flex items-center gap-2">
            <Bot size={15} className="faint" /> Bound agents
          </h2>
          <Link href="/agents" className="text-[12px] dim hover:text-[var(--text)]">
            View all →
          </Link>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {agents.slice(0, 3).map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </div>

      <MotionReveal mode="inView" className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3">
        <Panel padded={false}>
          <PanelHeader
            title="Recent receipts"
            sub="Non-sensitive execution artifacts"
            right={
              <Link href="/activity" className="text-[12px] dim hover:text-[var(--text)]">
                All activity →
              </Link>
            }
          />
          <div>
            {recent.map((r) => (
              <ExecutionReceipt key={r.id} receipt={r} />
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-2 mb-4">
            <Vault size={14} style={{ color: "var(--accent)" }} />
            <span className="font-display text-[14px] font-semibold tracking-tight">
              Treasury split
            </span>
          </div>
          <div className="space-y-3">
            {positions.map((p) => {
              const share = (p.shieldedBalance * 100) / (p.shieldedBalance + p.publicBalance);
              return (
                <div key={p.asset}>
                  <div className="flex items-center justify-between text-[12px] mb-1.5">
                    <span>{p.asset}</span>
                    <span className="mono faint">
                      <MotionCountUp value={share} format={(n) => n.toFixed(0)} suffix="% shielded" />
                    </span>
                  </div>
                  <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${share}%`,
                        background: "linear-gradient(90deg, var(--accent), var(--accent-3))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="mt-5 pt-4 border-t flex items-center gap-2 text-[11.5px] faint"
            style={{ borderColor: "var(--border)" }}
          >
            <EyeOff size={12} />
            Shielded figures are read from the wallet and never leave this device.
          </div>
        </Panel>
      </MotionReveal>
    </div>
  );
}
