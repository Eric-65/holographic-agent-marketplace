import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  FileCheck2,
  Lock,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { evaluatePolicy, bucketOf } from "../lib/policy/engine";
import { useScrollLock } from "../lib/useScrollLock";
import { getPrivacyProvider, type ExecutionPhase } from "../lib/privacy";
import { poseidonish, short } from "../lib/hash";
import { ACTION_LABEL, usd } from "../lib/format";
import type {
  ActionIntent,
  Agent,
  BindingState,
  ExecutionReceiptData,
  NotionalBucket,
  PolicyDocument,
} from "../lib/types";
import { Badge, Button } from "./ui/primitives";
import MotionModal from "./motion/MotionModal";
import MotionStatus, { type PipelineStatus } from "./motion/MotionStatus";
import { traceContainer, traceRow } from "../lib/motion/variants";
import { useReducedMotion } from "../lib/motion/useReducedMotion";

const PHASES: { key: ExecutionPhase; label: string; icon: typeof Cpu }[] = [
  { key: "envelope_built", label: "Execution envelope built · nonce-bound", icon: FileCheck2 },
  { key: "wallet_request_sent", label: "Request handed to wallet", icon: Send },
  { key: "wallet_proving", label: "Wallet selecting notes & proving", icon: Cpu },
  { key: "proof_submitted", label: "Proof submitted to Starknet", icon: Lock },
  { key: "proof_verified", label: "Proof verified on-chain", icon: ShieldCheck },
  { key: "receipt_sealed", label: "Non-sensitive receipt sealed", icon: CheckCircle2 },
];

type Stage = "review" | "executing" | "done" | "rejected";

/**
 * ApprovalDialog — the human gate.
 *
 * Shows the agent's intent, the full deterministic rule trace, and (only for an
 * APPROVE / confirmed verdict) drives the PrivacyProvider execution. The user's
 * wallet remains the sole signer; this dialog never sees key material.
 */
export default function ApprovalDialog({
  open,
  agent,
  intent,
  policy,
  bindingState,
  onClose,
  onReceipt,
  onExecuted,
}: {
  open: boolean;
  agent: Agent;
  intent: ActionIntent | null;
  policy: PolicyDocument;
  bindingState: BindingState;
  onClose: () => void;
  onReceipt: (r: ExecutionReceiptData) => void;
  onExecuted: (agentId: string, amountUsd: number) => void;
}) {
  const verdict = useMemo(
    () => (intent ? evaluatePolicy(intent, policy, bindingState) : null),
    [intent, policy, bindingState],
  );

  const [stage, setStage] = useState<Stage>("review");
  const [phase, setPhase] = useState<ExecutionPhase | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStage(verdict?.outcome === "REJECT" ? "rejected" : "review");
      setPhase(null);
      setTxHash(null);
    }
  }, [open, verdict?.outcome, intent?.id]);

  // A rejected intent still produces a receipt: the block itself is auditable.
  useEffect(() => {
    if (!open || !intent || !verdict || verdict.outcome !== "REJECT") return;
    onReceipt({
      id: `RCP-${poseidonish(intent).slice(2, 10).toUpperCase()}`,
      agentId: agent.id,
      agentName: agent.name,
      kind: intent.kind,
      asset: intent.asset,
      venue: intent.venue,
      bucket: bucketOf(intent.amountUsd) as NotionalBucket,
      intentHash: verdict.intentHash,
      policyHash: verdict.policyHash,
      traceHash: verdict.traceHash,
      proofVerified: false,
      attestationSig: poseidonish({ v: verdict.traceHash, s: "sig" }),
      status: "blocked",
      failedRule: verdict.failedRule,
      createdAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intent?.id]);

  // Declared before the early return so hook order stays stable.
  useScrollLock(open);
  const reduced = useReducedMotion();

  // Only bail when there is genuinely nothing to have ever shown (no
  // proposal made yet) — `open` itself is handled by MotionModal so its
  // exit animation can play instead of the dialog vanishing instantly.
  if (!intent || !verdict) return null;

  const run = async () => {
    setStage("executing");
    const provider = getPrivacyProvider();
    const envelope = await provider.buildEnvelope(intent, verdict.policyHash, verdict.intentHash);
    const result = await provider.execute(envelope, setPhase);
    setTxHash(result.txHash);
    onExecuted(agent.id, intent.amountUsd);
    onReceipt({
      id: `RCP-${poseidonish(intent).slice(2, 10).toUpperCase()}`,
      agentId: agent.id,
      agentName: agent.name,
      kind: intent.kind,
      asset: intent.asset,
      venue: intent.venue,
      bucket: bucketOf(intent.amountUsd) as NotionalBucket,
      intentHash: verdict.intentHash,
      policyHash: verdict.policyHash,
      traceHash: verdict.traceHash,
      txHash: result.txHash,
      block: result.block,
      proofVerified: result.proofVerified,
      attestationSig: poseidonish({ v: verdict.traceHash, s: "sig" }),
      status: "executed",
      createdAt: Date.now(),
      latencyMs: result.latencyMs,
    });
    setStage("done");
  };

  const tone =
    verdict.outcome === "APPROVE" ? "good" : verdict.outcome === "REJECT" ? "bad" : "warn";
  const phaseIndex = phase ? PHASES.findIndex((p) => p.key === phase) : -1;

  const pipelineStatus: PipelineStatus =
    stage === "rejected" ? "BLOCKED"
    : stage === "done" ? "COMPLETED"
    : stage === "executing" ? "EXECUTING"
    : verdict.outcome === "REQUIRE_USER_CONFIRMATION" ? "AWAITING_APPROVAL"
    : "APPROVED";

  return (
    <MotionModal open={open} onClose={onClose} zIndex={100} panelClassName="w-full max-w-[720px] max-h-[88dvh] overflow-y-auto overscroll-contain rounded-2xl modal-surface holo-edge">
        {/* header */}
        <div
          className="flex items-start justify-between gap-4 px-6 py-4 border-b sticky top-0 z-10 modal-surface rounded-t-2xl"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="mono text-[10px] tracking-[0.18em] uppercase faint">
              Approval required
            </div>
            <div className="font-display text-[16px] font-semibold tracking-tight mt-1">
              {ACTION_LABEL[intent.kind]} · {intent.asset}
            </div>
            <div className="text-[11.5px] faint">
              proposed by {agent.name} v{agent.version}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MotionStatus status={pipelineStatus} hideLabel size="sm" />
            <Badge tone={tone as "good" | "bad" | "warn"}>{verdict.outcome}</Badge>
            <button onClick={onClose} className="faint hover:text-[var(--text)]">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* intent */}
          <div>
            <SectionLabel>Agent intent</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 mt-2">
              <Field k="Action" v={ACTION_LABEL[intent.kind]} />
              <Field k="Venue" v={intent.venue} />
              <Field k="Asset" v={intent.asset} />
              <Field k="Notional" v={usd(intent.amountUsd)} />
              <Field k="Max slippage" v={`${intent.maxSlippageBps} bps`} />
              <Field k="Counterparty" v={intent.counterparty ?? "n/a"} />
            </div>
            <p className="text-[12px] dim italic mt-3 leading-relaxed">“{intent.rationale}”</p>
          </div>

          {/* trace */}
          <div>
            <SectionLabel>
              Deterministic rule trace
              <span className="mono text-[10px] faint ml-2">
                engine v{verdict.engineVersion} · {short(verdict.traceHash, 8, 4)}
              </span>
            </SectionLabel>
            <motion.div
              key={intent.id}
              className="mt-2 rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
              variants={traceContainer}
              initial={reduced ? "visible" : "hidden"}
              animate="visible"
            >
              {verdict.trace.map((r, i) => {
                const c =
                  r.outcome === "pass" ? "var(--good)"
                  : r.outcome === "fail" ? "var(--bad)"
                  : r.outcome === "confirm" ? "var(--warn)"
                  : "var(--text-faint)";
                return (
                  <motion.div
                    key={r.id + i}
                    variants={reduced ? undefined : traceRow}
                    className="flex items-center gap-3 px-3 py-[7px] border-b last:border-0"
                    style={{ borderColor: "var(--border)", opacity: r.outcome === "skipped" ? 0.4 : 1 }}
                  >
                    <span className="mono text-[10px] faint w-7">{r.id}</span>
                    <span className="text-[12px] flex-1 truncate">{r.label}</span>
                    <span className="mono text-[10px] faint hidden sm:block truncate max-w-[190px]">
                      {r.observed} → {r.bound}
                    </span>
                    <span className="mono text-[10px] w-[54px] text-right" style={{ color: c }}>
                      {r.outcome}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
            {verdict.reason && (
              <div
                className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 mt-3"
                style={{
                  background: "color-mix(in oklab, var(--bad) 10%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--bad) 28%, transparent)",
                }}
              >
                <XCircle size={14} style={{ color: "var(--bad)", marginTop: 1 }} />
                <p className="text-[12px] dim">
                  {verdict.reason}. No execution envelope was built — the broker only produces one
                  for an approved verdict.
                </p>
              </div>
            )}
            {verdict.outcome === "REQUIRE_USER_CONFIRMATION" && stage === "review" && (
              <div
                className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 mt-3"
                style={{
                  background: "color-mix(in oklab, var(--warn) 10%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--warn) 28%, transparent)",
                }}
              >
                <AlertTriangle size={14} style={{ color: "var(--warn)", marginTop: 1 }} />
                <p className="text-[12px] dim">
                  Inside the soft band. Policy defers to you — approving here does not widen the
                  policy, it authorises this single intent.
                </p>
              </div>
            )}
          </div>

          {/* execution */}
          {(stage === "executing" || stage === "done") && (
            <div>
              <SectionLabel>STRK20 execution</SectionLabel>
              <div className="mt-2 space-y-2">
                {PHASES.map((p, i) => {
                  const done = phaseIndex >= i;
                  const active = stage === "executing" && i === phaseIndex + 1;
                  const Icon = p.icon;
                  return (
                    <div key={p.key} className="flex items-center gap-3">
                      <motion.span
                        className="relative h-6 w-6 rounded-md grid place-items-center shrink-0"
                        style={{
                          background: done ? "color-mix(in oklab, var(--accent-3) 16%, transparent)" : "transparent",
                          border: `1px solid ${done ? "color-mix(in oklab, var(--accent-3) 44%, transparent)" : "var(--border)"}`,
                        }}
                        initial={false}
                        animate={reduced ? {} : done ? { scale: [0.85, 1.12, 1] } : {}}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                      >
                        {active && !reduced && (
                          <motion.span
                            aria-hidden
                            className="absolute inset-0 rounded-md"
                            style={{ border: "1px solid var(--accent-3)" }}
                            animate={{ opacity: [0.3, 0.9, 0.3], scale: [1, 1.08, 1] }}
                            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                          />
                        )}
                        <Icon size={11} style={{ color: done ? "var(--accent-3)" : "var(--text-faint)" }} />
                      </motion.span>
                      <span className={`text-[12px] ${done ? "" : "faint"}`}>{p.label}</span>
                      {done && <Check size={12} style={{ color: "var(--good)", marginLeft: "auto" }} />}
                    </div>
                  );
                })}
              </div>
              {txHash && (
                <div className="mono text-[11px] faint mt-4">
                  tx {short(txHash, 14, 8)} · notional recorded as bucket{" "}
                  {bucketOf(intent.amountUsd)} · exact amount discarded
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 border-t sticky bottom-0 modal-surface rounded-b-2xl"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="mono text-[10.5px] faint truncate">
            policy {short(verdict.policyHash, 8, 4)} · intent {short(verdict.intentHash, 8, 4)}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {stage === "done" ? "Close" : "Dismiss"}
            </Button>
            {stage === "review" && verdict.outcome !== "REJECT" && (
              <Button variant="primary" size="sm" onClick={() => void run()}>
                {verdict.outcome === "APPROVE" ? "Execute privately" : "Confirm & execute"}
                <ArrowRight size={13} />
              </Button>
            )}
            {stage === "executing" && (
              <Button variant="primary" size="sm" disabled>
                Executing…
              </Button>
            )}
          </div>
        </div>
    </MotionModal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-[10px] tracking-[0.16em] uppercase faint">{children}</div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[6px] border-b" style={{ borderColor: "var(--border)" }}>
      <span className="text-[11.5px] faint">{k}</span>
      <span className="mono text-[12px] truncate">{v}</span>
    </div>
  );
}
