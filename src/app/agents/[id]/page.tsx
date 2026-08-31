import { useMemo, useState } from "react";
import { ArrowLeft, Ban, Fingerprint, Pause, Play, Sparkles, Rocket } from "lucide-react";
import { Link, useRoute } from "../../router";
import { useStore } from "../../../lib/store";
import { simulateIntent } from "../../../lib/mock/intents";
import { evaluatePolicy } from "../../../lib/policy/engine";
import { short } from "../../../lib/hash";
import { ACTION_LABEL, datetime, num, usd } from "../../../lib/format";
import AgentStatus from "../../../components/AgentStatus";
import PolicyEditor from "../../../components/PolicyEditor";
import ApprovalDialog from "../../../components/ApprovalDialog";
import ExecutionReceipt from "../../../components/ExecutionReceipt";
import { Badge, Button, Empty, KeyValue, Panel, PanelHeader, Stat } from "../../../components/ui/primitives";
import type { ActionIntent, PolicyDocument } from "../../../lib/types";
import AgentWorkflow from "../../../components/AgentWorkflow";
import OnchainStatus from "../../../components/OnchainStatus";
import DeploymentWizard from "../../../components/DeploymentWizard";

const TREASURY_AUTOMATION_CAPS = [
  { id: "SCHEDULED_PAYMENTS", label: "Scheduled payments" },
  { id: "BUDGETS", label: "Budgets" },
  { id: "BATCH_PAYMENTS", label: "Batch payments" },
  { id: "WORKFLOW_PARTICIPATION", label: "Workflow participation" },
];

export default function AgentDetailPage() {
  const { params } = useRoute();
  const {
    agents,
    dbAgents,
    receipts,
    policyFor,
    savePolicy,
    bindingState,
    addReceipt,
    recordExecution,
    pauseAgentDeployment,
    resumeAgentDeployment,
    decommissionAgentDeployment,
    wallet,
    dbUser,
    dbWallet,
    deployments,
    dbPolicies,
    refreshFromDb,
  } = useStore();

  const agent = agents.find((a) => a.id === params.id);
  const saved = agent ? policyFor(agent.id) : null;
  const [draft, setDraft] = useState<PolicyDocument | null>(null);
  const [intent, setIntent] = useState<ActionIntent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const policy = draft ?? saved;
  const dirty = useMemo(
    () => (draft && saved ? JSON.stringify(draft) !== JSON.stringify(saved) : false),
    [draft, saved],
  );

  const agentReceipts = useMemo(
    () => receipts.filter((r) => r.agentId === params.id).slice(0, 12),
    [receipts, params.id],
  );

  const deployment = useMemo(
    () => deployments.find((d) => d.agentId === params.id) ?? null,
    [deployments, params.id],
  );

  const dbPolicy = useMemo(
    () => (deployment?.policyId ? dbPolicies.find((p) => p.id === deployment.policyId) ?? null : null),
    [deployment, dbPolicies],
  );

  if (!agent || !policy) {
    return (
      <div className="py-20 text-center">
        <div className="text-[14px] dim">Agent not found in the registry.</div>
        <Link href="/agents" className="text-[12.5px] mt-3 inline-block" style={{ color: "var(--accent-3)" }}>
          ← Back to marketplace
        </Link>
      </div>
    );
  }

  const state = bindingState[agent.id] ?? {
    dailySpentUsd: 0,
    lastActionAt: Date.now() - 3_600_000,
    paused: false,
  };

  const dryRun = intent ? evaluatePolicy(intent, policy, state) : null;

  const propose = () => {
    setIntent(simulateIntent(agent));
    setDialogOpen(true);
  };

  const handleDeploy = () => {
    if (!dbUser || !dbWallet) {
      setDeployError("Wallet not connected — cannot deploy agent");
      return;
    }
    setDeployError(null);
    setWizardOpen(true);
  };

  return (
    <div className="space-y-6">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-[12.5px] dim hover:text-[var(--text)]">
        <ArrowLeft size={13} /> Marketplace
      </Link>

      <div className="surface rounded-xl p-6 holo-edge">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <span
              className="h-12 w-12 rounded-xl grid place-items-center shrink-0 font-display text-[19px] font-semibold"
              style={{
                background: `color-mix(in oklab, ${agent.accent} 14%, transparent)`,
                border: `1px solid color-mix(in oklab, ${agent.accent} 34%, transparent)`,
                color: agent.accent,
              }}
            >
              {agent.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[22px] font-semibold tracking-tight">{agent.name}</h1>
                <Badge tone="neutral">v{agent.version}</Badge>
                <AgentStatus state={agent.runtime} />
                {deployment && <Badge tone="good">DEPLOYED · {deployment.status}</Badge>}
              </div>
              <div className="text-[12.5px] faint mt-1">
                {agent.publisher} · {agent.category} · {agent.priceLabel}
              </div>
              <p className="text-[13px] dim leading-relaxed mt-3 max-w-2xl">{agent.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {agent.actionSurface.map((a) => (
                  <span key={a} className="mono text-[10.5px] px-2 py-[3px] rounded chip faint">
                    {ACTION_LABEL[a]}
                  </span>
                ))}
              </div>

              {deployment && dbPolicy && (
                <div className="mt-4 rounded-lg p-3" style={{ background: "var(--track)" }}>
                  <div className="text-[11px] faint uppercase tracking-wider">Deployment (persisted)</div>
                  <div className="mono text-[11px] mt-1 space-y-0.5">
                    <div>Agent: {deployment.agentId} v{deployment.agentVersion}</div>
                    <div>Owner: {short(dbUser?.address ?? "", 10, 6)}</div>
                    <div>Wallet: {short(dbWallet?.address ?? "", 10, 6)} · {dbWallet?.adapterKind}</div>
                    <div>Status: {deployment.status}</div>
                    <div>Policy: {short(deployment.policyId ?? "", 8, 4)} · {dbPolicy.label}</div>
                    <div>Created: {new Date(deployment.createdAt).toLocaleString()}</div>
                    <div>Version: {dbPolicy.version}</div>
                  </div>
                </div>
              )}

              {deployError && (
                <div className="mt-3 text-[11px] px-2.5 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
                  {deployError}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!deployment ? (
              <Button variant="primary" size="sm" onClick={() => void handleDeploy()} disabled={wallet.status !== "connected"}>
                <Rocket size={13} /> Deploy Treasury Agent
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={propose} disabled={wallet.status !== "connected" || deployment.status === "PAUSED" || deployment.status === "paused" || deployment.status === "DISABLED" || deployment.status === "DECOMMISSIONED"}>
                <Sparkles size={13} /> Run agent cycle
              </Button>
            )}
            {deployment && (deployment.status === "PAUSED" || deployment.status === "paused") ? (
              <Button variant="outline" size="sm" onClick={() => { try { resumeAgentDeployment(deployment.id); } catch {} }}>
                <Play size={13} /> Resume
              </Button>
            ) : deployment ? (
              <Button variant="outline" size="sm" onClick={() => { try { pauseAgentDeployment(deployment.id); } catch {} }}>
                <Pause size={13} /> Pause
              </Button>
            ) : null}
            {deployment && (deployment.status === "ACTIVE" || deployment.status === "active") && (
              <Button variant="danger" size="sm" onClick={() => { try { decommissionAgentDeployment(deployment.id); } catch (e: any) { setDeployError(e.message); } }}>
                Decommission
              </Button>
            )}
            {deployment && (deployment.status === "PAUSED" || deployment.status === "paused") && (
              <div className="text-[11px] px-2 py-1 rounded" style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad)" }}>
                AGENT PAUSED — No new execution permitted
              </div>
            )}
            {deployment && (deployment.status === "DISABLED" || deployment.status === "DECOMMISSIONED") && (
              <div className="text-[11px] px-2 py-1 rounded" style={{ background: "color-mix(in oklab, var(--text-faint) 12%, transparent)", color: "var(--text-faint)" }}>
                AGENT DECOMMISSIONED — No new executions, historical preserved
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Stat label="Trust score" value={agent.metrics.trustScore} sub="receipt-derived" tone="good" />
        <Stat label="Executions" value={num(agent.metrics.executions, 0)} sub="lifetime" />
        <Stat label="Reject rate" value={`${agent.metrics.rejectRate}%`} sub="policy blocks" tone="bad" />
        <Stat label="p50 latency" value={`${agent.metrics.latencyP50Ms}ms`} sub="intent emission" tone="cyan" />
        <Stat label="Slippage drift" value={`${agent.metrics.slippageDriftBps} bps`} sub="realised vs predicted" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
        <div className="space-y-3">
          <PolicyEditor
            agent={agent}
            value={policy}
            onChange={setDraft}
            dirty={dirty}
            onSave={() => {
              if (draft) savePolicy(agent.id, draft);
              setDraft(null);
            }}
            onReset={() => setDraft(null)}
          />

          <Panel padded={false}>
            <PanelHeader title="Agent receipts" sub={`${agentReceipts.length} most recent for this binding`} />
            {agentReceipts.length === 0 ? (
              <Empty title="No receipts for this agent yet." hint="Run a cycle to produce one." />
            ) : (
              agentReceipts.map((r) => <ExecutionReceipt key={r.id} receipt={r} />)
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel>
            <div className="flex items-center gap-2 mb-3">
              <Fingerprint size={14} style={{ color: "var(--accent)" }} />
              <span className="font-display text-[14px] font-semibold tracking-tight">Registry record</span>
            </div>
            <KeyValue k="Agent ID" v={agent.id} />
            <KeyValue k="Manifest hash" v={short(agent.manifestHash, 10, 6)} />
            <KeyValue k="Publisher" v={short(agent.publisherAddress, 8, 6)} />
            <KeyValue k="Stake" v={`${num(agent.stakeStrk, 0)} STRK`} />
            <KeyValue k="Audit" v={agent.auditedBy ?? "unaudited"} />
            <KeyValue k="Venues" v={agent.venues.join(", ")} mono={false} />
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Treasury automation capabilities</div>
            <div className="space-y-1.5">
              {TREASURY_AUTOMATION_CAPS.map((cap) => {
                const dbAgent = dbAgents.find((a) => a.id === agent.id);
                const supported = !!dbAgent?.capabilities.includes(cap.id);
                return (
                  <div key={cap.id} className="flex items-center justify-between text-[11.5px]">
                    <span className="dim">{cap.label}</span>
                    <Badge tone={supported ? "good" : "neutral"}>{supported ? "supported" : "NOT YET SUPPORTED"}</Badge>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Permissions — capability vs permission</div>
            <div className="text-[11.5px] space-y-2">
              <div><span className="font-medium">CAPABILITY (what agent technically supports):</span><span className="dim"> {agent.actionSurface.join(", ")}</span></div>
              <div><span className="font-medium">PERMISSION (what deployment is allowed):</span></div>
              <div className="dim">✓ USDC</div>
              <div className="dim">✓ Approved recipients</div>
              <div className="dim">✓ $500 maximum</div>
              <div style={{ color: "var(--bad)" }}>✕ Unapproved recipients</div>
              <div style={{ color: "var(--bad)" }}>✕ Policy modification</div>
              <div className="text-[10.5px] faint mt-2">This distinction is central to Holographic — agent cannot request operation outside registered capabilities, permission validated before activation.</div>
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Binding counters</div>
            <KeyValue k="24h notional used" v={usd(state.dailySpentUsd)} />
            <KeyValue k="24h ceiling" v={usd(policy.dailyCapUsd)} />
            <KeyValue k="Last action" v={datetime(state.lastActionAt)} />
            <KeyValue k="Kill switch" v={policy.killSwitch ? "engaged" : "clear"} />
            <div className="mt-4">
              <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (state.dailySpentUsd / policy.dailyCapUsd) * 100)}%`,
                    background: "linear-gradient(90deg, var(--accent), var(--accent-3))",
                  }}
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-1">Dry-run verdict</div>
            <p className="text-[11.5px] faint mb-3">Browser evaluation uses the same engine build as production.</p>
            {dryRun ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <Badge tone={dryRun.outcome === "APPROVE" ? "good" : dryRun.outcome === "REJECT" ? "bad" : "warn"}>
                    {dryRun.outcome}
                  </Badge>
                  <span className="mono text-[10.5px] faint">{short(dryRun.traceHash, 8, 4)}</span>
                </div>
                <div className="space-y-1">
                  {dryRun.trace.slice(0, 12).map((r, i) => (
                    <div key={r.id + i} className="flex items-center gap-2">
                      <span className="mono text-[10px] faint w-7">{r.id}</span>
                      <span className="text-[11.5px] flex-1 truncate dim">{r.label}</span>
                      <span
                        className="mono text-[9.5px]"
                        style={{
                          color:
                            r.outcome === "pass" ? "var(--good)" : r.outcome === "fail" ? "var(--bad)" : r.outcome === "confirm" ? "var(--warn)" : "var(--text-faint)",
                        }}
                      >
                        {r.outcome}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-[12px] faint">
                <Ban size={13} /> No intent proposed yet.
              </div>
            )}
          </Panel>
          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">Onchain anchor status</div>
            <OnchainStatus agentId={agent.id} userAddress={dbUser?.address} />
          </Panel>
          <AgentWorkflow />
        </div>
      </div>

      <ApprovalDialog
        open={dialogOpen}
        agent={agent}
        intent={intent}
        policy={policy}
        bindingState={state}
        onClose={() => setDialogOpen(false)}
        onReceipt={addReceipt}
        onExecuted={recordExecution}
      />

      {wizardOpen && (
        <DeploymentWizard
          agent={agent}
          dbAgent={
            dbAgents.find((a) => a.id === agent.id) ?? {
              id: agent.id,
              name: agent.name,
              slug: agent.id,
              description: agent.description,
              creator: agent.publisher,
              creatorWallet: agent.publisherAddress,
              version: agent.version,
              category: agent.category.toUpperCase() as any,
              capabilities: agent.actionSurface.map((c: any) => c.toUpperCase()),
              supportedAssets: agent.assets,
              riskLevel: "LOW" as any,
              privacySupport: true,
              verificationStatus: "PENDING" as any,
              deploymentStatus: "LIVE" as any,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadataHash: agent.manifestHash,
            }
          }
          onClose={() => setWizardOpen(false)}
          onDeployed={() => {
            refreshFromDb();
            setWizardOpen(false);
          }}
        />
      )}
    </div>
  );
}
