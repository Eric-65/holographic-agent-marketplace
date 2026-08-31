import { useState } from "react";
import { Pause, Play, Plus, X } from "lucide-react";
import { useStore } from "../../../lib/store";
import { usedInCurrentPeriod } from "../../../lib/api/budgets";
import { Badge, Button, Empty, Panel, SectionTitle } from "../../../components/ui/primitives";
import TreasuryTabs from "../../../components/treasury/TreasuryTabs";
import { formatMinor } from "../../../components/treasury/ExecutionRequestCard";
import type { BudgetPeriod } from "../../../lib/db/schema";

const USDC = 1_000_000;

export default function BudgetsPage() {
  const { dbUser, dbPolicies, budgets, createTreasuryBudget, pauseTreasuryBudget, resumeTreasuryBudget } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("Vendor budget");
  const [asset, setAsset] = useState("USDC");
  const [limit, setLimit] = useState("500");
  const [period, setPeriod] = useState<BudgetPeriod>("MONTHLY");
  const [policyId, setPolicyId] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!dbUser) return <Empty title="Connect your wallet" hint="Budgets require a connected wallet" />;

  const handleCreate = () => {
    setError(null);
    try {
      createTreasuryBudget(name, asset, Math.round(Number(limit) * USDC), period, policyId || null);
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Treasury automation"
        title="Budgets"
        sub="A budget is not a replacement for the policy engine — every execution requires policy AND budget to both allow it. Usage is tracked from persisted execution history, never estimated."
        right={
          <Button variant="primary" size="sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "Cancel" : "New budget"}
          </Button>
        }
      />

      <TreasuryTabs />

      {showForm && (
        <Panel edge>
          <div className="font-display text-[14px] font-semibold mb-4">New budget</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
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
              <label className="text-[11px] faint uppercase tracking-wider">Limit ({asset} per period)</label>
              <input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" min="0" step="0.01" className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none" />
            </div>
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] faint uppercase tracking-wider">Linked policy (optional)</label>
              <select value={policyId} onChange={(e) => setPolicyId(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[13px] outline-none">
                <option value="">None</option>
                {dbPolicies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="text-[11.5px] mt-3" style={{ color: "var(--bad)" }}>{error}</div>}
          <div className="mt-4">
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={!name || !limit}>
              Create budget
            </Button>
          </div>
        </Panel>
      )}

      {budgets.length === 0 ? (
        <Panel padded={false} edge>
          <Empty title="No budgets yet" hint="Create a monthly vendor or contractor budget to enforce spend ceilings alongside your policy" />
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {budgets.map((b) => {
            const used = usedInCurrentPeriod(b.id);
            const pct = b.limit > 0 ? Math.min(100, (used / b.limit) * 100) : 0;
            return (
              <Panel key={b.id} edge>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13.5px] font-medium">{b.name}</div>
                    <div className="text-[11px] faint">{b.period.toLowerCase()} · {b.asset}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={b.status === "ACTIVE" ? "good" : "warn"}>{b.status}</Badge>
                    {b.status === "ACTIVE" ? (
                      <Button variant="outline" size="sm" onClick={() => pauseTreasuryBudget(b.id)}>
                        <Pause size={11} />
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => resumeTreasuryBudget(b.id)}>
                        <Play size={11} />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11.5px] mono mb-1.5">
                    <span>{formatMinor(used)}</span>
                    <span className="faint">of {formatMinor(b.limit)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: pct >= 100 ? "var(--bad)" : pct >= 75 ? "var(--warn)" : "var(--good)" }}
                    />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
