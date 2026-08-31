import { useStore } from "../../../lib/store";
import { SectionTitle, Panel, PanelHeader, Stat } from "../../../components/ui/primitives";
import { getAllTelemetry } from "../../../lib/agents/metrics";
import { calculateAgentHealth } from "../../../lib/agents/health";
import { short } from "../../../lib/hash";
import { timeAgo } from "../../../lib/format";

export default function CreatorMetricsPage() {
  const { dbUser, dbAgents, dbReceipts, executionRequests } = useStore();
  const myAgents = dbUser ? dbAgents.filter((a) => a.creatorWallet.toLowerCase() === dbUser.address.toLowerCase()) : [];
  const telemetry = dbUser ? getAllTelemetry(dbUser.id) : [];

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Creator" title="Execution Metrics" sub="Track intent count, approved, blocked, human approvals, completed, failed, average execution duration, policy rejection rate, verification coverage. Only collect data required for operational metrics, no private transaction information." />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="My agents" value={myAgents.length} sub="creator owned" />
        <Stat label="Total executions" value={executionRequests.filter((r: any) => r.userId === dbUser?.id).length} sub="intent count" tone="neutral" />
        <Stat label="Successful" value={dbReceipts.filter((r: any) => r.userId === dbUser?.id && (r.status === "executed" || r.status === "COMPLETED")).length} sub="completed" tone="good" />
        <Stat label="Blocked" value={executionRequests.filter((r: any) => r.userId === dbUser?.id && (r.status === "BLOCKED" || r.status === "blocked")).length} sub="policy blocks" tone="bad" />
      </div>

      <Panel padded={false}>
        <PanelHeader title="Agent metrics — operational metrics from real data" sub="Execution count, Successful executions, Policy-block rate, Failed executions, Human approval rate, Verification coverage — do not create trust score until methodology defined" />
        {telemetry.length === 0 ? (
          <div className="p-5 text-[12px] faint">No telemetry yet — deploy agent and execute payments to generate metrics. Do not fabricate popularity metrics.</div>
        ) : (
          <div>
            {telemetry.map((t) => {
              const health = dbUser ? calculateAgentHealth(t.agentId, dbUser.id) : null;
              return (
                <div key={t.agentId} className="border-b last:border-0 px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium">{t.agentId} · health {health?.status ?? "—"}</div>
                      <div className="text-[11px] faint">Intent count {t.intentCount} · Approved {t.approved} · Blocked {t.blocked} · Human approvals {t.humanApprovals} · Completed {t.completed} · Failed {t.failed}</div>
                      <div className="mono text-[10.5px] faint mt-1">Avg duration {t.averageExecutionDuration}ms · Rejection rate {t.policyRejectionRate}% · Verification coverage {t.verificationCoverage}% {t.lastExecutionAt ? `· last ${timeAgo(t.lastExecutionAt)}` : ""}</div>
                    </div>
                    <div className="text-[11px] mono faint">{short(t.agentId, 8, 4)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="font-display text-[13px] font-semibold mb-2">Security boundaries — marketplace agents must NOT receive unrestricted access</div>
        <div className="text-[11px] dim space-y-1">
          <div>✓ Agents produce intents rather than directly executing transactions</div>
          <div>✓ Agents cannot sign, send raw blockchain transactions, modify policies, modify recipients, modify permissions, access viewing keys/private keys, execute STRK20 directly</div>
          <div>✓ Execution architecture: Agent → Intent → Capability validation → Policy Engine → Human approval if required → Wallet → STRK20 → Receipt → Verification</div>
          <div>✓ Only Holographic's controlled execution service can continue after policy approval</div>
        </div>
      </Panel>
    </div>
  );
}
