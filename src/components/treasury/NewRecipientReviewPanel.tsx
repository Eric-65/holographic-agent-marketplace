import { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { useStore } from "../../lib/store";
import { short } from "../../lib/hash";
import { Badge, Panel, PanelHeader, Button } from "../ui/primitives";

/**
 * Surfaces every payment blocked purely because its recipient isn't approved
 * yet. The agent that proposed it can never add itself as a recipient —
 * only an explicit human decision here can. Approving re-runs the full
 * policy check the next time the source (schedule/batch/workflow) fires or
 * is retried; it never executes anything on its own.
 */
export default function NewRecipientReviewPanel() {
  const { newRecipientReviews, approveNewRecipient, rejectNewRecipient } = useStore();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const pending = newRecipientReviews.filter((r) => r.status === "PENDING");

  if (pending.length === 0) return null;

  return (
    <Panel padded={false} edge>
      <PanelHeader title="New recipient review" sub={`${pending.length} payment(s) waiting on an unapproved recipient`} right={<ShieldAlert size={13} style={{ color: "var(--warn)" }} />} />
      <div>
        {pending.map((r) => (
          <div key={r.id} className="p-4 border-b last:border-0 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--border)" }}>
            <div className="min-w-0 flex-1">
              <div className="mono text-[12px]">{short(r.recipient, 10, 6)}</div>
              <div className="text-[11px] faint">
                {r.asset} · blocked {r.sourceType.replace(/_/g, " ")} · <Badge tone="warn">PENDING</Badge>
              </div>
            </div>
            <input
              value={labels[r.id] ?? ""}
              onChange={(e) => setLabels((l) => ({ ...l, [r.id]: e.target.value }))}
              placeholder="Label (e.g. Vendor name)"
              className="h-8 px-2.5 rounded-lg surface text-[11.5px] outline-none w-[160px]"
            />
            <Button variant="primary" size="sm" onClick={() => approveNewRecipient(r.id, labels[r.id] || "Approved recipient")}>
              <Check size={12} /> Approve
            </Button>
            <Button variant="danger" size="sm" onClick={() => rejectNewRecipient(r.id)}>
              <X size={12} />
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
