import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Link2, ScrollText } from "lucide-react";
import { Link } from "../router";
import { useStore } from "../../lib/store";
import { RULE_CATALOG, ENGINE_VERSION } from "../../lib/policy/engine";
import { short } from "../../lib/hash";
import { datetime, usd } from "../../lib/format";
import PolicyEditor from "../../components/PolicyEditor";
import EngineConformance from "../../components/EngineConformance";
import {
  Badge,
  Button,
  Panel,
  PanelHeader,
  SectionTitle,
  Stat,
} from "../../components/ui/primitives";
import type { PolicyDocument, RuleId } from "../../lib/types";

export default function PoliciesPage() {
  const { policies, agents, savePolicy } = useStore();
  const [selectedId, setSelectedId] = useState(policies[0]?.id ?? "");
  const [draft, setDraft] = useState<PolicyDocument | null>(null);

  const record = policies.find((p) => p.id === selectedId) ?? policies[0];
  const agent = agents.find((a) => a.id === record?.agentId);
  const value = draft ?? record?.doc;
  const dirty = useMemo(
    () => (draft && record ? JSON.stringify(draft) !== JSON.stringify(record.doc) : false),
    [draft, record],
  );

  const active = policies.filter((p) => p.status === "active");
  const committed = policies.filter((p) => p.onchainCommitTx).length;

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Governance"
        title="Policies"
        sub="A policy is a canonical, versioned document compiled into a deterministic ruleset. Editing creates a new version; running bindings continue against the version they were bound to until you promote the new one."
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Policy documents" value={policies.length} sub={`${active.length} active`} />
        <Stat label="On-chain commitments" value={committed} sub="PolicyCommitment.cairo" tone="cyan" />
        <Stat label="Engine version" value={`v${ENGINE_VERSION}`} sub="browser = server parity" tone="good" />
        <Stat label="Evaluation mode" value="default deny" sub="12 ordered rules" tone="good" />
      </div>

      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-3 items-start">
        <Panel padded={false}>
          <PanelHeader title="Documents" sub="Grouped by binding" />
          <div>
            {policies.map((p) => {
              const a = agents.find((x) => x.id === p.agentId);
              const on = p.id === record?.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setDraft(null);
                  }}
                  className="w-full text-left px-4 py-3 border-b last:border-0 transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    background: on ? "var(--track)" : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium truncate">{p.label}</span>
                    <Badge
                      tone={p.status === "active" ? "good" : p.status === "draft" ? "warn" : "neutral"}
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] faint mt-0.5 truncate">
                    {a?.name} · v{p.doc.version}
                  </div>
                  <div className="mono text-[10px] faint mt-1 flex items-center gap-2">
                    {short(p.docHash, 8, 4)}
                    {p.onchainCommitTx && <Link2 size={9} style={{ color: "var(--accent-3)" }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <div className="space-y-3">
          {record && agent && value ? (
            <>
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <ScrollText size={14} style={{ color: "var(--accent)" }} />
                      <span className="font-display text-[15px] font-semibold tracking-tight">
                        {record.label}
                      </span>
                      <Badge tone={record.status === "active" ? "good" : "warn"}>{record.status}</Badge>
                    </div>
                    <div className="text-[11.5px] faint mt-1">
                      Bound to{" "}
                      <Link href={`/agents/${agent.id}`} style={{ color: "var(--accent-3)" }}>
                        {agent.name}
                      </Link>{" "}
                      · created {datetime(record.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-[11px] faint">doc hash</div>
                    <div className="mono text-[12px]">{short(record.docHash, 10, 6)}</div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-4 gap-3 mt-5">
                  <Mini label="Per action" value={usd(value.perActionCapUsd, { compact: true })} />
                  <Mini label="24h ceiling" value={usd(value.dailyCapUsd, { compact: true })} />
                  <Mini label="Cooldown" value={`${value.cooldownSeconds}s`} />
                  <Mini label="Slippage" value={`${value.maxSlippageBps} bps`} />
                </div>

                {record.onchainCommitTx && (
                  <div className="flex items-center gap-2 mt-4 text-[11.5px] faint">
                    <CheckCircle2 size={12} style={{ color: "var(--good)" }} />
                    Committed on-chain · tx {short(record.onchainCommitTx, 10, 6)}
                  </div>
                )}
              </Panel>

              <PolicyEditor
                agent={agent}
                value={value}
                onChange={setDraft}
                dirty={dirty}
                onSave={() => {
                  if (draft) savePolicy(agent.id, draft, record.label);
                  setDraft(null);
                }}
                onReset={() => setDraft(null)}
              />
            </>
          ) : (
            <Panel>
              <div className="text-[13px] dim">Select a policy document.</div>
            </Panel>
          )}

          <EngineConformance />

          <Panel padded={false}>
            <PanelHeader
              title="Rule catalog"
              sub="Fixed evaluation order · first hard failure short-circuits"
              right={
                <Button variant="ghost" size="sm">
                  <FileText size={12} /> Spec
                </Button>
              }
            />
            <div className="grid sm:grid-cols-2">
              {(Object.keys(RULE_CATALOG) as RuleId[]).map((id, i) => (
                <div
                  key={id}
                  className="flex items-start gap-3 px-5 py-3 border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="mono text-[10.5px] faint mt-[2px]">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium">
                      <span className="mono text-[10.5px] mr-2" style={{ color: "var(--accent-3)" }}>
                        {id}
                      </span>
                      {RULE_CATALOG[id].label}
                    </div>
                    <div className="text-[11.5px] faint">{RULE_CATALOG[id].description}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--track)" }}>
      <div className="text-[10.5px] faint uppercase tracking-wider">{label}</div>
      <div className="mono text-[13px] mt-1">{value}</div>
    </div>
  );
}
