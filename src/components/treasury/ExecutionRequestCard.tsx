import { useState } from "react";
import { Check, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useStore } from "../../lib/store";
import { short } from "../../lib/hash";
import { usd } from "../../lib/format";
import { Badge, Button } from "../ui/primitives";

/**
 * Renders one execution request at whatever stage it's in and offers the
 * exact next legitimate action — approve, authorize via wallet, or nothing
 * (blocked/completed). This is the single place schedules, batches, payment
 * requests and workflow runs all reach the wallet from.
 */
export default function ExecutionRequestCard({ requestId, label }: { requestId: string; label?: string }) {
  const { executionRequests, approvePendingExecution, authorizePendingExecution } = useStore();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ status: "success" | "failed"; error?: string } | null>(null);

  const req = executionRequests.find((r) => r.id === requestId);
  if (!req) return <div className="text-[11px] faint">Execution request not found</div>;

  const amount = (req.intent.amount / 1_000_000).toLocaleString();

  const handleApprove = () => {
    approvePendingExecution(requestId);
  };

  const handleAuthorize = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await authorizePendingExecution(requestId);
      setOutcome({ status: result.status, error: result.error });
    } catch (e: any) {
      setOutcome({ status: "failed", error: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--track)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium truncate">{label ?? req.intent.reason}</div>
          <div className="mono text-[10.5px] faint">
            {amount} {req.intent.asset} → {short(req.intent.recipient, 8, 4)}
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {req.status === "BLOCKED" && (
        <div className="text-[10.5px] mono" style={{ color: "var(--bad)" }}>
          {req.verdict.reasons[0] ?? "Rejected by policy"}
        </div>
      )}

      {req.status === "AWAITING_USER" && !req.approvedByUser && (
        <div className="flex items-center gap-2">
          <ShieldAlert size={12} style={{ color: "var(--warn)" }} />
          <span className="text-[11px] dim flex-1">Above confirmation threshold — requires your approval</span>
          <Button variant="primary" size="sm" onClick={handleApprove}>
            <Check size={12} /> Approve
          </Button>
        </div>
      )}

      {(req.status === "POLICY_APPROVED" || (req.status === "AWAITING_USER" && req.approvedByUser)) && !outcome && (
        <Button variant="primary" size="sm" onClick={() => void handleAuthorize()} disabled={busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          {busy ? "Authorizing…" : "Authorize via wallet"}
        </Button>
      )}

      {outcome && (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: outcome.status === "success" ? "var(--good)" : "var(--bad)" }}>
          {outcome.status === "success" ? <ShieldCheck size={12} /> : <XCircle size={12} />}
          {outcome.status === "success" ? "Executed" : `Failed: ${outcome.error ?? "unknown error"}`}
        </div>
      )}

      {(req.status === "COMPLETED" || req.status === "executed") && (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--good)" }}>
          <ShieldCheck size={12} /> Executed
        </div>
      )}

      <div className="mono text-[10px] faint">policy v{req.policyVersion ?? 1} · request {short(req.id, 6, 4)}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "COMPLETED" || status === "executed"
      ? "good"
      : status === "BLOCKED" || status === "FAILED"
        ? "bad"
        : status === "AWAITING_USER"
          ? "warn"
          : "cyan";
  return <Badge tone={tone as any}>{status.replace(/_/g, " ")}</Badge>;
}

export const formatMinor = (amount: number) => usd(amount / 1_000_000, { compact: amount > 100_000_000 });
