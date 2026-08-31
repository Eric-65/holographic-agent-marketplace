import { Link } from "../router";
import { useStore } from "../../lib/store";
import { Panel, PanelHeader, SectionTitle, Stat, Badge, Button } from "../../components/ui/primitives";
import { getCreatorSubmissions } from "../../lib/agents/publishing";
import { calculateTelemetry } from "../../lib/agents/metrics";
import { short } from "../../lib/hash";
import { datetime } from "../../lib/format";

export default function CreatorPage() {
  const { dbUser, dbAgents, deployments, dbReceipts } = useStore();
  const submissions = dbUser ? getCreatorSubmissions(dbUser.address) : [];
  const myAgents = dbUser ? dbAgents.filter((a) => a.creatorWallet.toLowerCase() === dbUser.address.toLowerCase()) : [];
  const myDeployments = dbUser ? deployments.filter((d) => d.userId === dbUser.id) : [];
  const myReceipts = dbUser ? dbReceipts.filter((r) => r.userId === dbUser.id) : [];

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Creator"
        title="Creator Dashboard"
        sub="My Agents, Drafts, Submissions, Versions, Deployments, Execution Metrics. Creators must NOT receive users' private wallet information. Publishing permissioned, only approved creators can publish LIVE."
        right={
          <div className="flex gap-2">
            <Link href="/creator/agents"><Button variant="outline" size="sm">My Agents</Button></Link>
            <Link href="/creator/submissions"><Button variant="outline" size="sm">Submissions</Button></Link>
            <Link href="/creator/metrics"><Button variant="outline" size="sm">Metrics</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="My Agents" value={myAgents.length} sub={`${myAgents.filter((a) => a.deploymentStatus === "LIVE").length} LIVE`} />
        <Stat label="Submissions" value={submissions.length} sub={`${submissions.filter((s: any) => s.status === "SUBMITTED" || s.status === "PENDING").length} pending`} tone="warn" />
        <Stat label="Deployments" value={myDeployments.length} sub={`${myDeployments.filter((d) => d.status === "ACTIVE" || d.status === "active").length} active`} tone="good" />
        <Stat label="Executions" value={myReceipts.length} sub="receipts" tone="neutral" />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-3">
        <Panel padded={false}>
          <PanelHeader title="My Agents" sub="Drafts, versions, deployments" />
          {myAgents.length === 0 ? (
            <div className="p-5 text-[12px] faint">No agents yet — create draft agent via creator/agents page. For MVP, curated creator model, no permissionless third-party executable code uploads yet.</div>
          ) : (
            <div>
              {myAgents.map((a) => {
                const tel = calculateTelemetry(a.id, dbUser?.id);
                return (
                  <div key={a.id} className="border-b last:border-0 px-5 py-3 flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{a.name} v{a.version}</div>
                      <div className="mono text-[10.5px] faint">{short(a.id, 8, 4)} · {a.category} · {a.riskLevel} · {a.deploymentStatus}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge tone={a.deploymentStatus === "LIVE" ? "good" : a.deploymentStatus === "BETA" ? "cyan" : "neutral"}>{a.deploymentStatus}</Badge>
                      <Badge tone="neutral">{tel.intentCount} exec</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-3">
          <Panel padded={false}>
            <PanelHeader title="Submissions" sub="Approval status" />
            {submissions.length === 0 ? (
              <div className="p-5 text-[12px] faint">No submissions</div>
            ) : (
              <div>
                {submissions.map((s: any) => (
                  <div key={s.id} className="border-b last:border-0 px-4 py-2.5 text-[11.5px]" style={{ borderColor: "var(--border)" }}>
                    <div className="flex justify-between"><span>{s.agentId} v{s.version}</span><Badge tone={s.status === "LIVE" ? "good" : s.status === "REJECTED" ? "bad" : s.status === "SUBMITTED" ? "warn" : "neutral"}>{s.status}</Badge></div>
                    <div className="mono text-[10px] faint">{datetime(s.createdAt)} · reviewer {s.reviewer ? short(s.reviewer, 6, 4) : "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="font-display text-[13px] font-semibold mb-2">Publishing workflow</div>
            <div className="text-[11px] dim space-y-1">
              <div>DRAFT → Validate Manifest → SUBMITTED → Review → APPROVED → Register → Publish → LIVE</div>
              <div>States: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, LIVE, SUSPENDED, DEPRECATED</div>
              <div>Only approved creators can publish LIVE agents — permissioned for MVP</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
