import { useMemo, useState } from "react";
import { Download, Filter } from "lucide-react";
import { useStore } from "../../lib/store";
import ActivitySummary from "../../components/ActivitySummary";
import ExecutionReceipt from "../../components/ExecutionReceipt";
import { Button, Empty, Panel, PanelHeader, SectionTitle, Badge } from "../../components/ui/primitives";
import { short } from "../../lib/hash";
import { datetime } from "../../lib/format";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "blocked", label: "Blocked" },
  { key: "awaiting_confirmation", label: "Pending Approval" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

export default function ActivityPage() {
  const { receipts, dbReceipts, executionRequests, agents, dbUser } = useStore();
  const [status, setStatus] = useState<string>("all");
  const [agentId, setAgentId] = useState<string>("all");

  // Use persisted receipts if user has them, else fallback to mock for demo
  const persistedReceipts = dbUser ? dbReceipts : [];
  const allReceipts = persistedReceipts.length > 0 ? persistedReceipts : [];

  // Combine with legacy receipts for backward compat when no DB
  const legacyList = useMemo(
    () =>
      receipts.filter(
        (r) => (status === "all" || r.status === status || (status === "approved" && r.status === "executed") || (status === "completed" && r.status === "executed")) && (agentId === "all" || r.agentId === agentId),
      ),
    [receipts, status, agentId],
  );

  const dbList = useMemo(() => {
    return allReceipts.filter((r) => {
      if (status === "all") return true;
      if (status === "approved") return r.status === "executed" || r.status === "completed";
      if (status === "blocked") return r.status === "blocked";
      if (status === "awaiting_confirmation") return r.status === "awaiting_confirmation";
      if (status === "completed") return r.status === "executed" || r.status === "completed";
      if (status === "failed") return r.status === "failed" || r.status === "reverted";
      return true;
    }).filter((r) => agentId === "all" || r.agentId === agentId);
  }, [allReceipts, status, agentId]);

  const executionList = useMemo(() => {
    return executionRequests.filter((req) => {
      if (status === "all") return true;
      return req.status === status || (status === "approved" && req.status === "approved") || (status === "blocked" && req.status === "blocked");
    }).filter((r) => agentId === "all" || r.intent.agentId === agentId);
  }, [executionRequests, status, agentId]);

  const useDb = dbUser && (dbList.length > 0 || executionList.length > 0);

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Audit"
        title="Activity"
        sub="Persisted execution requests, results, and receipts. Every agent cycle produces a receipt — including blocked. Receipts carry hashes and coarse buckets, never viewing keys or private notes."
        right={
          <Button variant="outline" size="sm">
            <Download size={13} /> Export signed bundle
          </Button>
        }
      />

      <ActivitySummary receipts={receipts} />

      <Panel padded={false}>
        <PanelHeader
          title={useDb ? "Receipt ledger (persisted)" : "Receipt ledger (mock fallback)"}
          sub={`${useDb ? dbList.length : legacyList.length} of ${useDb ? allReceipts.length : receipts.length} receipts · ${executionList.length} execution requests`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Filter size={12} className="faint" />
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="h-7 px-2 rounded-md surface text-[11.5px] outline-none"
              >
                <option value="all">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatus(f.key)}
                  className="px-2.5 h-7 rounded-md text-[11.5px] transition-all"
                  style={{
                    background: status === f.key ? "var(--track)" : "transparent",
                    color: status === f.key ? "var(--text)" : "var(--text-faint)",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        />
        {useDb ? (
          dbList.length === 0 && executionList.length === 0 ? (
            <Empty title="No persisted activity yet." hint="Deploy Treasury Agent and execute a private payment to generate activity." />
          ) : (
            <div>
              {/* Execution requests */}
              {executionList.map((req) => (
                <div key={req.id} className="border-b last:border-0 px-5 py-3 flex items-center justify-between gap-4" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium truncate">
                      {req.intent.action} · {req.intent.asset} · {req.intent.amount} minor units
                      <span className="faint"> · {req.intent.reason}</span>
                    </div>
                    <div className="mono text-[10.5px] faint truncate">
                      {short(req.id, 8, 4)} · agent {req.intent.agentId} · policy {short(req.policyId, 8, 4)} · {req.verdict?.allowed ? "APPROVE" : "REJECT"} {req.requiresHumanApproval ? "· requires human" : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge tone={req.status === "blocked" ? "bad" : req.status === "awaiting_confirmation" ? "warn" : req.status === "executed" ? "good" : "neutral"}>
                      {req.status}
                    </Badge>
                    <div className="mono text-[10.5px] faint mt-1">{datetime(req.createdAt)}</div>
                  </div>
                </div>
              ))}
              {/* Receipts */}
              {dbList.map((r) => (
                <div key={r.id} className="border-b last:border-0 px-5 py-3 flex items-center justify-between gap-4" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium truncate">
                      {r.agentId} · {r.bucket}
                      <span className="faint"> · {short(r.intentHash, 8, 4)}</span>
                    </div>
                    <div className="mono text-[10.5px] faint truncate">
                      {r.id} · policy {short(r.policyId, 8, 4)} · tx {short(r.txHash, 8, 4)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <Badge tone={r.isDemo ? "warn" : "good"}>{r.isDemo ? "DEMO RECEIPT" : "STRK20 EXECUTION"}</Badge>
                    <Badge tone={r.status === "executed" ? "good" : r.status === "blocked" ? "bad" : "warn"}>{r.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : legacyList.length === 0 ? (
          <Empty title="No receipts match this filter." />
        ) : (
          <div>
            {legacyList.map((r) => (
              <ExecutionReceipt key={r.id} receipt={r} />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          ["What a receipt proves", "That a specific intent was evaluated against a specific policy version and produced a specific verdict, and — when executed — that a STARK proof was verified on-chain. Stored only as non-sensitive metadata."],
          ["What it deliberately omits", "Exact private amounts beyond bucket, viewing keys, note data, proof witnesses, private counterparty info beyond allowlist."],
          ["How to re-verify", "Recompute trace hash by replaying intent hash against committed policy hash with same engine version. Any divergence invalidates receipt."],
        ].map(([t, d]) => (
          <Panel key={t}>
            <div className="font-display text-[13.5px] font-semibold tracking-tight mb-2">{t}</div>
            <p className="text-[12px] dim leading-relaxed">{d}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
