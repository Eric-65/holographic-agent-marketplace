import { useState, useMemo } from "react";
import { useStore } from "../../../lib/store";
import { short } from "../../../lib/hash";
import { datetime } from "../../../lib/format";
import { Panel, PanelHeader, SectionTitle, Badge, Button } from "../../../components/ui/primitives";
import { createAuditRequest, authorizeAuditRequest, fulfillAuditRequest, rejectAuditRequest, getAuditRequestsByUser, getAuditEventsByUser } from "../../../lib/api/audits";
import { getAuditEvidence, generateComplianceReport } from "../../../lib/api/verification";
import { ShieldCheck, Eye, Clock, Download } from "lucide-react";

export default function AuditsPage() {
  const { dbUser, executionRequests, dbPolicies, deployments } = useStore();
  const [reason, setReason] = useState("Quarterly compliance review");
  const [subjectId, setSubjectId] = useState("");
  const [subjectType, setSubjectType] = useState<"execution" | "agent" | "policy" | "date_range">("execution");
  const [scopePolicy, setScopePolicy] = useState(true);
  const [scopeExecution, setScopeExecution] = useState(true);
  const [scopeDisclosure, setScopeDisclosure] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auditRequests = useMemo(() => {
    if (!dbUser) return [];
    try {
      return getAuditRequestsByUser(dbUser.id).sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }, [dbUser, executionRequests]);

  const auditEvents = useMemo(() => {
    if (!dbUser) return [];
    try {
      return getAuditEventsByUser(dbUser.id).slice(0, 20);
    } catch {
      return [];
    }
  }, [dbUser, executionRequests]);

  const handleCreate = () => {
    if (!dbUser) {
      setError("Connect wallet first");
      return;
    }
    if (!subjectId) {
      setError("Subject ID required");
      return;
    }
    setError(null);
    try {
      createAuditRequest(
        dbUser.id,
        subjectType as any,
        subjectId,
        reason,
        { policyEvidence: scopePolicy, executionEvidence: scopeExecution, disclosure: scopeDisclosure },
        dbUser.address,
      );
      setSubjectId("");
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const handleAuthorize = (id: string) => {
    if (!dbUser) return;
    try {
      authorizeAuditRequest(id, dbUser.id, dbUser.address);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleFulfill = (id: string) => {
    if (!dbUser) return;
    try {
      fulfillAuditRequest(id, dbUser.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReject = (id: string) => {
    if (!dbUser) return;
    try {
      rejectAuditRequest(id, dbUser.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleGetEvidence = (id: string) => {
    if (!dbUser) return;
    try {
      const evidence = getAuditEvidence(id, dbUser.id);
      alert(`Evidence: ${JSON.stringify(evidence, null, 2).slice(0, 500)}... Disclosure available: ${evidence.disclosureAvailable ? "DISCLOSURE AVAILABLE" : "DISCLOSURE NOT AVAILABLE"}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Compliance"
        title="Audit Requests"
        sub="A user with appropriate authority can create an audit request for a specific execution, agent, or policy. Possible states: PENDING, AUTHORIZED, FULFILLED, REJECTED, EXPIRED. Holographic does NOT generate viewing keys, store raw viewing keys, or create custom disclosure protocols — uses official STRK20 disclosure architecture."
        right={
          <Button variant="outline" size="sm" onClick={() => {
            if (!dbUser) return;
            try {
              const report = generateComplianceReport(dbUser.id);
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `compliance-report-${Date.now()}.json`;
              a.click();
            } catch {}
          }}>
            <Download size={12} /> Compliance Report
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-3">
        <div className="space-y-3">
          <Panel padded={false}>
            <PanelHeader title="Create audit request" sub="Subject: Execution #HGL-00421, Reason: Quarterly compliance review, Scope: Policy evidence, Execution evidence, Authorized disclosure" />
            <div className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] faint uppercase">Subject type</label>
                  <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as any)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] outline-none">
                    <option value="execution">Single execution</option>
                    <option value="agent">Agent</option>
                    <option value="policy">Policy version</option>
                    <option value="date_range">Date range</option>
                    <option value="execution_class">Execution class</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] faint uppercase">Subject ID</label>
                  <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12px] mono outline-none">
                    <option value="">Select...</option>
                    {executionRequests.map((r) => (
                      <option key={r.id} value={r.id}>{short(r.id, 8, 4)} · {r.intent.reason.slice(0, 20)}</option>
                    ))}
                    {dbPolicies.map((p) => (
                      <option key={p.id} value={p.id}>{short(p.id, 8, 4)} · {p.label}</option>
                    ))}
                    {deployments.map((d) => (
                      <option key={d.id} value={d.agentId}>{d.agentId} · {short(d.id, 8, 4)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] faint uppercase">Reason</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] outline-none" />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] faint uppercase">Requested scope</div>
                <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={scopePolicy} onChange={(e) => setScopePolicy(e.target.checked)} /> Policy evidence</label>
                <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={scopeExecution} onChange={(e) => setScopeExecution(e.target.checked)} /> Execution evidence</label>
                <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={scopeDisclosure} onChange={(e) => setScopeDisclosure(e.target.checked)} /> Authorized disclosure (STRK20 viewing-key path)</label>
              </div>

              {error && <div className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>{error}</div>}

              <Button variant="primary" size="sm" onClick={handleCreate} disabled={!dbUser}>
                Create audit request
              </Button>

              <div className="text-[10.5px] faint">Selective disclosure boundary: STRK20 already provides viewing-key/disclosure mechanism. Holographic integrates at application level, displays DISCLOSURE AVAILABLE / NOT AVAILABLE / REQUESTED, but does NOT generate/store viewing keys or create custom disclosure protocols.</div>
            </div>
          </Panel>

          <Panel padded={false}>
            <PanelHeader title="Audit requests" sub={`${auditRequests.length} total`} />
            {auditRequests.length === 0 ? (
              <div className="p-5 text-[12px] faint">No audit requests — create one above. Example: Execution #HGL-00421, Reason: Quarterly compliance review</div>
            ) : (
              <div>
                {auditRequests.map((req) => (
                  <div key={req.id} className="border-b last:border-0 px-5 py-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{req.subjectType} · {short(req.subjectId, 8, 4)} — {req.reason}</div>
                        <div className="mono text-[10.5px] faint truncate">
                          {short(req.id, 8, 4)} · requested by {short(req.requestedBy, 8, 4)} · expires {datetime(req.expiresAt)} · scope: {req.scope.policyEvidence ? "policy " : ""}{req.scope.executionEvidence ? "execution " : ""}{req.scope.disclosure ? "disclosure" : ""}
                        </div>
                      </div>
                      <Badge tone={req.status === "PENDING" ? "warn" : req.status === "AUTHORIZED" ? "cyan" : req.status === "FULFILLED" ? "good" : req.status === "REJECTED" ? "bad" : "neutral"}>{req.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {req.status === "PENDING" && <Button variant="outline" size="sm" onClick={() => handleAuthorize(req.id)}>Authorize</Button>}
                      {req.status === "AUTHORIZED" && <Button variant="primary" size="sm" onClick={() => handleFulfill(req.id)}>Fulfill</Button>}
                      {req.status === "PENDING" && <Button variant="ghost" size="sm" onClick={() => handleReject(req.id)}>Reject</Button>}
                      {(req.status === "AUTHORIZED" || req.status === "FULFILLED") && <Button variant="ghost" size="sm" onClick={() => handleGetEvidence(req.id)}><Eye size={11} /> Evidence</Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel>
            <div className="font-display text-[14px] font-semibold mb-2">Auditor roles</div>
            <div className="text-[11.5px] space-y-2">
              <div><span className="font-medium">OWNER</span><span className="faint"> — can configure agents and policies</span></div>
              <div><span className="font-medium">OPERATOR</span><span className="faint"> — can execute allowed workflows and respond to approvals</span></div>
              <div><span className="font-medium">AUDITOR</span><span className="faint"> — can view authorized compliance evidence, scoped, not unrestricted private activity</span></div>
            </div>
            <div className="mt-3 pt-3 border-t text-[10.5px] faint" style={{ borderColor: "var(--border)" }}>
              Auditor must NOT automatically gain unrestricted access to all private activity — scoped authorization, audit request expiration (7 days), replay resistance, duplicate prevention.
            </div>
          </Panel>

          <Panel padded={false}>
            <PanelHeader title="Audit trail" sub="Immutable-style timeline, OFFCHAIN vs ONCHAIN events" />
            <div className="p-4 space-y-0 max-h-[500px] overflow-y-auto scrollbar-thin">
              {auditEvents.length === 0 ? (
                <div className="text-[12px] faint">No audit events yet</div>
              ) : (
                auditEvents.map((ev) => (
                  <div key={ev.id} className="flex gap-2.5 pb-3">
                    <span className="h-6 w-6 rounded-lg grid place-items-center surface-2 shrink-0">
                      {ev.isOnchain ? <ShieldCheck size={11} style={{ color: "var(--good)" }} /> : <Clock size={11} className="faint" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-medium truncate">{ev.type} · {ev.subjectType}</div>
                      <div className="mono text-[10px] faint truncate">{short(ev.subjectId, 8, 4)} · {datetime(ev.createdAt)} · {ev.isOnchain ? "ONCHAIN EVENT" : "OFFCHAIN EVENT"}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[13px] font-semibold mb-2">Selective disclosure boundary</div>
            <div className="text-[11px] space-y-1">
              <div className="flex justify-between"><span>DISCLOSURE AVAILABLE</span><Badge tone="good"><Eye size={10} /> available</Badge></div>
              <div className="flex justify-between"><span>DISCLOSURE NOT AVAILABLE</span><Badge tone="neutral"><EyeOff size={10} /> not available</Badge></div>
              <div className="flex justify-between"><span>DISCLOSURE REQUESTED</span><Badge tone="warn"><Clock size={10} /> requested</Badge></div>
            </div>
            <div className="text-[10.5px] faint mt-2">Holographic does NOT generate/store viewing keys, expose in logs, create custom disclosure, reconstruct unrelated histories — uses official STRK20 disclosure architecture.</div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EyeOff({ size }: { size: number }) {
  return <Eye size={size} className="opacity-50" />;
}
