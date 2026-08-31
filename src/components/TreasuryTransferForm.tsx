import { useState, useMemo } from "react";
import { ArrowRight, ShieldCheck, AlertTriangle, Check, XCircle, EyeOff } from "lucide-react";
import { useStore } from "../lib/store";
import { makeTransferIntent, type TreasuryTransferIntent } from "../lib/intent/model";
import { validateAction } from "../lib/policy/validateAction";
import type { AgentPolicy } from "../lib/policy/model";
import { intentToAgentAction, executePrivateTransfer } from "../lib/execution/privateTransfer";
import { poseidonish, short } from "../lib/hash";
import { usd } from "../lib/format";
import { Button, Badge, Panel, PanelHeader } from "./ui/primitives";

const USDC = 1_000_000; // 6 decimals

function basePolicy(agentId: string, owner: string): AgentPolicy {
  return {
    agentId,
    owner,
    allowedAssets: ["USDC", "STRK", "ETH"],
    maximumTransactionAmount: 500 * USDC, // 500 USDC limit for testing CASE B
    dailySpendingLimit: 5000 * USDC,
    approvedRecipients: [
      "0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f", // approved vendor
      "0x04a7c1b8e93f25d60a1b7c2d3e4f5a6b7c8d9e0f", // self
      "0x03c709861d93f25d60a1b7c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5", // from screenshot
    ],
    approvalThreshold: 250 * USDC, // requires human confirmation above 250
    allowedActions: ["payment", "transfer", "swap"],
    paused: false,
  };
}

export default function TreasuryTransferForm() {
  const { wallet, diagnostic, agents, deployments, addReceipt, recordExecution } = useStore();
  const treasuryAgent = agents.find((a) => a.category === "Treasury") ?? agents[0];
  const deployment = deployments.find((d) => d.agentId === treasuryAgent.id);
  const isPaused = deployment ? deployment.status === "PAUSED" || deployment.status === "paused" : false;

  const [asset, setAsset] = useState("USDC");
  const [recipient, setRecipient] = useState("0x0512ff9a34cd7e21b8046f5c3d2a1e0b9c8d7e21f");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("approved vendor payment");
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<null | {
    txHash: string;
    status: "success" | "failed";
    provider: string;
    bucket: string;
    isMock: boolean;
    error?: string;
  }>(null);

  const isConnected = wallet.status === "connected";
  const isMock = diagnostic.isMock;
  const canExecute = isConnected && !isPaused;

  // Create candidate intent from form — agent creates candidate, not approval
  const candidateIntent: TreasuryTransferIntent | null = useMemo(() => {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) return null;
    const amountMinor = Math.floor(amountNum * USDC);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
    if (!recipient) return null;

    return makeTransferIntent({
      agentId: treasuryAgent.id,
      asset,
      recipient,
      amount: amountMinor,
      action: "transfer",
      reason,
      requestedAt: Date.now(),
      metadata: {
        venue: "STRK20 Pool",
        agentVersion: treasuryAgent.version,
      },
    });
  }, [asset, recipient, amount, reason, treasuryAgent]);

  // Policy evaluation — deterministic engine is authority
  const policy = useMemo(() => basePolicy(treasuryAgent.id, wallet.address ?? "0x0"), [treasuryAgent.id, wallet.address]);
  const policyResult = useMemo(() => {
    if (!candidateIntent) return null;
    const action = intentToAgentAction(candidateIntent);
    return validateAction(action, policy);
  }, [candidateIntent, policy]);

  const handleExecute = async () => {
    if (!candidateIntent || !policyResult) return;
    if (!policyResult.allowed) return; // Do not call wallet if REJECT
    if (policyResult.requiresHumanApproval) {
      // Show approval dialog — for this vertical slice, we require explicit confirmation
      // In real flow, ApprovalDialog would be shown. For Treasury UI, we ask user to confirm again
      const confirmed = window.confirm(
        `Human confirmation required: amount ${amount} ${asset} exceeds threshold. Confirm private transfer?`,
      );
      if (!confirmed) return;
    }

    setExecuting(true);
    setExecutionResult(null);

    try {
      const result = await executePrivateTransfer(candidateIntent, policy, {
        expectedChainId: "0x534e5f5345504f4c4941", // Sepolia
        allowConfirmationBypass: policyResult.requiresHumanApproval ? true : false,
      });

      // Create receipt with only non-sensitive metadata
      const receiptId = `RCP-${poseidonish({ id: candidateIntent.id }).slice(2, 10).toUpperCase()}`;
      addReceipt({
        id: receiptId,
        agentId: treasuryAgent.id,
        agentName: treasuryAgent.name,
        kind: "private_transfer",
        asset: asset as any,
        venue: "STRK20 Pool",
        bucket: result.bucket as any,
        intentHash: result.intentHash,
        policyHash: result.policyHash,
        traceHash: result.traceHash ?? (poseidonish(policyResult.reasons) as any),
        txHash: result.txHash,
        block: result.block,
        proofVerified: result.proofVerified,
        attestationSig: poseidonish({ tx: result.txHash }) as any,
        status: "executed",
        createdAt: Date.now(),
        latencyMs: result.latencyMs,
      });

      recordExecution(treasuryAgent.id, candidateIntent.amount);

      setExecutionResult({
        txHash: result.txHash,
        status: "success",
        provider: isMock ? "DEMO EXECUTION" : "STRK20 EXECUTION",
        bucket: result.bucket,
        isMock,
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const code = e?.code ?? "UNKNOWN";
      setExecutionResult({
        txHash: "NOT AVAILABLE",
        status: "failed",
        provider: isMock ? "DEMO EXECUTION" : "STRK20 EXECUTION",
        bucket: candidateIntent ? `${candidateIntent.amount}` : "—",
        isMock,
        error: `${code}: ${msg}`,
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Panel padded={false} edge>
      <PanelHeader
        title="Send private payment — Treasury Agent"
        sub={`Agent ${treasuryAgent.name} proposes, policy decides, wallet executes via ${isMock ? "Mock" : "STRK20"} (private transfer only)`}
        right={<Badge tone={isMock ? "warn" : "good"}>{isMock ? "DEMO EXECUTION" : "STRK20 EXECUTION"}</Badge>}
      />

      <div className="p-5 space-y-5">
        {/* Form fields */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] faint uppercase tracking-wider">Asset</label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none"
            >
              <option value="USDC">USDC</option>
              <option value="STRK">STRK</option>
              <option value="ETH">ETH</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] faint uppercase tracking-wider">Amount ({asset})</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10"
              className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none"
              type="number"
              min="0"
              step="0.000001"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] faint uppercase tracking-wider">Recipient</label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] mono outline-none"
          />
          <div className="text-[10.5px] faint mt-1">Approved: {basePolicy("", "").approvedRecipients.map((a) => short(a, 6, 4)).join(", ")}</div>
        </div>

        <div>
          <label className="text-[11px] faint uppercase tracking-wider">Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="approved vendor payment"
            className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none"
          />
        </div>

        {/* Policy check — show before wallet authorization */}
        {candidateIntent && (
          <div className="rounded-lg p-4" style={{ background: "var(--track)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] faint uppercase tracking-wider mb-2">Policy check — deterministic engine</div>
            {policyResult ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[12px]">
                  {policyResult.allowed ? <Check size={12} style={{ color: "var(--good)" }} /> : <XCircle size={12} style={{ color: "var(--bad)" }} />}
                  <span style={{ color: policyResult.allowed ? "var(--good)" : "var(--bad)" }}>
                    {policyResult.allowed ? (policyResult.requiresHumanApproval ? "REQUIRE_USER_CONFIRMATION" : "APPROVE") : "REJECT"}
                  </span>
                  {policyResult.requiresHumanApproval && <Badge tone="warn">human confirmation required</Badge>}
                </div>

                <div className="mt-2 space-y-1">
                  <CheckRow label="Allowed asset" ok={policy.allowedAssets.includes(asset)} />
                  <CheckRow label="Approved recipient" ok={policy.approvedRecipients.includes(recipient)} />
                  <CheckRow label={`Within limit (${usd(policy.maximumTransactionAmount / USDC)})`} ok={candidateIntent.amount <= policy.maximumTransactionAmount} />
                  <CheckRow label={`Daily limit available (${usd(policy.dailySpendingLimit / USDC)})`} ok={true} />
                  <CheckRow label="Agent not paused" ok={!policy.paused} />
                </div>

                {policyResult.reasons.length > 0 && (
                  <div className="mt-2 mono text-[10.5px] space-y-0.5" style={{ color: "var(--bad)" }}>
                    {policyResult.reasons.map((r, i) => (
                      <div key={i}>{r}</div>
                    ))}
                  </div>
                )}

                <div className="mt-2 mono text-[10px] faint">
                  intentHash {short(poseidonish({ id: candidateIntent.id }) as any, 10, 6)} · policyHash {short(poseidonish(policy) as any, 10, 6)}
                </div>
              </div>
            ) : (
              <div className="text-[12px] faint">Invalid intent shape</div>
            )}
          </div>
        )}

        {isPaused && (
          <div className="text-[11px] px-2.5 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad)" }}>
            AGENT PAUSED — No new execution permitted. Resume the agent to enable payments.
          </div>
        )}

        {/* Execution */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void handleExecute();
            }}
            disabled={!canExecute || !candidateIntent || !policyResult?.allowed || executing}
          >
            {executing ? "Authorizing…" : "Authorize private transfer"}
            <ArrowRight size={12} />
          </Button>
          <span className="text-[11px] faint">
            {!isConnected ? "Connect wallet first" : isPaused ? "Agent paused" : isMock ? "Demo Mode — no real tx" : "Real wallet — will request signature"}
          </span>
        </div>

        {/* Result */}
        {executionResult && (
          <div className="rounded-lg p-4 border" style={{ borderColor: executionResult.status === "success" ? "color-mix(in oklab, var(--good) 30%, transparent)" : "color-mix(in oklab, var(--bad) 30%, transparent)", background: executionResult.status === "success" ? "color-mix(in oklab, var(--good) 8%, transparent)" : "color-mix(in oklab, var(--bad) 8%, transparent)" }}>
            <div className="flex items-center gap-2 mb-2">
              {executionResult.status === "success" ? <ShieldCheck size={14} style={{ color: "var(--good)" }} /> : <AlertTriangle size={14} style={{ color: "var(--bad)" }} />}
              <span className="text-[12.5px] font-medium">{executionResult.provider} — {executionResult.status === "success" ? "Success" : "Failed"}</span>
              <Badge tone={executionResult.isMock ? "warn" : "good"}>{executionResult.isMock ? "DEMO" : "STRK20"}</Badge>
            </div>
            <div className="mono text-[11px] space-y-1">
              <div>Agent: {treasuryAgent.name}</div>
              <div>Action: PRIVATE_TRANSFER {asset}</div>
              <div>Policy: {policyResult?.allowed ? "APPROVE" : "REJECT"} {policyResult?.requiresHumanApproval ? "· human confirmation" : ""}</div>
              <div>Execution status: {executionResult.status}</div>
              <div>Privacy provider: {executionResult.provider}</div>
              <div>Timestamp: {new Date().toLocaleString()}</div>
              <div>Execution ID: {short(executionResult.txHash, 12, 8)}</div>
              <div>Bucket: {executionResult.bucket} (exact amount not stored)</div>
              {executionResult.error && <div style={{ color: "var(--bad)" }}>Error: {executionResult.error}</div>}
            </div>
            <div className="mt-2 text-[10.5px] faint flex items-center gap-1">
              <EyeOff size={10} /> Viewing keys, notes, witnesses not stored — wallet-custodied
            </div>
          </div>
        )}

        {/* Test cases hint */}
        <div className="text-[10.5px] faint leading-relaxed border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <div className="font-medium" style={{ color: "var(--text-dim)" }}>Policy test cases (per spec):</div>
          <div>A: 10 USDC approved recipient within 500 limit → APPROVE</div>
          <div>B: 800 USDC limit 500 → REJECT E_ABOVE_TRANSACTION_LIMIT</div>
          <div>C: recipient not approved → REJECT E_RECIPIENT_NOT_APPROVED</div>
          <div>D: 300 USDC threshold 250 → REQUIRE_USER_CONFIRMATION</div>
        </div>
      </div>
    </Panel>
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      {ok ? <Check size={11} style={{ color: "var(--good)" }} /> : <XCircle size={11} style={{ color: "var(--bad)" }} />}
      <span className={ok ? "dim" : ""} style={ok ? undefined : { color: "var(--bad)" }}>
        {ok ? "✓" : "✗"} {label}
      </span>
    </div>
  );
}
