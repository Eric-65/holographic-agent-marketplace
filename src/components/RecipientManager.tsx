import { useState } from "react";
import { useStore } from "../lib/store";
import { short } from "../lib/hash";
import { Button, Badge, Panel, PanelHeader } from "./ui/primitives";
import { Plus, Trash2, Power, PowerOff } from "lucide-react";

export default function RecipientManager({ policyId, policyLabel }: { policyId: string; policyLabel: string }) {
  const { recipients, addApprovedRecipient, removeApprovedRecipient, toggleRecipient } = useStore();
  const list = recipients.filter((r) => r.policyId === policyId);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [asset, setAsset] = useState("USDC");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    setError(null);
    try {
      if (!name || !address) throw new Error("Name and address required");
      addApprovedRecipient(policyId, name, address, asset);
      setName("");
      setAddress("");
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  return (
    <Panel padded={false}>
      <PanelHeader
        title={`Recipients — ${policyLabel}`}
        sub={`Policy ${short(policyId, 8, 4)} · ${list.filter((r) => r.active).length} active / ${list.length} total`}
      />
      <div className="p-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_1.5fr_100px_auto] gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor name"
            className="h-9 px-3 rounded-lg surface text-[12.5px] outline-none"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="h-9 px-3 rounded-lg surface text-[12.5px] mono outline-none"
          />
          <select value={asset} onChange={(e) => setAsset(e.target.value)} className="h-9 px-2 rounded-lg surface text-[12px] outline-none">
            <option value="USDC">USDC</option>
            <option value="STRK">STRK</option>
            <option value="ETH">ETH</option>
          </select>
          <Button variant="primary" size="sm" onClick={handleAdd}>
            <Plus size={12} /> Add
          </Button>
        </div>
        {error && (
          <div className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
            {error}
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-[12px] faint">No approved recipients — add a vendor to allow payments</div>
        ) : (
          <div className="space-y-1.5">
            {list.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: r.active ? "var(--track)" : "color-mix(in oklab, var(--text-faint) 8%, transparent)", opacity: r.active ? 1 : 0.6 }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{r.name} <span className="faint">· {r.asset}</span></div>
                  <div className="mono text-[10.5px] faint truncate">{short(r.address, 10, 6)} · {new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
                <Badge tone={r.active ? "good" : "neutral"}>{r.active ? "active" : "disabled"}</Badge>
                <button
                  onClick={() => toggleRecipient(r.id, !r.active)}
                  className="h-7 w-7 grid place-items-center rounded-lg surface hover:surface-2"
                  title={r.active ? "Disable" : "Enable"}
                >
                  {r.active ? <PowerOff size={12} /> : <Power size={12} />}
                </button>
                <button
                  onClick={() => removeApprovedRecipient(r.id)}
                  className="h-7 w-7 grid place-items-center rounded-lg hover:bg-[color-mix(in_oklab,var(--bad)_12%,transparent)]"
                  style={{ color: "var(--bad)" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="text-[10.5px] faint">
          An agent cannot send to a recipient outside the active allowlist — enforced at policy R10 / E_RECIPIENT_NOT_APPROVED.
        </div>
      </div>
    </Panel>
  );
}
