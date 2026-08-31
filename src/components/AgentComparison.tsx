import { useStore } from "../lib/store";
import { Panel, PanelHeader } from "./ui/primitives";
import { X } from "lucide-react";
import type { DbAgent } from "../lib/db/schema";
import { calculateTelemetry } from "../lib/agents/metrics";

export default function AgentComparison({ selectedIds, onRemove }: { selectedIds: string[]; onRemove: (id: string) => void }) {
  const { dbAgents } = useStore();
  const agents = selectedIds.map((id) => dbAgents.find((a) => a.id === id) ?? null).filter(Boolean) as DbAgent[];

  if (agents.length === 0) return null;

  const rows: { label: string; get: (agent: DbAgent) => string }[] = [
    { label: "Purpose", get: (a) => a.description.slice(0, 80) },
    { label: "Capabilities", get: (a) => a.capabilities.join(", ") },
    { label: "Assets", get: (a) => a.supportedAssets.join(", ") },
    { label: "Risk", get: (a) => a.riskLevel },
    { label: "Policies", get: (a) => `${a.category} — max ${a.manifest?.policyRequirements.maxTransactionAmount ?? "—"}` },
    { label: "Privacy", get: (a) => (a.privacySupport ? "STRK20" : "No") },
    { label: "Verification", get: (a) => a.verificationStatus },
    { label: "Version", get: (a) => a.version },
    {
      label: "Operational metrics",
      get: (a) => {
        const tel = calculateTelemetry(a.id);
        return `Exec ${tel.intentCount} · Success ${tel.completed} · Blocked ${tel.blocked} · Approval ${tel.humanApprovals}`;
      },
    },
  ];

  return (
    <Panel padded={false} edge>
      <PanelHeader title={`Agent comparison — ${agents.length} agents`} sub="Compare up to 3 agents: Purpose, Capabilities, Assets, Risk, Policies, Privacy, Verification, Version, Operational metrics" />
      <div className="p-5 overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr>
              <th className="text-left faint font-normal uppercase text-[10px] p-2">Field</th>
              {agents.map((a) => (
                <th key={a.id} className="text-left p-2 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <button onClick={() => onRemove(a.id)} className="h-5 w-5 grid place-items-center rounded hover:bg-[var(--track)]">
                      <X size={10} />
                    </button>
                  </div>
                  <div className="faint text-[10px]">{a.deploymentStatus}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-2 faint font-medium">{row.label}</td>
                {agents.map((a) => (
                  <td key={`${a.id}-${row.label}`} className="p-2 dim">
                    {row.get(a)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
