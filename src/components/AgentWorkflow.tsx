import { Bot, ShieldCheck, UserCheck, Wallet, Lock, FileCheck2 } from "lucide-react";

export default function AgentWorkflow() {
  const steps = [
    { icon: Bot, label: "Agent proposal", desc: "Structured intent, LLM may propose reason but never decides" },
    { icon: ShieldCheck, label: "Policy engine", desc: "Deterministic, default deny, integer-safe, rule trace" },
    { icon: UserCheck, label: "Approval if required", desc: "$500 auto, $500-2000 human approval, >$2000 blocked" },
    { icon: Wallet, label: "Wallet", desc: "User's wallet remains signer, no app-owned keys" },
    { icon: Lock, label: "STRK20", desc: "Private transfer via wallet_strk20InvokeTransaction" },
    { icon: FileCheck2, label: "Receipt", desc: "Non-sensitive metadata only, DEMO vs STRK20" },
  ];

  return (
    <div className="surface rounded-xl p-5">
      <div className="font-display text-[14px] font-semibold tracking-tight mb-4">Execution workflow — clearest explanation</div>
      <div className="space-y-0">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="h-7 w-7 rounded-lg grid place-items-center surface-2">
                  <Icon size={13} style={{ color: "var(--accent-3)" }} />
                </span>
                {i < steps.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} />}
              </div>
              <div className="pb-4 min-w-0">
                <div className="text-[12.5px] font-medium">{s.label}</div>
                <div className="text-[11px] faint leading-relaxed">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[10.5px] faint mono">Agents propose. Policy decides. Wallet executes.</div>
    </div>
  );
}
