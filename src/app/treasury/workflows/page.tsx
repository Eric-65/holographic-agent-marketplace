import { useState } from "react";
import { Check, ChevronRight, GitBranch, Plus, X } from "lucide-react";
import { useStore } from "../../../lib/store";
import { getStepsByRun } from "../../../lib/api/workflows";
import { getMessagesByRun } from "../../../lib/api/agentMessages";
import { WORKFLOW_STEP_LABEL } from "../../../lib/workflow/model";
import { short } from "../../../lib/hash";
import { Badge, Button, Empty, Panel, PanelHeader, SectionTitle } from "../../../components/ui/primitives";
import TreasuryTabs from "../../../components/treasury/TreasuryTabs";
import ExecutionRequestCard, { formatMinor } from "../../../components/treasury/ExecutionRequestCard";

const USDC = 1_000_000;

export default function WorkflowsPage() {
  const {
    dbUser,
    deployments,
    budgets,
    workflowDefinitions,
    workflowRuns,
    createVendorWorkflow,
    startVendorWorkflowRun,
    approveWorkflowRunStep,
    rejectWorkflowRunAction,
  } = useStore();

  const deployment = deployments.find((d) => d.status === "ACTIVE" || d.status === "active");
  const [showForm, setShowForm] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("Vendor invoice #1042");
  const [budgetIds, setBudgetIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!dbUser) return <Empty title="Connect your wallet" hint="Workflows require a connected wallet" />;

  const def = workflowDefinitions[0];

  const handleEnsureWorkflow = () => createVendorWorkflow("Vendor Payment Workflow");

  const handleStart = () => {
    if (!deployment) return;
    setError(null);
    try {
      let workflowId = def?.id;
      if (!workflowId) workflowId = createVendorWorkflow("Vendor Payment Workflow").id;
      startVendorWorkflowRun(workflowId, deployment.id, { recipient, asset, amount: Math.round(Number(amount) * USDC), reason }, budgetIds);
      setShowForm(false);
      setRecipient("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Treasury automation"
        title="Multi-agent workflows"
        sub="Payment Agent proposes → Compliance Agent checks → Policy Engine evaluates → Treasury Agent executes → ExecutionAttestor anchors. A failed or gated step always stops downstream execution."
        right={
          !deployment ? undefined : (
            <Button variant="primary" size="sm" onClick={() => setShowForm((s) => !s)}>
              {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "Cancel" : "Start vendor payment"}
            </Button>
          )
        }
      />

      <TreasuryTabs />

      {!deployment && <Empty title="No active agent deployment" hint="Deploy the Treasury Agent from the marketplace before running workflows" />}

      {deployment && workflowDefinitions.length === 0 && !showForm && (
        <Panel edge>
          <div className="flex items-center gap-3">
            <GitBranch size={16} className="faint" />
            <div className="flex-1">
              <div className="text-[13px] font-medium">No workflow defined yet</div>
              <div className="text-[11.5px] faint">Create the built-in Vendor Payment Workflow template to get started</div>
            </div>
            <Button variant="outline" size="sm" onClick={handleEnsureWorkflow}>
              Create template
            </Button>
          </div>
        </Panel>
      )}

      {showForm && deployment && (
        <Panel edge>
          <div className="font-display text-[14px] font-semibold mb-4">Start a vendor payment workflow run</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Recipient</label>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] mono outline-none" />
            </div>
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Asset</label>
              <select value={asset} onChange={(e) => setAsset(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none">
                <option>USDC</option>
                <option>STRK</option>
                <option>ETH</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Amount ({asset})</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
            </div>
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
            </div>
          </div>

          {budgets.length > 0 && (
            <div className="mt-4">
              <label className="text-[11px] faint uppercase tracking-wider">Applicable budgets — every one checked must allow this payment</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {budgets.map((b) => {
                  const on = budgetIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBudgetIds((ids) => (on ? ids.filter((id) => id !== b.id) : [...ids, b.id]))}
                      className="px-2.5 py-1 rounded-full text-[11px] transition-colors"
                      style={{
                        border: `1px solid ${on ? "var(--accent-3)" : "var(--border)"}`,
                        color: on ? "var(--accent-3)" : "var(--text-dim)",
                        background: on ? "color-mix(in oklab, var(--accent-3) 12%, transparent)" : "transparent",
                      }}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="text-[11.5px] mt-3" style={{ color: "var(--bad)" }}>{error}</div>}
          <Button variant="primary" size="sm" className="mt-4" onClick={handleStart} disabled={!recipient || !amount}>
            Start run
          </Button>
        </Panel>
      )}

      <Panel padded={false} edge>
        <PanelHeader title="Workflow runs" sub={`${workflowRuns.length} total`} />
        {workflowRuns.length === 0 ? (
          <Empty title="No runs yet" hint="Start a vendor payment above to see the step-by-step flow" />
        ) : (
          <div>
            {workflowRuns.map((run) => {
              const steps = getStepsByRun(run.id);
              const messages = getMessagesByRun(run.id);
              const isOpen = expanded === run.id;
              return (
                <div key={run.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <button onClick={() => setExpanded(isOpen ? null : run.id)} className="w-full text-left p-4 flex items-center gap-3 hover:bg-[var(--track)] transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{run.intent.reason}</div>
                      <div className="mono text-[11px] faint">
                        {formatMinor(run.intent.amount)} {run.intent.asset} → {short(run.intent.recipient, 8, 4)}
                      </div>
                    </div>
                    <RunStatusBadge status={run.status} />
                    <ChevronRight size={13} className="faint transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="space-y-1.5">
                        {steps.map((step) => (
                          <div key={step.id} className="flex flex-wrap items-start gap-x-2.5 gap-y-0.5 text-[12px]">
                            <div className="flex items-center gap-2.5 w-full sm:w-[150px] shrink-0">
                              <StepDot status={step.status} />
                              <span className="faint">{WORKFLOW_STEP_LABEL[step.type]}</span>
                            </div>
                            <span className="mono text-[11px] min-w-0 break-words pl-[17px] sm:pl-0" style={{ color: step.status === "FAILED" ? "var(--bad)" : undefined }}>
                              {step.detail}
                            </span>
                          </div>
                        ))}
                      </div>

                      {run.status === "AWAITING_APPROVAL" && (
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--track)" }}>
                          <span className="text-[11.5px] dim flex-1">{steps[steps.length - 1]?.detail ?? "Approval required"}</span>
                          <Button variant="primary" size="sm" onClick={() => approveWorkflowRunStep(run.id)}>
                            <Check size={11} /> Approve & continue
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => rejectWorkflowRunAction(run.id)}>
                            <X size={11} />
                          </Button>
                        </div>
                      )}

                      {run.executionRequestId && (run.status === "RUNNING" || run.status === "AWAITING_APPROVAL") && (
                        <ExecutionRequestCard requestId={run.executionRequestId} label="Treasury execution" />
                      )}

                      {run.status === "FAILED" && run.failureReason && (
                        <div className="text-[11px] mono px-3 py-2 rounded-lg" style={{ background: "color-mix(in oklab, var(--bad) 8%, transparent)", color: "var(--bad)" }}>
                          {run.failureReason}
                        </div>
                      )}

                      {messages.length > 0 && (
                        <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="text-[10.5px] faint uppercase tracking-wider mb-1.5">Agent messages</div>
                          <div className="space-y-1">
                            {messages.map((m) => (
                              <div key={m.id} className="mono text-[10.5px] faint">
                                #{m.nonce} {m.senderAgent} → {m.receiverAgent}: {m.messageType} {m.payload.bucket ? `(${m.payload.bucket})` : ""}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const tone = status === "COMPLETED" ? "good" : status === "FAILED" || status === "CANCELLED" ? "bad" : status === "AWAITING_APPROVAL" ? "warn" : "cyan";
  return <Badge tone={tone as any}>{status.replace(/_/g, " ")}</Badge>;
}

function StepDot({ status }: { status: string }) {
  const color = status === "PASSED" ? "var(--good)" : status === "FAILED" ? "var(--bad)" : status === "AWAITING_APPROVAL" ? "var(--warn)" : "var(--text-faint)";
  return <span className="h-[7px] w-[7px] rounded-full shrink-0" style={{ background: color }} />;
}
