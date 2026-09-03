import { useState } from "react";
import { Check, X } from "lucide-react";
import { useStore } from "../../../lib/store";
import { short } from "../../../lib/hash";
import { Badge, Button, Empty, Panel, PanelHeader, SectionTitle } from "../../../components/ui/primitives";
import TreasuryTabs from "../../../components/treasury/TreasuryTabs";
import ExecutionRequestCard, { formatMinor } from "../../../components/treasury/ExecutionRequestCard";

export default function PaymentRequestsPage() {
  const { dbUser, deployments, paymentRequests, createTreasuryPaymentRequest, approveTreasuryPaymentRequest, rejectTreasuryPaymentRequest } = useStore();
  const deployment = deployments.find((d) => d.status === "ACTIVE" || d.status === "active");

  const [reqRecipient, setReqRecipient] = useState("");
  const [reqAsset, setReqAsset] = useState("USDC");
  const [reqAmount, setReqAmount] = useState("25");
  const [reqReason, setReqReason] = useState("Invoice payment");
  const [reqError, setReqError] = useState<string | null>(null);

  if (!dbUser) return <Empty title="Connect your wallet" hint="Payment requests require a connected wallet" />;
  if (!deployment) return <Empty title="No active agent deployment" hint="Deploy the Treasury Agent from the marketplace first" />;

  const handleCreateRequest = () => {
    setReqError(null);
    try {
      createTreasuryPaymentRequest(deployment.id, reqRecipient, reqAsset, Math.round(Number(reqAmount) * 1_000_000), reqReason);
      setReqRecipient("");
    } catch (e: any) {
      setReqError(e?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Treasury automation"
        title="Payment requests"
        sub="A payment request never authorizes itself — approving one still runs the full current policy check, exactly like any other transfer."
      />

      <TreasuryTabs />

      <Panel edge>
        <div className="font-display text-[14px] font-semibold mb-1">Create a payment request</div>
        <p className="text-[11.5px] faint mb-4">An approved recipient can request a payment, but your policy still decides.</p>
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

      <Panel padded={false} edge>
        <PanelHeader title="Requests" sub={`${paymentRequests.length} total`} />
        {paymentRequests.length === 0 ? (
          <Empty title="No payment requests yet" hint="Create one above" />
        ) : (
          <div>
            {paymentRequests.map((r) => (
              <div key={r.id} className="p-4 border-b last:border-0 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
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
        )}
      </Panel>
    </div>
  );
}
