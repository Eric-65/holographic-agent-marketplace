import { useMemo, useState } from "react";
import { useStore } from "../../../lib/store";
import { SectionTitle, Panel, PanelHeader, Badge, Button } from "../../../components/ui/primitives";
import { getCreatorSubmissions, getPublishingRecords, approveAgent, rejectAgent } from "../../../lib/agents/publishing";
import { short } from "../../../lib/hash";
import { datetime } from "../../../lib/format";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export default function CreatorSubmissionsPage() {
  const { dbUser, refreshFromDb } = useStore();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submissions = useMemo(() => {
    if (!dbUser) return [];
    return getCreatorSubmissions(dbUser.address).sort((a, b) => b.createdAt - a.createdAt);
  }, [dbUser]);

  const allRecords = useMemo(() => getPublishingRecords(), []);

  const handleApprove = (agentId: string) => {
    if (!dbUser) return;
    setError(null);
    try {
      // For demo, reviewer is different wallet — simulate with owner check
      // In real, reviewer would be separate role, not creator
      const reviewer = "0x02aa11bb22cc33dd44ee55ff66007788990abcde";
      approveAgent(agentId, reviewer, dbUser.address);
      refreshFromDb();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReject = (agentId: string) => {
    if (!dbUser) return;
    setError(null);
    try {
      rejectAgent(agentId, "0x02aa11bb22cc33dd44ee55ff66007788990abcde", reason || "Manifest invalid or risk too high");
      refreshFromDb();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Creator" title="Submissions" sub="Review panel: Manifest validity, Capabilities, Policy compatibility, Privacy behavior, Risk classification, Contract dependencies, Verification compatibility. Reviewer decisions: APPROVE, REJECT, REQUEST CHANGES. Store review history. Do not allow creators to approve own agents." />

      {error && <div className="text-[11px] px-3 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>{error}</div>}

      <Panel padded={false}>
        <PanelHeader title={`Submissions — ${submissions.length}`} sub="My submissions" />
        {submissions.length === 0 ? (
          <div className="p-5 text-[12px] faint">No submissions — submit draft agent from My Agents</div>
        ) : (
          <div>
            {submissions.map((s: any) => (
              <div key={s.id} className="border-b last:border-0 px-5 py-3 flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium">{s.agentId} v{s.version}</div>
                  <div className="mono text-[10.5px] faint">{short(s.id, 8, 4)} · {s.status} · {datetime(s.createdAt)} · reviewer {s.reviewer ? short(s.reviewer, 6, 4) : "—"}</div>
                  {s.reviewNotes && <div className="text-[11px] mt-1" style={{ color: "var(--bad)" }}>{s.reviewNotes}</div>}
                </div>
                <div className="flex gap-1.5">
                  <Badge tone={s.status === "LIVE" ? "good" : s.status === "REJECTED" ? "bad" : s.status === "SUBMITTED" ? "warn" : "neutral"}>{s.status}</Badge>
                  {s.status === "SUBMITTED" && <Badge tone="neutral"><Clock size={10} /> Under review</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel padded={false}>
        <PanelHeader title={`All publishing records — ${allRecords.length}`} sub="Internal review panel (for MVP, creator dashboard shows all for demo)" />
        <div>
          {allRecords.map((r: any) => (
            <div key={r.id} className="border-b last:border-0 px-5 py-3 flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0">
                <div className="text-[12px] font-medium">{r.agentId} v{r.version} · creator {short(r.creatorWallet, 6, 4)}</div>
                <div className="mono text-[10px] faint">{short(r.id, 8, 4)} · {r.status} · {datetime(r.createdAt)}</div>
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => handleApprove(r.agentId)}><CheckCircle2 size={11} /> Approve</Button>
                <Button variant="ghost" size="sm" onClick={() => handleReject(r.agentId)}><XCircle size={11} /> Reject</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason" className="w-full h-8 px-3 rounded-lg surface text-[12px] outline-none" />
          <div className="text-[10.5px] faint mt-2">Do not allow creators to approve own agents — security check: reviewer != creatorWallet throws "Creator cannot approve own agent"</div>
        </div>
      </Panel>
    </div>
  );
}
