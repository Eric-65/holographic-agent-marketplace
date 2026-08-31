import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useStore } from "../../../lib/store";
import { summarizeBatch } from "../../../lib/api/batches";
import { short } from "../../../lib/hash";
import { Badge, Button, Empty, Panel, PanelHeader, SectionTitle } from "../../../components/ui/primitives";
import TreasuryTabs from "../../../components/treasury/TreasuryTabs";
import ExecutionRequestCard, { formatMinor } from "../../../components/treasury/ExecutionRequestCard";
import type { BatchItemInput } from "../../../lib/api/batches";

const USDC = 1_000_000;

interface DraftRow {
  recipient: string;
  asset: string;
  amount: string;
  reason: string;
}

export default function PaymentsPage() {
  const { dbUser, deployments, budgets, batches, paymentRequests, createPaymentBatch, cancelPaymentBatch, createTreasuryPaymentRequest, approveTreasuryPaymentRequest, rejectTreasuryPaymentRequest } = useStore();
  const deployment = deployments.find((d) => d.status === "ACTIVE" || d.status === "active");

  const [rows, setRows] = useState<DraftRow[]>([{ recipient: "", asset: "USDC", amount: "10", reason: "Contractor payment" }]);
  const [batchName, setBatchName] = useState("Contractor payouts");
  const [batchBudgetId, setBatchBudgetId] = useState("");
  const [batchError, setBatchError] = useState<string | null>(null);

  const [reqRecipient, setReqRecipient] = useState("");
  const [reqAsset, setReqAsset] = useState("USDC");
  const [reqAmount, setReqAmount] = useState("25");
  const [reqReason, setReqReason] = useState("Invoice payment");
  const [reqError, setReqError] = useState<string | null>(null);

  if (!dbUser) return <Empty title="Connect your wallet" hint="Payment batches and requests require a connected wallet" />;
  if (!deployment) return <Empty title="No active agent deployment" hint="Deploy the Treasury Agent from the marketplace first" />;

  const addRow = () => setRows((r) => [...r, { recipient: "", asset: "USDC", amount: "10", reason: "" }]);
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<DraftRow>) => setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handlePrepareBatch = () => {
    setBatchError(null);
    try {
      const items: BatchItemInput[] = rows
        .filter((r) => r.recipient && r.amount)
        .map((r) => ({ recipient: r.recipient, asset: r.asset, amount: Math.round(Number(r.amount) * USDC), reason: r.reason || batchName }));
      createPaymentBatch(deployment.id, batchName, items, batchBudgetId || undefined);
      setRows([{ recipient: "", asset: "USDC", amount: "10", reason: "Contractor payment" }]);
    } catch (e: any) {
      setBatchError(e?.message ?? String(e));
    }
  };

  const handleCreateRequest = () => {
    setReqError(null);
    try {
      createTreasuryPaymentRequest(deployment.id, reqRecipient, reqAsset, Math.round(Number(reqAmount) * USDC), reqReason);
      setReqRecipient("");
    } catch (e: any) {
      setReqError(e?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Treasury automation"
        title="Payments"
        sub="Batch multiple payments for one review, or let an approved recipient request a payment — the sender's policy always has the final word."
      />

      <TreasuryTabs />

      {/* Batch builder */}
      <Panel edge>
        <div className="font-display text-[14px] font-semibold mb-1">Prepare a payment batch</div>
        <p className="text-[11.5px] faint mb-4">Each row becomes its own policy- and budget-checked execution request. Nothing is signed until you authorize each one individually.</p>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Batch name" className="h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          <select value={batchBudgetId} onChange={(e) => setBatchBudgetId(e.target.value)} className="h-9 px-3 rounded-lg surface text-[13px] outline-none">
            <option value="">No linked budget</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_90px_100px_1fr_auto] gap-2 items-center">
              <input value={row.recipient} onChange={(e) => updateRow(idx, { recipient: e.target.value })} placeholder="0x recipient" className="h-8 px-2.5 rounded-lg surface text-[12px] mono outline-none" />
              <select value={row.asset} onChange={(e) => updateRow(idx, { asset: e.target.value })} className="h-8 px-2 rounded-lg surface text-[12px] outline-none">
                <option>USDC</option>
                <option>STRK</option>
                <option>ETH</option>
              </select>
              <input value={row.amount} onChange={(e) => updateRow(idx, { amount: e.target.value })} type="number" min="0" step="0.01" className="h-8 px-2.5 rounded-lg surface text-[12px] outline-none" />
              <input value={row.reason} onChange={(e) => updateRow(idx, { reason: e.target.value })} placeholder="Reason" className="h-8 px-2.5 rounded-lg surface text-[12px] outline-none" />
              <button onClick={() => removeRow(idx)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-[var(--track)]" disabled={rows.length === 1}>
                <Trash2 size={13} className="faint" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus size={12} /> Add row
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrepareBatch}>
            Prepare batch
          </Button>
        </div>
        {batchError && <div className="text-[11.5px] mt-2" style={{ color: "var(--bad)" }}>{batchError}</div>}
      </Panel>

      {/* Batch review list */}
      {batches.length > 0 && (
        <Panel padded={false} edge>
          <PanelHeader title="Batch review" sub={`${batches.length} batch(es)`} />
          <div>
            {batches.map((batch) => {
              const summary = summarizeBatch(batch);
              return (
                <div key={batch.id} className="p-4 border-b last:border-0 space-y-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium">{batch.name}</div>
                      <div className="text-[11px] faint">{new Date(batch.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="neutral">{batch.status}</Badge>
                      {(batch.status === "DRAFT" || batch.status === "REVIEWED") && (
                        <Button variant="danger" size="sm" onClick={() => cancelPaymentBatch(batch.id)}>
                          <X size={11} />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 text-[11.5px] mono">
                    <span>{summary.total} payments</span>
                    <span style={{ color: "var(--good)" }}>{summary.approved} approved</span>
                    <span style={{ color: "var(--warn)" }}>{summary.requiresApproval} require approval</span>
                    <span style={{ color: "var(--bad)" }}>{summary.blocked} blocked</span>
                  </div>

                  <div className="space-y-2">
                    {batch.items.map((item) =>
                      item.status === "BLOCKED" ? (
                        <div key={item.id} className="rounded-lg px-3 py-2 text-[11px] mono" style={{ background: "color-mix(in oklab, var(--bad) 8%, transparent)", color: "var(--bad)" }}>
                          {short(item.recipient, 8, 4)} — BLOCKED: {item.blockedReason}
                        </div>
                      ) : item.executionRequestId ? (
                        <ExecutionRequestCard key={item.id} requestId={item.executionRequestId} label={item.reason} />
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Payment requests */}
      <Panel edge>
        <div className="font-display text-[14px] font-semibold mb-1">Create a payment request</div>
        <p className="text-[11.5px] faint mb-4">A recipient can request a payment, but your policy still decides — approving still runs the full policy check.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={reqRecipient} onChange={(e) => setReqRecipient(e.target.value)} placeholder="0x recipient" className="h-9 px-3 rounded-lg surface text-[13px] mono outline-none" />
          <select value={reqAsset} onChange={(e) => setReqAsset(e.target.value)} className="h-9 px-3 rounded-lg surface text-[13px] outline-none">
            <option>USDC</option>
            <option>STRK</option>
            <option>ETH</option>
          </select>
          <input value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} type="number" min="0" step="0.01" className="h-9 px-3 rounded-lg surface text-[13px] outline-none" />
          <input value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Reason" className="h-9 px-3 rounded-lg surface text-[13px] outline-none" />
        </div>
        {reqError && <div className="text-[11.5px] mt-2" style={{ color: "var(--bad)" }}>{reqError}</div>}
        <Button variant="primary" size="sm" className="mt-3" onClick={handleCreateRequest} disabled={!reqRecipient || !reqAmount}>
          Create request
        </Button>
      </Panel>

      {paymentRequests.length > 0 && (
        <Panel padded={false} edge>
          <PanelHeader title="Payment requests" sub={`${paymentRequests.length} total`} />
          <div>
            {paymentRequests.map((r) => (
              <div key={r.id} className="p-4 border-b last:border-0 flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate">{r.reason}</div>
                  <div className="mono text-[11px] faint">
                    {formatMinor(r.amount)} {r.asset} → {short(r.recipientAddress, 8, 4)}
                  </div>
                  {r.executionRequestId && r.status === "APPROVED" && <div className="mt-2"><ExecutionRequestCard requestId={r.executionRequestId} /></div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge tone={r.status === "APPROVED" ? "good" : r.status === "REJECTED" || r.status === "EXPIRED" ? "bad" : "warn"}>{r.status}</Badge>
                  {r.status === "PENDING" && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => approveTreasuryPaymentRequest(r.id)}>
                        <Check size={11} />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => rejectTreasuryPaymentRequest(r.id)}>
                        <X size={11} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
