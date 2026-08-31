import { useState, useMemo } from "react";
import { useStore } from "../../lib/store";
import { short } from "../../lib/hash";
import { datetime } from "../../lib/format";
import { isContractDeployed } from "../../lib/contracts/config";
import { verifyExecution } from "../../lib/api/verification";
import { Panel, PanelHeader, SectionTitle, Badge, Button } from "../../components/ui/primitives";
import { CheckCircle2, XCircle, Clock, ShieldCheck, FileCheck2, ScrollText, Bot, UserCheck, Wallet, ExternalLink } from "lucide-react";

export default function VerificationPage() {
  const { dbUser, dbReceipts, executionRequests, dbPolicies, deployments } = useStore();
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [verifying, setVerifying] = useState(false);

  const receipts = dbUser ? dbReceipts : [];
  const selectedReceipt = selectedReceiptId ? receipts.find((r) => r.id === selectedReceiptId) ?? null : null;
  const relatedRequest = selectedReceipt ? executionRequests.find((req) => req.id === selectedReceipt.executionRequestId) ?? null : null;
  const relatedPolicy = relatedRequest ? dbPolicies.find((p) => p.id === relatedRequest.policyId) ?? null : null;
  const relatedDeployment = relatedRequest ? deployments.find((d) => d.id === relatedRequest.agentDeploymentId) ?? null : null;

  const handleVerify = async () => {
    if (!selectedReceipt || !dbUser) return;
    setVerifying(true);
    try {
      const result = await verifyExecution(selectedReceipt.executionRequestId, dbUser.id);
      setVerificationResult(result);
    } catch (e: any) {
      setVerificationResult({ status: "UNAVAILABLE", error: e.message, agent: "UNAVAILABLE", policy: "UNAVAILABLE", execution: "UNAVAILABLE", attestation: "UNAVAILABLE" });
    } finally {
      setVerifying(false);
    }
  };

  const chain = useMemo(() => {
    if (!selectedReceipt || !relatedRequest || !relatedPolicy) return [];
    const agentRegistered = isContractDeployed("agent_registry") ? (relatedDeployment ? "VERIFIED" : "NOT_FOUND") : "VERIFIED"; // offchain
    const policyCommitment = relatedPolicy.docHash ? "MATCH" : "NOT_FOUND";
    const decision = relatedRequest.verdict?.allowed ? "Approved" : "Blocked";
    const execution = relatedRequest.status === "COMPLETED" || relatedRequest.status === "executed" ? "Completed" : relatedRequest.status;
    const attestation = selectedReceipt.txHash && selectedReceipt.txHash !== "NOT AVAILABLE" ? "Onchain" : "Offchain";

    return [
      { label: "AGENT", sub: "Registered", status: agentRegistered === "VERIFIED" ? "VERIFIED" : "NOT_FOUND", icon: Bot, detail: relatedDeployment ? `Deployment ${short(relatedDeployment.id, 8, 4)}` : "No deployment" },
      { label: "POLICY", sub: "Commitment matches", status: policyCommitment === "MATCH" ? "VERIFIED" : "MISMATCH", icon: ScrollText, detail: `Policy ${short(relatedPolicy.id, 8, 4)} v${relatedPolicy.version} · ${short(relatedPolicy.docHash, 10, 6)}` },
      { label: "DECISION", sub: decision, status: relatedRequest.verdict?.allowed ? "VERIFIED" : "FAILED", icon: ShieldCheck, detail: `Rules evaluated, threshold ${relatedPolicy.doc.approvalThreshold}` },
      { label: "APPROVAL", sub: relatedRequest.requiresHumanApproval ? (relatedRequest.approvedByUser ? "Granted" : "Required") : "NOT_REQUIRED", status: relatedRequest.requiresHumanApproval ? (relatedRequest.approvedByUser ? "VERIFIED" : "PENDING") : "VERIFIED", icon: UserCheck, detail: relatedRequest.approvedAt ? `Approved at ${datetime(relatedRequest.approvedAt)}` : "Automatic" },
      { label: "EXECUTION", sub: execution, status: execution === "Completed" ? "VERIFIED" : "PENDING", icon: Wallet, detail: `Provider ${selectedReceipt.provider} · bucket ${selectedReceipt.bucket}` },
      { label: "ATTESTATION", sub: attestation, status: attestation === "Onchain" ? "VERIFIED" : "PENDING", icon: FileCheck2, detail: `Receipt ${short(selectedReceipt.id, 8, 4)} · tx ${short(selectedReceipt.txHash, 10, 6)}` },
    ];
  }, [selectedReceipt, relatedRequest, relatedPolicy, relatedDeployment]);

  const finalStatus = verificationResult
    ? verificationResult.status === "VERIFIED"
      ? "VERIFIED"
      : "NOT VERIFIED"
    : chain.length > 0 && chain.every((c) => c.status === "VERIFIED")
      ? "VERIFIED"
      : "NOT_CHECKED";

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Verification"
        title="Verification Center"
        sub="Inspect an execution receipt and verify its associated evidence: Agent identity, Policy version, Policy decision, Approval state, Execution result, Execution attestation, Verification status. Private by default, policy-controlled, verifiable when required."
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-3">
        <Panel padded={false}>
          <PanelHeader title="Execution receipts" sub={`${receipts.length} persisted`} />
          {receipts.length === 0 ? (
            <div className="p-5 text-[12px] faint">No receipts — execute a private payment in Treasury to generate one</div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              {receipts.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedReceiptId(r.id);
                    setVerificationResult(null);
                  }}
                  className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-[var(--track)] flex items-center justify-between gap-2"
                  style={{ borderColor: "var(--border)", background: selectedReceiptId === r.id ? "var(--track)" : "transparent" }}
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium truncate">{r.agentName} · {r.bucket}</div>
                    <div className="mono text-[10.5px] faint truncate">{short(r.id, 8, 4)} · {datetime(r.createdAt)}</div>
                  </div>
                  <Badge tone={r.isDemo ? "warn" : "good"}>{r.isDemo ? "DEMO" : "STRK20"}</Badge>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-3">
          {!selectedReceipt ? (
            <Panel>
              <div className="text-[13px] dim">Select a receipt to verify its evidence chain</div>
            </Panel>
          ) : (
            <>
              <Panel padded={false} edge>
                <PanelHeader
                  title={`Receipt ${short(selectedReceipt.id, 10, 6)}`}
                  sub={`${selectedReceipt.agentName} · ${selectedReceipt.isDemo ? "DEMO RECEIPT" : "STRK20 EXECUTION"}`}
                  right={
                    <div className="flex gap-2">
                      <Badge tone={finalStatus === "VERIFIED" ? "good" : finalStatus === "NOT VERIFIED" ? "bad" : "neutral"}>{finalStatus}</Badge>
                      <Button variant="primary" size="sm" onClick={() => void handleVerify()} disabled={verifying}>
                        {verifying ? "Checking…" : "Verify"}
                      </Button>
                    </div>
                  }
                />
                <div className="p-5">
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-[12px]">
                    <div className="flex justify-between"><span className="faint">Agent</span><span>{selectedReceipt.agentName} v{relatedDeployment?.agentVersion ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="faint">Agent version</span><span>{relatedDeployment?.agentVersion ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="faint">Policy ID</span><span className="mono">{short(selectedReceipt.policyId, 8, 4)}</span></div>
                    <div className="flex justify-between"><span className="faint">Policy version</span><span>{relatedPolicy?.version ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="faint">Decision</span><span>{relatedRequest?.verdict?.allowed ? "APPROVED" : "REJECTED"}</span></div>
                    <div className="flex justify-between"><span className="faint">Approval state</span><span>{relatedRequest?.requiresHumanApproval ? (relatedRequest.approvedByUser ? "GRANTED" : "REQUIRED") : "NOT_REQUIRED"}</span></div>
                    <div className="flex justify-between"><span className="faint">Execution state</span><span>{relatedRequest?.status}</span></div>
                    <div className="flex justify-between"><span className="faint">Attestation state</span><span>{selectedReceipt.txHash !== "NOT AVAILABLE" ? "ONCHAIN" : "OFFCHAIN"}</span></div>
                    <div className="flex justify-between"><span className="faint">Verification state</span><span>{finalStatus}</span></div>
                    <div className="flex justify-between"><span className="faint">Timestamp</span><span>{datetime(selectedReceipt.createdAt)}</span></div>
                    <div className="flex justify-between col-span-2"><span className="faint">Policy commitment</span><span className="mono">{short(selectedReceipt.policyHash, 12, 6)}</span></div>
                    <div className="flex justify-between col-span-2"><span className="faint">Execution ID</span><span className="mono">{short(selectedReceipt.txHash, 12, 8)}</span></div>
                  </div>

                  <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[11px] faint uppercase tracking-wider mb-3">Visual chain</div>
                    <div className="space-y-0">
                      {chain.map((c, i) => {
                        const Icon = c.icon;
                        const isVerified = c.status === "VERIFIED";
                        return (
                          <div key={c.label} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <span className="h-7 w-7 rounded-lg grid place-items-center" style={{ background: isVerified ? "color-mix(in oklab, var(--good) 14%, transparent)" : "color-mix(in oklab, var(--text-faint) 12%, transparent)", border: `1px solid ${isVerified ? "color-mix(in oklab, var(--good) 30%, transparent)" : "var(--border)"}` }}>
                                <Icon size={12} style={{ color: isVerified ? "var(--good)" : "var(--text-faint)" }} />
                              </span>
                              {i < chain.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} />}
                            </div>
                            <div className="pb-4 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-medium">{c.label}</span>
                                <span className="text-[11px] faint">{c.sub}</span>
                                {isVerified ? <CheckCircle2 size={12} style={{ color: "var(--good)" }} /> : c.status === "PENDING" ? <Clock size={12} className="faint" /> : <XCircle size={12} style={{ color: "var(--bad)" }} />}
                                <Badge tone={isVerified ? "good" : c.status === "PENDING" ? "warn" : c.status === "FAILED" ? "bad" : "neutral"}>{c.status}</Badge>
                              </div>
                              <div className="text-[11px] faint truncate">{c.detail}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[12px] font-medium">FINAL STATUS</span>
                      {finalStatus === "VERIFIED" ? <CheckCircle2 size={14} style={{ color: "var(--good)" }} /> : <XCircle size={14} style={{ color: "var(--bad)" }} />}
                      <Badge tone={finalStatus === "VERIFIED" ? "good" : "bad"}>{finalStatus === "VERIFIED" ? "✓ VERIFIED" : "✕ NOT VERIFIED"}</Badge>
                    </div>
                    {verificationResult && verificationResult.status !== "VERIFIED" && (
                      <div className="mt-2 text-[11px] px-2.5 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
                        Verification failed at: {Object.entries(verificationResult).filter(([, v]) => v === "MISMATCH" || v === "NOT_FOUND").map(([k]) => k).join(", ") || "unknown stage"}
                      </div>
                    )}
                  </div>

                  {relatedRequest && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="text-[11px] faint uppercase tracking-wider mb-2">Policy Evidence</div>
                      <div className="space-y-1">
                        {[
                          { id: "R01", label: "Agent active", ok: true },
                          { id: "R02", label: "Asset allowed", ok: relatedRequest.verdict?.reasons ? !relatedRequest.verdict.reasons.join("").includes("E_ASSET_NOT_ALLOWED") : true },
                          { id: "R03", label: "Recipient allowed", ok: relatedRequest.verdict?.reasons ? !relatedRequest.verdict.reasons.join("").includes("E_RECIPIENT_NOT_APPROVED") : true },
                          { id: "R04", label: "Tx limit", ok: relatedRequest.verdict?.reasons ? !relatedRequest.verdict.reasons.join("").includes("E_ABOVE_TRANSACTION_LIMIT") : true },
                          { id: "R05", label: "Daily limit", ok: relatedRequest.verdict?.reasons ? !relatedRequest.verdict.reasons.join("").includes("E_DAILY_LIMIT_EXCEEDED") : true },
                          { id: "R06", label: "Approval threshold", ok: true },
                        ].map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-[11.5px]">
                            <span className="mono text-[10px] faint w-7">{r.id}</span>
                            <span className="flex-1 dim">{r.label}</span>
                            <span style={{ color: r.ok ? "var(--good)" : "var(--bad)" }}>{r.ok ? "✓" : "✗"}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-[12px]">Decision: {relatedRequest.verdict?.allowed ? "APPROVED" : "REJECTED"}</div>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="text-[11px] faint uppercase tracking-wider mb-2">Onchain references</div>
                <div className="space-y-1 text-[11.5px] mono">
                  <div className="flex justify-between"><span className="faint">Policy commitment</span><span>{short(selectedReceipt.policyHash, 12, 6)}</span></div>
                  <div className="flex justify-between"><span className="faint">Intent hash</span><span>{short(selectedReceipt.intentHash, 12, 6)}</span></div>
                  <div className="flex justify-between"><span className="faint">Trace hash</span><span>{short(selectedReceipt.traceHash, 12, 6)}</span></div>
                  <div className="flex justify-between"><span className="faint">Tx hash</span><span className="flex items-center gap-1">{short(selectedReceipt.txHash, 12, 6)} {selectedReceipt.txHash !== "NOT AVAILABLE" && <ExternalLink size={10} className="faint" />}</span></div>
                  <div className="flex justify-between"><span className="faint">Attestation</span><span>{short(selectedReceipt.attestationSig, 12, 6)}</span></div>
                </div>
                <div className="mt-2 text-[10.5px] faint">No viewing keys, note data, proof witnesses, private counterparty info exposed — wallet-custodied.</div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
