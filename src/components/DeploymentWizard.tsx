import { useState } from "react";
import { useStore } from "../lib/store";
import { Button, Panel } from "./ui/primitives";
import { Check, AlertTriangle } from "lucide-react";
import type { DbAgent } from "../lib/db/schema";
import type { AgentPolicy } from "../lib/policy/model";
import { makePolicy } from "../lib/policy/model";
import PolicyEditor from "./PolicyEditor";
import RecipientManager from "./RecipientManager";
import type { Agent } from "../lib/types";

type Step = "review" | "capabilities" | "policy" | "recipients" | "authority" | "risk" | "deploy";

export default function DeploymentWizard({ agent, dbAgent, onClose, onDeployed }: { agent: Agent; dbAgent: DbAgent; onClose: () => void; onDeployed: () => void }) {
  const { dbUser, dbWallet, deployAgent, dbPolicies, wallet } = useStore();
  const [step, setStep] = useState<Step>("review");
  const [policy, setPolicy] = useState<AgentPolicy>(() =>
    makePolicy({
      agentId: agent.id,
      owner: dbUser?.address ?? "0x0",
      allowedAssets: agent.assets,
      maximumTransactionAmount: 500 * 1_000_000,
      dailySpendingLimit: 2000 * 1_000_000,
      approvedRecipients: [],
      approvalThreshold: 500 * 1_000_000,
      allowedActions: ["transfer"],
      paused: false,
    }),
  );
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const steps: { key: Step; label: string }[] = [
    { key: "review", label: "Review Agent" },
    { key: "capabilities", label: "Capabilities" },
    { key: "policy", label: "Configure Policy" },
    { key: "recipients", label: "Recipients" },
    { key: "authority", label: "Review Authority" },
    { key: "risk", label: "Review Risk" },
    { key: "deploy", label: "Deploy & Activate" },
  ];

  const currentPolicy = dbPolicies.find((p) => p.agentId === agent.id && (p.status === "ACTIVE" || p.status === "active"));

  const handleDeploy = async () => {
    if (!confirmed) {
      setError("You must explicitly confirm activation");
      return;
    }
    if (!dbUser || !dbWallet) {
      setError("Wallet not connected");
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      deployAgent(agent.id, policy, `${agent.name} policy v1`);
      onDeployed();
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 overlay" onClick={onClose}>
      <div className="w-full max-w-[800px] max-h-[90vh] overflow-y-auto rounded-2xl modal-surface border" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 modal-surface p-5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="mono text-[10px] faint uppercase">Deployment Wizard</div>
            <div className="font-display text-[18px] font-semibold">{agent.name} — {dbAgent.deploymentStatus}</div>
            <div className="text-[11px] faint">Flow: Select Agent → Review Agent → Review Capabilities → Configure Policy → Configure Recipients → Review Authority → Connect Wallet → Review Risk → Deploy → Activate</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="p-5">
          <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-thin">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1 shrink-0">
                <span className="h-6 w-6 rounded-full grid place-items-center text-[10px] mono" style={{ background: step === s.key ? "var(--accent)" : "var(--track)", color: step === s.key ? "white" : "var(--text-faint)" }}>
                  {i + 1}
                </span>
                <span className={`text-[11px] ${step === s.key ? "font-medium" : "faint"}`}>{s.label}</span>
                {i < steps.length - 1 && <span className="w-4 h-px mx-1" style={{ background: "var(--border)" }} />}
              </div>
            ))}
          </div>

          {step === "review" && (
            <Panel>
              <div className="font-display text-[14px] font-semibold mb-2">Overview</div>
              <div className="text-[13px] dim leading-relaxed">{dbAgent.description}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                <div><span className="faint">Creator:</span> {dbAgent.creator}</div>
                <div><span className="faint">Version:</span> {dbAgent.version}</div>
                <div><span className="faint">Category:</span> {dbAgent.category}</div>
                <div><span className="faint">Risk:</span> {dbAgent.riskLevel} {dbAgent.riskLevel !== "LOW" ? "(not audited as low unless reviewed)" : ""}</div>
              </div>
              <Button variant="primary" size="sm" className="mt-4" onClick={() => setStep("capabilities")}>Next: Capabilities</Button>
            </Panel>
          )}

          {step === "capabilities" && (
            <Panel>
              <div className="font-display text-[14px] font-semibold mb-3">Capabilities (structured)</div>
              <div className="space-y-2">
                {dbAgent.capabilities.map((cap) => (
                  <div key={cap} className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg" style={{ background: "var(--track)" }}>
                    <Check size={12} style={{ color: "var(--good)" }} />
                    <span className="mono">{cap}</span>
                    <span className="faint text-[11px]">— {capabilityDescription(cap)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] faint">Deployment system validates capabilities before activation. Agent must not request operation outside registered capabilities.</div>
              <div className="flex gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("review")}>Back</Button>
                <Button variant="primary" size="sm" onClick={() => setStep("policy")}>Next: Policy</Button>
              </div>
            </Panel>
          )}

          {step === "policy" && (
            <div className="space-y-3">
              <Panel>
                <div className="font-display text-[14px] font-semibold mb-2">Permission Model</div>
                <div className="grid sm:grid-cols-2 gap-4 text-[11.5px]">
                  <div>
                    <div className="font-medium mb-1">CAPABILITY (what agent technically supports)</div>
                    {dbAgent.capabilities.map((c) => (
                      <div key={c} className="dim">· {c}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-medium mb-1">PERMISSION (what deployment is allowed to do)</div>
                    <div className="dim">✓ USDC</div>
                    <div className="dim">✓ Approved recipients</div>
                    <div className="dim">✓ $500 maximum</div>
                    <div style={{ color: "var(--bad)" }}>✕ Unapproved recipients</div>
                    <div style={{ color: "var(--bad)" }}>✕ Policy modification</div>
                  </div>
                </div>
                <div className="text-[10.5px] faint mt-2">This distinction is central to Holographic.</div>
              </Panel>

              <PolicyEditor
                agent={agent}
                value={{
                  version: 1,
                  agentId: agent.id,
                  allowedActions: ["private_transfer"] as any,
                  assetScope: ["USDC"] as any,
                  venueAllowlist: ["STRK20 Pool"] as any,
                  perActionCapUsd: policy.maximumTransactionAmount / 1_000_000,
                  dailyCapUsd: policy.dailySpendingLimit / 1_000_000,
                  cooldownSeconds: 30,
                  maxSlippageBps: 50,
                  confirmAboveUsd: policy.approvalThreshold / 1_000_000,
                  counterpartyDenyList: [],
                  requireDisclosureReceipt: false,
                  killSwitch: policy.paused,
                }}
                onChange={(doc) => {
                  setPolicy(
                    makePolicy({
                      agentId: doc.agentId,
                      owner: policy.owner,
                      allowedAssets: doc.assetScope,
                      maximumTransactionAmount: doc.perActionCapUsd * 1_000_000,
                      dailySpendingLimit: doc.dailyCapUsd * 1_000_000,
                      approvedRecipients: policy.approvedRecipients,
                      approvalThreshold: doc.confirmAboveUsd * 1_000_000,
                      allowedActions: ["transfer"],
                      paused: doc.killSwitch,
                    }),
                  );
                }}
                dirty={false}
              />

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("capabilities")}>Back</Button>
                <Button variant="primary" size="sm" onClick={() => setStep("recipients")}>Next: Recipients</Button>
              </div>
            </div>
          )}

          {step === "recipients" && (
            <div className="space-y-3">
              <Panel>
                <div className="text-[12px] dim">Configure approved recipients for this deployment. Policy engine will reject transfers to inactive or unapproved recipients.</div>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setStep("authority")}>Skip to Authority Review</Button>
              </Panel>
              {currentPolicy ? (
                <RecipientManager policyId={currentPolicy.id} policyLabel={currentPolicy.label} />
              ) : (
                <Panel>
                  <div className="text-[12px] faint">Deploy agent first to get a policy ID, then add recipients. For this wizard, recipients can be added after deployment in Treasury page.</div>
                </Panel>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("policy")}>Back</Button>
                <Button variant="primary" size="sm" onClick={() => setStep("authority")}>Next: Authority</Button>
              </div>
            </div>
          )}

          {step === "authority" && (
            <Panel>
              <div className="font-display text-[15px] font-semibold mb-4">Deployment Review — Final authority summary</div>

              <div className="space-y-4 text-[12.5px]">
                <div>
                  <div className="font-medium">AGENT:</div>
                  <div className="dim">{agent.name} v{dbAgent.version} · {dbAgent.creator}</div>
                </div>

                <div>
                  <div className="font-medium">CAN:</div>
                  <div className="dim">✓ Private USDC transfers</div>
                  <div className="dim">✓ Approved-recipient payments</div>
                  <div className="dim">✓ Policy evaluation</div>
                  <div className="dim">✓ Human approval requests</div>
                </div>

                <div>
                  <div className="font-medium">LIMITS:</div>
                  <div className="dim">${policy.maximumTransactionAmount / 1_000_000} / transaction</div>
                  <div className="dim">${policy.dailySpendingLimit / 1_000_000} / day</div>
                  <div className="dim">{policy.allowedAssets.join(", ")}</div>
                  <div className="dim">{policy.approvedRecipients.length} approved recipients</div>
                </div>

                <div>
                  <div className="font-medium">CANNOT:</div>
                  <div style={{ color: "var(--bad)" }}>✕ Modify policy</div>
                  <div style={{ color: "var(--bad)" }}>✕ Add recipients</div>
                  <div style={{ color: "var(--bad)" }}>✕ Bypass policy</div>
                  <div style={{ color: "var(--bad)" }}>✕ Access unrestricted wallet authority</div>
                </div>

                <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[11px] faint uppercase mb-1">Wallet</div>
                  <div className="mono text-[11px]">{dbWallet?.address ? short(dbWallet.address, 10, 6) : "Not connected"} · {dbWallet?.adapterKind ?? "—"} · {wallet.status}</div>
                  {wallet.status !== "connected" && <div className="text-[11px] mt-1" style={{ color: "var(--bad)" }}>Connect wallet required — disconnected</div>}
                </div>

                <label className="flex items-start gap-2 mt-4 p-3 rounded-lg" style={{ background: "var(--track)", border: "1px solid var(--border)" }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
                  <span className="text-[12px]">I explicitly confirm activation — I understand this agent can only perform private transfers within policy limits, cannot modify policy or add recipients, and requires wallet authorization for each execution.</span>
                </label>

                {error && <div className="text-[11px] px-2.5 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>{error}</div>}
              </div>

              <div className="flex gap-2 mt-5">
                <Button variant="ghost" size="sm" onClick={() => setStep("recipients")}>Back</Button>
                <Button variant="outline" size="sm" onClick={() => setStep("risk")}>Next: Risk</Button>
                <Button variant="primary" size="sm" onClick={() => setStep("deploy")} disabled={!confirmed}>
                  Review & Deploy
                </Button>
              </div>
            </Panel>
          )}

          {step === "risk" && (
            <Panel>
              <div className="font-display text-[14px] font-semibold mb-2">Review Risk</div>
              <div className="text-[12px] dim space-y-2">
                <div>Risk Level: {dbAgent.riskLevel} — {dbAgent.riskLevel === "LOW" ? "Low risk, suitable for treasury operations" : dbAgent.riskLevel === "MEDIUM" ? "Medium risk, requires monitoring" : "High risk, aggressive strategy"}</div>
                <div>Do not claim risk level is audited unless there is actual risk review — {dbAgent.manifest?.verification.audited ? `Audited by ${dbAgent.manifest.verification.auditedBy}` : "Not audited, risk classification is operational"}</div>
                <div>Privacy Support: {dbAgent.privacySupport ? "Yes — STRK20" : "No"}</div>
                <div>Verification: {dbAgent.verificationStatus}</div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("authority")}>Back</Button>
                <Button variant="primary" size="sm" onClick={() => setStep("deploy")}>Next: Deploy</Button>
              </div>
            </Panel>
          )}

          {step === "deploy" && (
            <Panel>
              <div className="font-display text-[14px] font-semibold mb-3">Deploy & Activate</div>
              <div className="space-y-3 text-[12px]">
                <div className="rounded-lg p-3" style={{ background: "var(--track)" }}>
                  <div className="faint text-[10px] uppercase">Deployment will persist</div>
                  <div className="mono mt-1">deployment ID, agent ID {agent.id}, agent version {dbAgent.version}, owner wallet {short(dbUser?.address ?? "", 8, 4)}, policy, permissions, status ACTIVE, createdAt, activatedAt</div>
                  <div className="text-[10.5px] faint mt-1">Historical state preserved, not overwritten</div>
                </div>

                {wallet.status !== "connected" && (
                  <div className="text-[11px] px-2.5 py-2 rounded flex items-center gap-2" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
                    <AlertTriangle size={12} /> Wallet disconnected — connect Ready or Demo Mode
                  </div>
                )}

                {error && <div className="text-[11px] px-2.5 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>{error}</div>}

                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => void handleDeploy()} disabled={deploying || !confirmed || wallet.status !== "connected"}>
                    {deploying ? "Deploying…" : "Deploy & Activate"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                </div>

                <div className="text-[10.5px] faint">Do not display ACTIVE unless deployment actually created successfully — backend validates ownership, wallet must be connected, no fake success.</div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function capabilityDescription(cap: string): string {
  switch (cap) {
    case "PRIVATE_TRANSFER":
      return "Private transfers via STRK20";
    case "PRIVATE_DISTRIBUTION":
      return "Multi-recipient private distributions";
    case "POLICY_ENFORCEMENT":
      return "Deterministic policy enforcement";
    case "HUMAN_APPROVAL":
      return "Human approval threshold";
    case "EXECUTION_ATTESTATION":
      return "Onchain attestation of execution";
    case "AUDIT_SUPPORT":
      return "Compliance evidence and audit reports";
    default:
      return "Capability";
  }
}

function short(addr: string, head = 6, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
