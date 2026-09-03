import { useState, type ReactNode } from "react";
import { ArrowLeft, Pause, Play, ShieldAlert } from "lucide-react";
import { useStore } from "../../../lib/store";
import { Link } from "../../router";
import { datetime } from "../../../lib/format";
import { formatMinor } from "../../../components/treasury/ExecutionRequestCard";
import NewRecipientReviewPanel from "../../../components/treasury/NewRecipientReviewPanel";
import { Badge, Button, Empty, Panel, PanelHeader, SectionTitle } from "../../../components/ui/primitives";

const USDC = 1_000_000;

export default function AutomationSettingsPage() {
  const { dbUser, automationControl, emergencyEvents, pauseAllTreasuryAutomation, resumeTreasuryAutomation, updateTreasuryEmergencyRules } = useStore();
  const [pauseReason, setPauseReason] = useState("");

  const [maxDailySpend, setMaxDailySpend] = useState("");
  const [maxBatchSize, setMaxBatchSize] = useState("");
  const [maxRecipients, setMaxRecipients] = useState("");
  const [emergencyThreshold, setEmergencyThreshold] = useState("");
  const [maxFailureRate, setMaxFailureRate] = useState("");
  const [saved, setSaved] = useState(false);

  if (!dbUser || !automationControl) return <Empty title="Connect your wallet" hint="Automation controls require a connected wallet" />;

  const handleSaveRules = () => {
    updateTreasuryEmergencyRules({
      ...(maxDailySpend ? { maxDailyTreasurySpend: Math.round(Number(maxDailySpend) * USDC) } : {}),
      ...(maxBatchSize ? { maxBatchSize: Math.round(Number(maxBatchSize)) } : {}),
      ...(maxRecipients ? { maxRecipients: Math.round(Number(maxRecipients)) } : {}),
      ...(emergencyThreshold ? { emergencyPauseThreshold: Math.round(Number(emergencyThreshold) * USDC) } : {}),
      ...(maxFailureRate ? { maxFailureRate: Math.min(1, Math.max(0, Number(maxFailureRate) / 100)) } : {}),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Link href="/treasury" className="inline-flex items-center gap-1.5 text-[12.5px] dim hover:text-[var(--text)]">
        <ArrowLeft size={13} /> Treasury
      </Link>

      <SectionTitle
        eyebrow="Global safety"
        title="Automation controls"
        sub="These limits are owner-only — no agent path can read or modify them. An emergency trigger firing automatically is logged exactly like a manual pause, so you can always tell the two apart."
      />

      <Panel edge>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={automationControl.paused ? "bad" : "good"}>{automationControl.paused ? "AUTOMATION PAUSED" : "AUTOMATION ACTIVE"}</Badge>
          <span className="text-[11.5px] faint flex-1 min-w-[160px]">
            {automationControl.paused
              ? `${automationControl.pausedByOwner ? "Paused by owner" : "Automatically triggered"}${automationControl.pausedReason ? ` — ${automationControl.pausedReason}` : ""}`
              : "Scheduled payments, batches and workflows may run under current policy + budget limits"}
          </span>
          {automationControl.paused ? (
            <Button variant="primary" size="sm" onClick={() => resumeTreasuryAutomation()}>
              <Play size={12} /> Resume automation
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="Reason (optional)"
                className="h-8 px-2.5 rounded-lg surface text-[11.5px] outline-none w-[180px]"
              />
              <Button variant="danger" size="sm" onClick={() => pauseAllTreasuryAutomation(pauseReason || undefined)}>
                <Pause size={12} /> Pause all automation
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <NewRecipientReviewPanel />

      <Panel edge>
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={14} className="faint" />
          <div className="font-display text-[14px] font-semibold">Emergency trigger limits</div>
        </div>
        <p className="text-[11.5px] faint mb-4">Checked automatically before every scheduler tick. Breaching any of these pauses automation the same way a manual pause does.</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`Max daily automated spend (currently ${formatMinor(automationControl.maxDailyTreasurySpend)})`}>
            <input value={maxDailySpend} onChange={(e) => setMaxDailySpend(e.target.value)} type="number" min="0" placeholder="10000" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          </Field>
          <Field label={`Max failure rate % (currently ${Math.round(automationControl.maxFailureRate * 100)}%)`}>
            <input value={maxFailureRate} onChange={(e) => setMaxFailureRate(e.target.value)} type="number" min="0" max="100" placeholder="50" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          </Field>
          <Field label={`Max batch size (currently ${automationControl.maxBatchSize})`}>
            <input value={maxBatchSize} onChange={(e) => setMaxBatchSize(e.target.value)} type="number" min="1" placeholder="25" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          </Field>
          <Field label={`Max recipients per batch (currently ${automationControl.maxRecipients})`}>
            <input value={maxRecipients} onChange={(e) => setMaxRecipients(e.target.value)} type="number" min="1" placeholder="25" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          </Field>
          <Field label={`Emergency pause threshold (currently ${formatMinor(automationControl.emergencyPauseThreshold)})`}>
            <input value={emergencyThreshold} onChange={(e) => setEmergencyThreshold(e.target.value)} type="number" min="0" placeholder="2000" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          </Field>
          <Field label="New-recipient approval">
            <div className="mt-1 text-[12.5px] dim h-9 flex items-center">
              {automationControl.requireNewRecipientApproval ? "Required — always" : "Not required"}
            </div>
          </Field>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button variant="primary" size="sm" onClick={handleSaveRules}>
            Save limits
          </Button>
          {saved && <span className="text-[11.5px]" style={{ color: "var(--good)" }}>Saved</span>}
        </div>
      </Panel>

      <Panel padded={false} edge>
        <PanelHeader title="Emergency event log" sub="Every automatic and manual pause/resume, in order" />
        {emergencyEvents.length === 0 ? (
          <Empty title="No events yet" hint="Pauses and resumes — manual or automatic — will appear here" />
        ) : (
          <div>
            {emergencyEvents.map((e) => (
              <div key={e.id} className="px-5 py-3 border-b last:border-0 flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium">{e.detail}</div>
                  <div className="mono text-[10.5px] faint">{e.trigger} · {datetime(e.createdAt)}</div>
                </div>
                <Badge tone={e.action === "PAUSED" ? "bad" : "good"}>{e.action}</Badge>
              </div>
            ))}
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
