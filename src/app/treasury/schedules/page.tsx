import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Pause, Play, Plus, X } from "lucide-react";
import { useStore } from "../../../lib/store";
import { describeFrequency } from "../../../lib/treasury/schedule";
import { short } from "../../../lib/hash";
import { datetime } from "../../../lib/format";
import { Badge, Button, Empty, Panel, PanelHeader, SectionTitle } from "../../../components/ui/primitives";
import TreasuryTabs from "../../../components/treasury/TreasuryTabs";
import ExecutionRequestCard, { formatMinor } from "../../../components/treasury/ExecutionRequestCard";
import type { ApprovalMode, ScheduleFrequency } from "../../../lib/db/schema";

const USDC = 1_000_000;

export default function SchedulesPage() {
  const {
    dbUser,
    deployments,
    schedules,
    scheduleOccurrences,
    budgets,
    automationControl,
    createPaymentSchedule,
    updatePaymentSchedule,
    pausePaymentSchedule,
    resumePaymentSchedule,
    cancelPaymentSchedule,
    initiateManualOccurrence,
    retryBlockedOccurrence,
    runSchedulerNow,
  } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const deployment = deployments.find((d) => d.status === "ACTIVE" || d.status === "active");

  const [asset, setAsset] = useState("USDC");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("Vendor retainer");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("MONTHLY");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("AUTOMATIC");
  const [budgetIds, setBudgetIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setAsset("USDC");
    setRecipient("");
    setAmount("50");
    setReason("Vendor retainer");
    setFrequency("MONTHLY");
    setApprovalMode("AUTOMATIC");
    setBudgetIds([]);
    setStartDate(new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  };

  const startEdit = (s: (typeof schedules)[number]) => {
    setEditingId(s.id);
    setAsset(s.asset);
    setRecipient(s.recipient);
    setAmount(String(s.amount / USDC));
    setReason(s.reason);
    setFrequency(s.frequency);
    setApprovalMode(s.approvalMode);
    setBudgetIds(s.budgetIds ?? (s.budgetId ? [s.budgetId] : []));
    setStartDate(new Date(s.startDate).toISOString().slice(0, 16));
    setShowForm(true);
  };

  const occurrencesBySchedule = useMemo(() => {
    const map = new Map<string, typeof scheduleOccurrences>();
    for (const o of scheduleOccurrences) {
      const list = map.get(o.scheduleId) ?? [];
      list.push(o);
      map.set(o.scheduleId, list);
    }
    return map;
  }, [scheduleOccurrences]);

  if (!dbUser) return <Empty title="Connect your wallet" hint="Scheduled payments require a connected wallet and an active Treasury Agent deployment" />;
  if (!deployment) return <Empty title="No active agent deployment" hint="Deploy the Treasury Agent from the marketplace before creating schedules" />;

  const handleSubmit = () => {
    setError(null);
    try {
      const amountMinor = Math.round(Number(amount) * USDC);
      const params = { asset, recipient, amount: amountMinor, reason, frequency, startDate: new Date(startDate).getTime(), approvalMode, budgetIds };
      if (editingId) {
        updatePaymentSchedule(editingId, params, "Edited from schedules page");
      } else {
        createPaymentSchedule(deployment.id, params);
      }
      setShowForm(false);
      resetForm();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Treasury automation"
        title="Scheduled payments"
        sub="A schedule only ever creates a FUTURE INTENT. Every occurrence is re-checked against the current policy and budget the moment it fires — never assumed from when the schedule was created."
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runSchedulerNow}>
              <CalendarClock size={13} /> Check due now
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  resetForm();
                } else {
                  resetForm();
                  setShowForm(true);
                }
              }}
            >
              {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "Cancel" : "New schedule"}
            </Button>
          </div>
        }
      />

      <TreasuryTabs />

      {automationControl?.paused && (
        <div className="rounded-lg px-4 py-3 text-[12px]" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)", border: "1px solid color-mix(in oklab, var(--bad) 28%, transparent)" }}>
          AUTOMATION PAUSED — {automationControl.pausedReason ?? "manual pause"}. Due occurrences will be blocked until automation is resumed from the Treasury overview.
        </div>
      )}

      {showForm && (
        <Panel edge>
          <div className="font-display text-[14px] font-semibold mb-4">{editingId ? "Edit scheduled payment" : "New scheduled payment"}</div>
          {editingId && <p className="text-[11.5px] faint -mt-3 mb-4">Editing preserves history — the prior terms are kept as a version, not overwritten.</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Asset">
              <select value={asset} onChange={(e) => setAsset(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none">
                <option>USDC</option>
                <option>STRK</option>
                <option>ETH</option>
              </select>
            </Field>
            <Field label={`Amount (${asset})`}>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
            </Field>
            <Field label="Recipient">
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] mono outline-none" />
            </Field>
            <Field label="Reason">
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
            </Field>
            <Field label="Frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none">
                <option value="ONCE">One-time</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
            <Field label="Start">
              <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="datetime-local" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
            </Field>
            <Field label="Approval mode">
              <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none">
                <option value="AUTOMATIC">Automatic — proceed if policy allows</option>
                <option value="REQUIRE_APPROVAL">Require approval — always confirm before wallet</option>
                <option value="MANUAL_ONLY">Manual only — I initiate each occurrence</option>
              </select>
            </Field>
          </div>

          {budgets.length > 0 && (
            <div className="mt-4">
              <label className="text-[11px] faint uppercase tracking-wider">Applicable budgets — every one checked must allow each occurrence</label>
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
                      {b.name} ({b.period.toLowerCase()})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="text-[11.5px] mt-3" style={{ color: "var(--bad)" }}>{error}</div>}
          <div className="mt-4">
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!recipient || !amount}>
              {editingId ? "Save changes" : "Create schedule"}
            </Button>
          </div>
        </Panel>
      )}

      <Panel padded={false} edge>
        <PanelHeader title="Schedules" sub={`${schedules.length} total`} />
        {schedules.length === 0 ? (
          <Empty title="No schedules yet" hint="Create one above to prepare recurring vendor/contractor payments" />
        ) : (
          <div>
            {schedules.map((s) => {
              const occurrences = (occurrencesBySchedule.get(s.id) ?? []).slice(0, 3);
              return (
                <div key={s.id} className="p-4 space-y-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {s.reason} <span className="mono text-[10px] faint">v{s.version}</span>
                      </div>
                      <div className="mono text-[11px] faint">
                        {formatMinor(s.amount)} {s.asset} → {short(s.recipient, 8, 4)} · {describeFrequency(s)} · {s.approvalMode.replace(/_/g, " ").toLowerCase()}
                      </div>
                      <div className="mono text-[10.5px] faint mt-0.5">
                        next {datetime(s.nextOccurrenceAt)} · {s.occurrenceCount} fired
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <ScheduleStatusBadge status={s.status} />
                      {(s.status === "ACTIVE" || s.status === "PAUSED") && (
                        <Button variant="outline" size="sm" onClick={() => startEdit(s)}>
                          Edit
                        </Button>
                      )}
                      {s.status === "ACTIVE" && (
                        <Button variant="outline" size="sm" onClick={() => pausePaymentSchedule(s.id)}>
                          <Pause size={11} />
                        </Button>
                      )}
                      {s.status === "PAUSED" && (
                        <Button variant="outline" size="sm" onClick={() => resumePaymentSchedule(s.id)}>
                          <Play size={11} />
                        </Button>
                      )}
                      {(s.status === "ACTIVE" || s.status === "PAUSED") && (
                        <Button variant="danger" size="sm" onClick={() => cancelPaymentSchedule(s.id)}>
                          <X size={11} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {occurrences.length > 0 && (
                    <div className="space-y-2 pl-1">
                      {occurrences.map((o) =>
                        o.status === "AWAITING_USER_INITIATION" ? (
                          <div key={o.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--track)" }}>
                            <span className="text-[11.5px] dim">Due {datetime(o.occurrenceAt)} — manual initiation required</span>
                            <Button variant="primary" size="sm" onClick={() => initiateManualOccurrence(o.id)}>
                              Propose now
                            </Button>
                          </div>
                        ) : o.status === "BLOCKED" ? (
                          <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-[11px] mono" style={{ background: "color-mix(in oklab, var(--bad) 8%, transparent)", color: "var(--bad)" }}>
                            <span>
                              {datetime(o.occurrenceAt)} — BLOCKED: {o.blockedReason}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => retryBlockedOccurrence(o.id)}>
                              Retry
                            </Button>
                          </div>
                        ) : o.executionRequestId ? (
                          <ExecutionRequestCard key={o.id} requestId={o.executionRequestId} label={`Occurrence ${datetime(o.occurrenceAt)}`} />
                        ) : null,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] faint uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function ScheduleStatusBadge({ status }: { status: string }) {
  const tone = status === "ACTIVE" ? "good" : status === "PAUSED" ? "warn" : status === "CANCELLED" || status === "EXPIRED" ? "bad" : "neutral";
  return <Badge tone={tone as any}>{status}</Badge>;
}
