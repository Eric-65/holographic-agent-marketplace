import { useMemo } from "react";
import { Link } from "../router";
import { useStore } from "../../lib/store";
import { isContractDeployed } from "../../lib/contracts/config";
import { ShieldCheck, FileCheck2, ScrollText, Users, Eye } from "lucide-react";
import { Panel, PanelHeader, SectionTitle, Stat, Badge } from "../../components/ui/primitives";
import { generateComplianceReport } from "../../lib/api/verification";
import { Button } from "../../components/ui/primitives";

export default function CompliancePage() {
  const { dbUser, deployments, dbPolicies, dbReceipts, executionRequests, pendingApprovals } = useStore();

  const stats = useMemo(() => {
    if (!dbUser) {
      return {
        agentsRegistered: 0,
        activePolicies: 0,
        policyCommitments: 0,
        executions: 0,
        attestations: 0,
        pendingAudits: 0,
        failedVerifications: 0,
      };
    }
    const agentsRegistered = deployments.length;
    const activePolicies = dbPolicies.filter((p) => p.status === "ACTIVE" || p.status === "active").length;
    const policyCommitments = dbPolicies.filter((p) => p.onchainCommitTx).length;
    const executions = executionRequests.length;
    const attestations = dbReceipts.length;
    const pendingAudits = (() => {
      try {
        const { db } = require("../../lib/db/client");
        return db.getAll("audit_requests").filter((r: any) => r.userId === dbUser.id && r.status === "PENDING").length;
      } catch {
        return 0;
      }
    })();
    const failedVerifications = (() => {
      try {
        const { db } = require("../../lib/db/client");
        return db.getAll("verification_results").filter((r: any) => r.userId === dbUser.id && r.status === "MISMATCH").length;
      } catch {
        return 0;
      }
    })();

    return {
      agentsRegistered,
      activePolicies,
      policyCommitments,
      executions,
      attestations,
      pendingAudits,
      failedVerifications,
    };
  }, [dbUser, deployments, dbPolicies, dbReceipts, executionRequests]);

  const complianceHealth = useMemo(() => {
    const checks = [
      { label: "Agent Registry", ok: stats.agentsRegistered > 0, icon: Users },
      { label: "Policy Anchoring", ok: isContractDeployed("policy_commitment") ? stats.policyCommitments > 0 : true, icon: ScrollText },
      { label: "Execution Attestation", ok: isContractDeployed("execution_attestor") ? stats.attestations > 0 : true, icon: FileCheck2 },
      { label: "Policy Enforcement", ok: stats.executions > 0, icon: ShieldCheck },
      { label: "Selective Disclosure", ok: true, icon: Eye, status: "AVAILABLE" },
    ];

    const verifiedCount = checks.filter((c) => c.ok).length;
    const overall =
      verifiedCount === checks.length
        ? "VERIFICATION COMPLETE"
        : verifiedCount >= checks.length - 1
          ? "ATTENTION REQUIRED"
          : "NOT VERIFIED";

    return { checks, overall };
  }, [stats]);

  const handleGenerateReport = () => {
    if (!dbUser) {
      alert("Connect wallet first");
      return;
    }
    try {
      const report = generateComplianceReport(dbUser.id);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Failed to generate report: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Compliance"
        title="Compliance Dashboard"
        sub="Private by default. Policy-controlled. Verifiable when required. Private execution + policy accountability + verifiable receipts + selective audit workflows. STRK20 remains responsible for private transaction execution and disclosure architecture."
        right={
          <div className="flex gap-2">
            <Link href="/verification">
              <Button variant="outline" size="sm">Verification Center</Button>
            </Link>
            <Link href="/compliance/audits">
              <Button variant="outline" size="sm">Audit Requests</Button>
            </Link>
            <Button variant="primary" size="sm" onClick={handleGenerateReport}>Generate Report</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Agents registered" value={stats.agentsRegistered} sub={`${deployments.length} deployments`} tone="good" />
        <Stat label="Active policies" value={stats.activePolicies} sub={`${stats.policyCommitments} anchored onchain`} tone="good" />
        <Stat label="Executions" value={stats.executions} sub={`${dbReceipts.length} receipts`} tone="neutral" />
        <Stat label="Pending audits" value={stats.pendingAudits} sub={`${stats.failedVerifications} failed verifications`} tone={stats.pendingAudits > 0 ? "warn" : "neutral"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-3">
        <Panel padded={false}>
          <PanelHeader title="Compliance Overview" sub="Agents registered, active policies, policy commitments, executions, attestations, pending audit requests, failed verifications" />
          <div className="p-5 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={{ background: "var(--track)" }}>
                <div className="text-[11px] faint uppercase">Agents registered</div>
                <div className="mono text-[18px] mt-1">{stats.agentsRegistered}</div>
                <div className="text-[11px] faint">Deployed agents in persistent DB</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--track)" }}>
                <div className="text-[11px] faint uppercase">Policy commitments</div>
                <div className="mono text-[18px] mt-1">{stats.policyCommitments} / {stats.activePolicies}</div>
                <div className="text-[11px] faint">{isContractDeployed("policy_commitment") ? "Onchain anchored" : "Offchain only — contracts not yet deployed"}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--track)" }}>
                <div className="text-[11px] faint uppercase">Executions</div>
                <div className="mono text-[18px] mt-1">{stats.executions}</div>
                <div className="text-[11px] faint">Total execution requests</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--track)" }}>
                <div className="text-[11px] faint uppercase">Attestations</div>
                <div className="mono text-[18px] mt-1">{stats.attestations}</div>
                <div className="text-[11px] faint">{isContractDeployed("execution_attestor") ? "Onchain attestations" : "Offchain receipts"}</div>
              </div>
            </div>

            <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="font-display text-[13px] font-semibold mb-2">Policy Status</div>
              {dbPolicies.length === 0 ? (
                <div className="text-[12px] faint">No policies — deploy Treasury Agent to create one</div>
              ) : (
                <div className="space-y-1.5">
                  {dbPolicies.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[11.5px] px-3 py-2 rounded-lg" style={{ background: "var(--track)" }}>
                      <span className="truncate">{p.label} v{p.version}</span>
                      <div className="flex gap-1.5">
                        <Badge tone={p.status === "ACTIVE" || p.status === "active" ? "good" : "neutral"}>{p.status}</Badge>
                        <Badge tone={p.onchainCommitTx ? "good" : "neutral"}>{p.onchainCommitTx ? "ANCHORED" : "NOT ANCHORED"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="font-display text-[13px] font-semibold mb-2">Execution Verification</div>
              {executionRequests.length === 0 ? (
                <div className="text-[12px] faint">No executions — use Treasury to send private payment</div>
              ) : (
                <div className="space-y-1.5">
                  {executionRequests.slice(0, 5).map((req) => (
                    <div key={req.id} className="flex items-center justify-between text-[11.5px] px-3 py-2 rounded-lg" style={{ background: "var(--track)" }}>
                      <span className="truncate">{req.intent.reason} · {short(req.intentHash, 8, 4)}</span>
                      <Badge tone={req.status === "BLOCKED" ? "bad" : req.status === "COMPLETED" ? "good" : req.status === "AWAITING_USER" ? "warn" : "neutral"}>{req.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Compliance Health</div>
            <div className="space-y-2.5">
              {complianceHealth.checks.map((check) => {
                const Icon = check.icon;
                return (
                  <div key={check.label} className="flex items-center gap-2.5 text-[12px]">
                    <Icon size={12} className="faint" />
                    <span className="flex-1">{check.label}</span>
                    {(check as any).status ? (
                      <Badge tone="neutral">{(check as any).status}</Badge>
                    ) : check.ok ? (
                      <Badge tone="good">✓</Badge>
                    ) : (
                      <Badge tone="neutral">—</Badge>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="text-[11px] faint uppercase">Overall</div>
              <div className="mono text-[13px] font-medium mt-1" style={{ color: complianceHealth.overall === "VERIFICATION COMPLETE" ? "var(--good)" : complianceHealth.overall === "ATTENTION REQUIRED" ? "var(--warn)" : "var(--text-faint)" }}>
                {complianceHealth.overall}
              </div>
              <div className="text-[10.5px] faint mt-1">Application-level terminology, not legal/regulatory compliance</div>
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-2">Evidence</div>
            <div className="text-[11.5px] dim space-y-1">
              <div>Agent identity: {stats.agentsRegistered > 0 ? "VERIFIED" : "NOT AVAILABLE"}</div>
              <div>Policy version: {stats.activePolicies > 0 ? "VERIFIED" : "NOT AVAILABLE"}</div>
              <div>Policy decision: {stats.executions > 0 ? "VERIFIED" : "NOT AVAILABLE"}</div>
              <div>Approval state: {pendingApprovals.length > 0 ? "PENDING" : "VERIFIED"}</div>
              <div>Execution result: {stats.attestations > 0 ? "VERIFIED" : "NOT AVAILABLE"}</div>
              <div>Attestation: {isContractDeployed("execution_attestor") && stats.attestations > 0 ? "ONCHAIN" : "OFFCHAIN"}</div>
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-2">Agent Trust</div>
            <div className="text-[11.5px] dim">
              <div>Verification rate: {dbReceipts.length > 0 ? `${Math.round((dbReceipts.filter((r: any) => r.status === "executed" || r.status === "COMPLETED").length / dbReceipts.length) * 100)}%` : "INSUFFICIENT DATA"}</div>
              <div>Policy violations: {executionRequests.filter((r: any) => r.status === "BLOCKED").length}</div>
              <div>Human approval rate: {executionRequests.length > 0 ? `${Math.round((executionRequests.filter((r: any) => r.approvedByUser).length / executionRequests.length) * 100)}%` : "INSUFFICIENT DATA"}</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function short(addr: string, head = 6, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
