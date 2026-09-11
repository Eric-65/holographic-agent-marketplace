import { AlertTriangle, ArrowRight, CircleHelp } from "lucide-react";
import { Badge, Button } from "../ui/primitives";
import { short } from "../../lib/hash";
import type { IntentPreview as IntentPreviewData } from "../../lib/ai";

const ASSET_DECIMALS = 1_000_000;

function amountMinorFromDisplay(displayAmount: string): number | null {
  const match = displayAmount.match(/[\d.]+/);
  if (!match) return null;
  return Math.round(parseFloat(match[0]) * ASSET_DECIMALS);
}

/**
 * The intent-preview / confirmation surface — every money-moving AI
 * proposal must be reviewed here before requestExecution() is ever called.
 * There is no path from a chat message straight to execution; this card is
 * the gate, and the user must explicitly click Confirm.
 */
export default function IntentPreview({
  preview,
  onConfirm,
  onCancel,
  confirming,
}: {
  preview: IntentPreviewData;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const isHighRisk = preview.amount?.ok && amountMinorFromDisplay(preview.amount.displayAmount) !== null && (amountMinorFromDisplay(preview.amount.displayAmount) as number) >= 200 * ASSET_DECIMALS;

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--track)" }}>
      <div className="flex items-center justify-between">
        <Badge tone={preview.readyToExecute ? "cyan" : "warn"}>{preview.action.replace(/_/g, " ")}</Badge>
        {isHighRisk && (
          <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: "var(--warn)" }}>
            <AlertTriangle size={11} /> High value — review carefully
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-[13px]">
        <span className="faint">To</span>
        {preview.recipient?.status === "RESOLVED" ? (
          <span className="font-medium">
            {preview.recipient.name} <span className="mono faint text-[11px]">({short(preview.recipient.address!, 6, 4)})</span>
          </span>
        ) : preview.recipient?.status === "AMBIGUOUS" ? (
          <span style={{ color: "var(--warn)" }}>Multiple matches — needs clarification</span>
        ) : (
          <span style={{ color: "var(--bad)" }}>Not one of your approved recipients</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-[13px]">
        <span className="faint">Amount</span>
        {preview.amount?.ok ? <span className="font-medium mono">{preview.amount.displayAmount}</span> : <span style={{ color: "var(--bad)" }}>{preview.amount?.reason ?? "Not specified"}</span>}
      </div>

      {preview.schedule && (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="faint">Schedule</span>
          <span className="mono">
            {preview.schedule.frequency} from {new Date(preview.schedule.startDate).toLocaleDateString()}
            {preview.schedule.endDate ? ` until ${new Date(preview.schedule.endDate).toLocaleDateString()}` : ""}
          </span>
        </div>
      )}

      {preview.reason && (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="faint">Reason</span>
          <span>{preview.reason}</span>
        </div>
      )}

      {preview.blockers.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11.5px] rounded-md px-2.5 py-2" style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)", color: "var(--warn)" }}>
          <CircleHelp size={13} className="shrink-0 mt-[1px]" />
          <div>{preview.blockers.join(" · ")}</div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="primary" size="sm" disabled={!preview.readyToExecute || confirming} onClick={onConfirm}>
          {confirming ? "Submitting…" : "Confirm & send for review"} <ArrowRight size={12} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[10.5px] faint">
        Confirming does not move funds. It hands this to the same policy engine and wallet-authorization step every other payment in Holographic goes through — nothing here can execute
        on its own.
      </p>
    </div>
  );
}
