import { useState } from "react";
import { Bell, Database, KeyRound, Moon, Palette, ShieldAlert, Sun, Trash2 } from "lucide-react";
import { useStore } from "../../lib/store";
import { PRIVACY_BACKEND, getPrivacyProvider } from "../../lib/privacy";
import { ENGINE_VERSION } from "../../lib/policy/engine";
import { chainLabel } from "../../lib/wallet/useWallet";
import { short } from "../../lib/hash";
import PrivacyStatus from "../../components/PrivacyStatus";
import { Link } from "../router";
import { Badge, Button, KeyValue, Panel, PanelHeader, SectionTitle } from "../../components/ui/primitives";

export default function SettingsPage() {
  const { theme, toggleTheme, wallet, diagnostic, agents, setAgentRuntime } = useStore();
  const [notifications, setNotifications] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [telemetry, setTelemetry] = useState(false);
  const provider = getPrivacyProvider();

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Configuration"
        title="Settings"
        sub="Account, privacy boundary, engine parity and global safety controls."
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
        <div className="space-y-3">
          <Panel padded={false}>
            <PanelHeader title="Account" sub="Your Starknet address is your identity — no email, no profile" />
            <div className="p-5">
              <KeyValue k="Address" v={wallet.address ? short(wallet.address, 16, 8) : "not connected"} />
              <KeyValue k="Wallet" v={wallet.walletName ?? "—"} />
              <KeyValue k="Network" v={chainLabel(wallet.chainId)} />
              <KeyValue k="Session" v={wallet.status === "connected" ? "active · scoped JWT" : "none"} />
              <KeyValue k="Signing authority" v={<span style={{ color: "var(--good)" }}>wallet only</span>} />
            </div>
          </Panel>

          <Panel padded={false}>
            <PanelHeader title="Appearance" sub="Persisted to localStorage" />
            <div className="p-5 space-y-4">
              <ToggleRow
                icon={theme === "dark" ? Moon : Sun}
                title="Theme"
                desc={`Currently ${theme}. All colour tokens are CSS variables.`}
                right={
                  <Button variant="outline" size="sm" onClick={toggleTheme}>
                    <Palette size={12} /> Switch to {theme === "dark" ? "light" : "dark"}
                  </Button>
                }
              />
            </div>
          </Panel>

          <Panel padded={false}>
            <PanelHeader
              title="Treasury automation"
              sub="Emergency triggers, pause-all, and the new-recipient review queue"
              right={
                <Link href="/settings/automation">
                  <Button variant="outline" size="sm">
                    Open →
                  </Button>
                </Link>
              }
            />
          </Panel>

          <Panel padded={false}>
            <PanelHeader title="Safety" sub="Global controls that override every binding" />
            <div className="p-5 space-y-4">
              <ToggleRow
                icon={Bell}
                title="Approval notifications"
                desc="Alert when an intent lands in the confirmation band."
                right={<Switch on={notifications} onClick={() => setNotifications((v) => !v)} />}
              />
              <ToggleRow
                icon={ShieldAlert}
                title="Auto-confirm soft band"
                desc="Not recommended. Removes the human gate for REQUIRE_USER_CONFIRMATION verdicts."
                right={<Switch on={autoConfirm} onClick={() => setAutoConfirm((v) => !v)} danger />}
              />
              <ToggleRow
                icon={Database}
                title="Anonymous telemetry"
                desc="Off by default. Execution routes are never instrumented, in any configuration."
                right={<Switch on={telemetry} onClick={() => setTelemetry((v) => !v)} />}
              />
              <div
                className="rounded-lg p-4"
                style={{
                  background: "color-mix(in oklab, var(--bad) 8%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--bad) 26%, transparent)",
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[12.5px] font-medium" style={{ color: "var(--bad)" }}>
                      Global circuit breaker
                    </div>
                    <div className="text-[11.5px] dim mt-0.5">
                      Pauses every binding immediately. Existing in-flight wallet requests are not
                      recalled — they are already outside our control.
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => agents.forEach((a) => setAgentRuntime(a.id, "paused"))}
                  >
                    Halt all agents
                  </Button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel padded={false}>
            <PanelHeader title="Data" sub="What this application stores about you" />
            <div className="p-5">
              <div className="grid sm:grid-cols-2 gap-x-8">
                <div>
                  <Label>Stored</Label>
                  {["Address & session", "Policy documents + hashes", "Intent hashes", "Verdict traces", "Receipt metadata", "Notional buckets"].map((s) => (
                    <div key={s} className="text-[12px] dim py-[3px]">
                      · {s}
                    </div>
                  ))}
                </div>
                <div>
                  <Label>Never stored</Label>
                  {["Viewing keys", "Note data", "Exact private amounts", "Counterparty identities", "Proof witnesses", "Shielded balances"].map((s) => (
                    <div key={s} className="text-[12px] py-[3px]" style={{ color: "var(--bad)" }}>
                      · {s}
                    </div>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-5">
                <Trash2 size={12} /> Purge local session data
              </Button>
            </div>
          </Panel>
        </div>

        <div className="space-y-3">
          <PrivacyStatus wallet={wallet} diagnostic={diagnostic} variant="panel" />

          <Panel>
            <div className="flex items-center gap-2 mb-3">
              <KeyRound size={14} style={{ color: "var(--accent)" }} />
              <span className="font-display text-[14px] font-semibold tracking-tight">
                Integration boundary
              </span>
            </div>
            <KeyValue k="Provider" v={provider.id} />
            <KeyValue k="Backend flag" v={PRIVACY_BACKEND} />
            <KeyValue k="Engine" v={`v${ENGINE_VERSION}`} />
            <KeyValue k="Parity" v={<span style={{ color: "var(--good)" }}>browser = server</span>} />
            <p className="text-[11.5px] faint mt-4 leading-relaxed">
              Swapping <span className="mono">PRIVACY_BACKEND</span> to{" "}
              <span className="mono">"strk20"</span> routes every execution through the STRK20
              Privacy Wallet API. No component above the provider interface changes.
            </p>
            <div className="mt-3">
              <Badge tone="warn">mock layer active</Badge>
            </div>
          </Panel>

          <Panel>
            <div className="font-display text-[14px] font-semibold tracking-tight mb-3">
              Contracts
            </div>
            {[
              ["AgentRegistry", "0x0512…a8c1"],
              ["PolicyCommitment", "0x03fd…7b20"],
              ["ExecutionAttestor", "0x0791…c4de"],
              ["HolographicAnonymizer", "not deployed"],
            ].map(([k, v]) => (
              <KeyValue key={k} k={k} v={v} />
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-[10px] uppercase tracking-[0.16em] faint mb-2">{children}</div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  desc,
  right,
}: {
  icon: typeof Bell;
  title: string;
  desc: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <Icon size={14} className="faint mt-[2px] shrink-0" />
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium">{title}</div>
          <div className="text-[11.5px] faint leading-relaxed">{desc}</div>
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function Switch({ on, onClick, danger }: { on: boolean; onClick: () => void; danger?: boolean }) {
  const c = danger ? "var(--bad)" : "var(--accent-3)";
  return (
    <button
      onClick={onClick}
      className="h-[20px] w-[36px] rounded-full relative transition-all"
      style={{
        background: on ? `color-mix(in oklab, ${c} 55%, transparent)` : "var(--track)",
        border: `1px solid ${on ? `color-mix(in oklab, ${c} 60%, transparent)` : "var(--border)"}`,
      }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all"
        style={{ left: on ? 18 : 2, background: on ? c : "var(--text-faint)" }}
      />
    </button>
  );
}
