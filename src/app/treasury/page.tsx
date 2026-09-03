import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Eye, EyeOff, Info, Pause, Play } from "lucide-react";
import { useStore } from "../../lib/store";
import { ASSETS, totals, usdValue } from "../../lib/mock/treasury";
import { num, usd, datetime } from "../../lib/format";
import { short } from "../../lib/hash";
import { usedInCurrentPeriod } from "../../lib/api/budgets";
import { isOccurrenceDue } from "../../lib/treasury/schedule";
import TreasuryCard from "../../components/TreasuryCard";
import TreasuryTransferForm from "../../components/TreasuryTransferForm";
import RecipientManager from "../../components/RecipientManager";
import DiagnosticPanel from "../../components/DiagnosticPanel";
import TreasuryTabs from "../../components/treasury/TreasuryTabs";
import NewRecipientReviewPanel from "../../components/treasury/NewRecipientReviewPanel";
import { formatMinor } from "../../components/treasury/ExecutionRequestCard";
import { Link } from "../router";
import { Badge, Button, Panel, PanelHeader, SectionTitle, Stat } from "../../components/ui/primitives";

export default function TreasuryPage() {
  const {
    positions,
    wallet,
    diagnostic,
    deployments,
    dbPolicies,
    pendingApprovals,
    dbReceipts,
    adapter,
    schedules,
    budgets,
    workflowRuns,
    automationControl,
    pauseAllTreasuryAutomation,
    resumeTreasuryAutomation,
  } = useStore();
  const [masked, setMasked] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const t = totals(positions);
  const activeDeployments = deployments.filter((d) => d.status === "active" || d.status === "ACTIVE");

  const activeSchedules = schedules.filter((s) => s.status === "ACTIVE");
  const dueWithin7d = activeSchedules.filter((s) => isOccurrenceDue(s, Date.now() + 7 * 24 * 60 * 60 * 1000));
  const activeWorkflowRuns = workflowRuns.filter((r) => r.status === "RUNNING" || r.status === "AWAITING_APPROVAL");
  const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalBudgetUsed = budgets.reduce((sum, b) => sum + usedInCurrentPeriod(b.id), 0);

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Balances"
        title="Treasury"
        sub="Shielded balances are decrypted by your wallet from its own note set. Holographic renders them and discards them — they are never sent to a server, logged or cached. Persisted state reflects deployments, policies, and receipts."
        right={
          <Button variant="outline" size="sm" onClick={() => setMasked((m) => !m)}>
            {masked ? <Eye size={13} /> : <EyeOff size={13} />}
            {masked ? "Reveal" : "Mask values"}
          </Button>
        }
      />

      <TreasuryTabs />

      {automationControl && (
        <Panel edge>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={automationControl.paused ? "bad" : "good"}>{automationControl.paused ? "AUTOMATION PAUSED" : "AUTOMATION ACTIVE"}</Badge>
            <span className="text-[11.5px] faint flex-1 min-w-[160px]">
              {automationControl.paused
                ? automationControl.pausedReason
                  ? `Reason: ${automationControl.pausedReason}`
                  : "All scheduled executions and workflow runs are halted"
                : "Scheduled payments and workflows run under current policy + budget limits"}
            </span>
            {automationControl.paused ? (
              <Button variant="primary" size="sm" onClick={() => resumeTreasuryAutomation()}>
                <Play size={12} /> Resume automation
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="h-8 px-2.5 rounded-lg surface text-[11.5px] outline-none w-[180px]"
                />
                <Button variant="danger" size="sm" onClick={() => pauseAllTreasuryAutomation(pauseReason || undefined)}>
                  <Pause size={12} /> Pause all automation
                </Button>
              </div>
            )}
            <Link href="/settings/automation" className="text-[11px] shrink-0" style={{ color: "var(--accent-3)" }}>
              Emergency controls →
            </Link>
          </div>
        </Panel>
      )}

      <NewRecipientReviewPanel />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Total value" value={masked ? "••••" : usd(t.total, { compact: true })} sub="public + shielded" />
        <Stat label="Shielded" value={masked ? "••••" : usd(t.shielded, { compact: true })} sub={`${((t.shielded / t.total) * 100 || 0).toFixed(0)}% of treasury`} tone="cyan" />
        <Stat label="Active agents" value={activeDeployments.length} sub={`${deployments.length} deployments`} tone="good" />
        <Stat label="Pending approvals" value={pendingApprovals.length} sub="requires human" tone="warn" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Active schedules" value={activeSchedules.length} sub={`${dueWithin7d.length} due within 7 days`} />
        <Stat label="Budget usage" value={totalBudgetLimit > 0 ? `${Math.round((totalBudgetUsed / totalBudgetLimit) * 100)}%` : "—"} sub={budgets.length > 0 ? `${formatMinor(totalBudgetUsed)} / ${formatMinor(totalBudgetLimit)}` : "no budgets"} tone={totalBudgetLimit > 0 && totalBudgetUsed / totalBudgetLimit >= 0.9 ? "warn" : undefined} />
        <Stat label="Active workflows" value={activeWorkflowRuns.length} sub={`${workflowRuns.length} total runs`} tone="cyan" />
        <Stat label="Recent executions" value={dbReceipts.length} sub="persisted receipts" tone="good" />
      </div>

      {activeSchedules.length > 0 && (
        <Panel padded={false} edge>
          <PanelHeader title="Upcoming payments" sub="Next occurrence per active schedule" />
          <div className="p-4 grid sm:grid-cols-2 gap-2">
            {activeSchedules
              .slice()
              .sort((a, b) => a.nextOccurrenceAt - b.nextOccurrenceAt)
              .slice(0, 6)
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-[11.5px]" style={{ background: "var(--track)" }}>
                  <span className="truncate mr-2">{s.reason}</span>
                  <span className="mono faint shrink-0">{datetime(s.nextOccurrenceAt)}</span>
                </div>
              ))}
          </div>
        </Panel>
      )}

      <DiagnosticPanel wallet={wallet} diagnostic={diagnostic} adapter={adapter} />

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        {positions.map((p) => (
          <TreasuryCard key={p.asset} position={p} masked={masked} />
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <Panel padded={false}>
          <PanelHeader title="Position detail" sub="Allocation ceilings are enforced per-binding by the policy engine" />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-faint)" }}>
                  {["Asset", "Public", "Shielded", "Notes", "Allocated", "USD value"].map((h) => (
                    <th key={h} className="font-normal text-[11px] uppercase tracking-wider px-5 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const dp = p.asset === "strkBTC" ? 4 : p.asset === "ETH" ? 3 : 0;
                  const mask = (s: string) => (masked ? "••••" : s);
                  return (
                    <tr key={p.asset} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.asset}</div>
                        <div className="text-[11px] faint">{ASSETS[p.asset].name}</div>
                      </td>
                      <td className="px-5 py-3 mono faint">{mask(num(p.publicBalance, dp))}</td>
                      <td className="px-5 py-3 mono" style={{ color: "var(--accent-3)" }}>
                        {mask(num(p.shieldedBalance, dp))}
                      </td>
                      <td className="px-5 py-3 mono faint">{p.noteCount}</td>
                      <td className="px-5 py-3 mono faint">{mask(num(p.allocatedToAgents, dp))}</td>
                      <td className="px-5 py-3 mono">{mask(usd(usdValue(p.asset, p.shieldedBalance + p.publicBalance), { compact: true }))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {positions.length === 0 && (
            <div className="p-5 text-[12px] faint">NOT AVAILABLE — connect wallet to fetch balances via wallet_strk20Balances</div>
          )}
        </Panel>

        <div className="space-y-3">
          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-1">Shield / unshield</div>
            <p className="text-[11.5px] faint mb-4">These actions are executed by your wallet. Holographic only initiates the request.</p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" className="flex-1" disabled={wallet.status !== "connected"}>
                <ArrowDownToLine size={13} /> Shield
              </Button>
              <Button variant="outline" size="sm" className="flex-1" disabled={wallet.status !== "connected"}>
                <ArrowUpFromLine size={13} /> Unshield
              </Button>
            </div>
            <div
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 mt-4"
              style={{
                background: "color-mix(in oklab, var(--warn) 9%, transparent)",
                border: "1px solid color-mix(in oklab, var(--warn) 26%, transparent)",
              }}
            >
              <Info size={13} style={{ color: "var(--warn)", marginTop: 1 }} />
              <p className="text-[11.5px] dim">Mock privacy layer active. Real execution via wallet_strk20InvokeTransaction when wallet is REAL and privacy capable.</p>
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Active deployments (persisted)</div>
            {activeDeployments.length === 0 ? (
              <div className="text-[12px] faint">No active deployments — deploy Treasury Agent from marketplace</div>
            ) : (
              <div className="space-y-2">
                {activeDeployments.map((d) => {
                  const policy = dbPolicies.find((p) => p.id === d.policyId);
                  return (
                    <div key={d.id} className="rounded-lg p-2.5" style={{ background: "var(--track)" }}>
                      <div className="text-[12px] font-medium">{d.agentId} v{d.agentVersion}</div>
                      <div className="mono text-[10.5px] faint">deployment {short(d.id, 8, 4)} · policy {policy ? short(policy.id, 8, 4) : "—"} · {new Date(d.createdAt).toLocaleDateString()}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Recent receipts (persisted)</div>
            {dbReceipts.length === 0 ? (
              <div className="text-[12px] faint">No receipts — execute a private payment to generate one</div>
            ) : (
              <div className="space-y-1.5">
                {dbReceipts.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-[11px]">
                    <span className="mono">{short(r.id, 8, 4)} · {r.bucket}</span>
                    <Badge tone={r.isDemo ? "warn" : "good"}>{r.isDemo ? "DEMO RECEIPT" : "STRK20 EXECUTION"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <TreasuryTransferForm />

      {dbPolicies.length > 0 && (
        <div className="space-y-3">
          <div className="font-display text-[16px] font-semibold">Approved recipients (persisted per policy)</div>
          {dbPolicies.map((policy) => (
            <RecipientManager key={policy.id} policyId={policy.id} policyLabel={policy.label} />
          ))}
        </div>
      )}
    </div>
  );
}
