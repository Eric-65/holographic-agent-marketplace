import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, RotateCcw, Save } from "lucide-react";
import { poseidonish, short } from "../lib/hash";
import { usd } from "../lib/format";
import { ACTION_LABEL } from "../lib/format";
import type { ActionKind, Agent, AssetSymbol, PolicyDocument, Venue } from "../lib/types";
import { Badge, Button, Panel, PanelHeader } from "./ui/primitives";

const ALL_ASSETS: AssetSymbol[] = ["USDC", "STRK", "strkBTC", "ETH"];
const ALL_VENUES: Venue[] = ["AVNU", "Ekubo", "Vesu", "Troves", "STRK20 Pool"];

export default function PolicyEditor({
  agent,
  value,
  onChange,
  onSave,
  onReset,
  dirty,
}: {
  agent: Agent;
  value: PolicyDocument;
  onChange: (next: PolicyDocument) => void;
  onSave?: () => void;
  onReset?: () => void;
  dirty?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const hash = useMemo(() => poseidonish(value), [value]);

  const set = <K extends keyof PolicyDocument>(k: K, v: PolicyDocument[K]) =>
    onChange({ ...value, [k]: v });

  const toggleList = <T,>(k: keyof PolicyDocument, item: T) => {
    const list = value[k] as unknown as T[];
    onChange({
      ...value,
      [k]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item],
    } as PolicyDocument);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const surfaceViolation = value.allowedActions.some(
    (a) => !agent.actionSurface.includes(a),
  );

  return (
    <Panel padded={false} edge>
      <PanelHeader
        title="Policy document"
        sub={`v${value.version} · deterministic ruleset bound to ${agent.name}`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="mono text-[10.5px] chip px-2 py-1 faint inline-flex items-center gap-1.5 hover:text-[var(--text)]"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />} {short(hash, 8, 4)}
            </button>
          </div>
        }
      />

      <div className="p-5 space-y-6">
        <Fieldset
          label="Allowed actions"
          note="Subset of the agent's declared action surface. Anything outside is rejected at R03."
        >
          {agent.actionSurface.map((a) => (
            <Chip
              key={a}
              on={value.allowedActions.includes(a)}
              onClick={() => toggleList<ActionKind>("allowedActions", a)}
            >
              {ACTION_LABEL[a]}
            </Chip>
          ))}
        </Fieldset>

        <Fieldset label="Asset scope" note="Rule R04.">
          {ALL_ASSETS.map((a) => (
            <Chip
              key={a}
              on={value.assetScope.includes(a)}
              muted={!agent.assets.includes(a)}
              onClick={() => toggleList<AssetSymbol>("assetScope", a)}
            >
              {a}
            </Chip>
          ))}
        </Fieldset>

        <Fieldset label="Venue allowlist" note="Rule R05.">
          {ALL_VENUES.map((v) => (
            <Chip
              key={v}
              on={value.venueAllowlist.includes(v)}
              muted={!agent.venues.includes(v)}
              onClick={() => toggleList<Venue>("venueAllowlist", v)}
            >
              {v}
            </Chip>
          ))}
        </Fieldset>

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
          <Range label="Per-action cap" rule="R06" value={value.perActionCapUsd} min={500} max={100000} step={500}
            fmt={(v) => usd(v)} onChange={(v) => set("perActionCapUsd", v)} />
          <Range label="Rolling 24h cap" rule="R07" value={value.dailyCapUsd} min={1000} max={500000} step={1000}
            fmt={(v) => usd(v)} onChange={(v) => set("dailyCapUsd", v)} />
          <Range label="Cooldown" rule="R08" value={value.cooldownSeconds} min={0} max={7200} step={30}
            fmt={(v) => (v >= 3600 ? `${(v / 3600).toFixed(1)}h` : v >= 60 ? `${Math.round(v / 60)}m` : `${v}s`)}
            onChange={(v) => set("cooldownSeconds", v)} />
          <Range label="Max slippage" rule="R09" value={value.maxSlippageBps} min={5} max={500} step={5}
            fmt={(v) => `${v} bps`} onChange={(v) => set("maxSlippageBps", v)} />
          <Range label="Confirmation threshold" rule="soft band" value={value.confirmAboveUsd} min={0} max={100000} step={1000}
            fmt={(v) => (v === 0 ? "disabled" : `> ${usd(v)}`)} onChange={(v) => set("confirmAboveUsd", v)} />
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[12px] dim">Counterparty deny list</span>
              <span className="mono text-[10px] faint">R10</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {value.counterpartyDenyList.map((c) => (
                <span key={c} className="mono text-[10.5px] px-2 py-[3px] rounded chip" style={{ color: "var(--bad)" }}>
                  {c}
                </span>
              ))}
              {value.counterpartyDenyList.length === 0 && (
                <span className="text-[11.5px] faint">No denied counterparties</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Chip on={value.requireDisclosureReceipt} onClick={() => set("requireDisclosureReceipt", !value.requireDisclosureReceipt)}>
            Disclosure-ready receipts
          </Chip>
          <Chip danger on={value.killSwitch} onClick={() => set("killSwitch", !value.killSwitch)}>
            Kill switch
          </Chip>
        </div>

        {surfaceViolation && (
          <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
            style={{ background: "color-mix(in oklab, var(--warn) 10%, transparent)", border: "1px solid color-mix(in oklab, var(--warn) 28%, transparent)" }}>
            <AlertTriangle size={14} style={{ color: "var(--warn)", marginTop: 1 }} />
            <p className="text-[12px] dim">
              Policy allows an action outside the agent's registered surface. The registry check at
              R02 will reject these intents.
            </p>
          </div>
        )}

        {(onSave || onReset) && (
          <div className="flex items-center gap-2 pt-1">
            {onSave && (
              <Button variant="primary" onClick={onSave} disabled={!dirty}>
                <Save size={13} /> {dirty ? "Save & promote version" : "No changes"}
              </Button>
            )}
            {onReset && (
              <Button variant="outline" onClick={onReset} disabled={!dirty}>
                <RotateCcw size={13} /> Revert
              </Button>
            )}
            {dirty && <Badge tone="warn">unsaved</Badge>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Fieldset({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] dim">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {note && <p className="text-[11px] faint mt-2">{note}</p>}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  danger,
  muted,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  muted?: boolean;
}) {
  const c = danger ? "var(--bad)" : "var(--accent)";
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-[5px] rounded-md text-[11.5px] transition-all border"
      style={{
        borderColor: on ? `color-mix(in oklab, ${c} 45%, transparent)` : "var(--border)",
        background: on ? `color-mix(in oklab, ${c} 13%, transparent)` : "transparent",
        color: on ? "var(--text)" : muted ? "color-mix(in oklab, var(--text-faint) 65%, transparent)" : "var(--text-faint)",
      }}
    >
      {children}
    </button>
  );
}

function Range({
  label, rule, value, min, max, step, fmt, onChange,
}: {
  label: string; rule: string; value: number; min: number; max: number; step: number;
  fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] dim">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="mono text-[12px]">{fmt(value)}</span>
          <span className="mono text-[10px] faint">{rule}</span>
        </span>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
