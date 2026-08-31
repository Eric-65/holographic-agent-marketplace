import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Panel({
  children,
  className = "",
  edge = false,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  edge?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={`surface rounded-xl ${edge ? "holo-edge" : ""} ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <div className="font-display text-[14px] font-semibold tracking-tight">{title}</div>
        {sub && <div className="text-[12px] faint mt-0.5">{sub}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && (
          <div className="mono text-[10px] tracking-[0.18em] uppercase faint mb-2">{eyebrow}</div>
        )}
        <h1 className="font-display text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight">
          {title}
        </h1>
        {sub && <p className="text-[13px] dim mt-2 max-w-2xl leading-relaxed">{sub}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "accent" | "cyan";

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text-faint)",
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  accent: "var(--accent)",
  cyan: "var(--accent-3)",
};

export function Badge({
  children,
  tone = "neutral",
  mono = true,
}: {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
}) {
  const c = TONE_COLOR[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[10.5px] leading-none ${mono ? "mono" : ""}`}
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 13%, transparent)`,
        border: `1px solid color-mix(in oklab, ${c} 30%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-[6px] w-[6px] rounded-full shrink-0 ${pulse ? "pulse-dot" : ""}`}
      style={{ background: TONE_COLOR[tone], boxShadow: `0 0 8px ${TONE_COLOR[tone]}` }}
    />
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
}

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...rest
}: BtnProps) {
  const h = size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-4 text-[13px]";
  const base = `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-45 disabled:cursor-not-allowed ${h}`;
  const styles: Record<string, string> = {
    primary: "text-white btn-primary",
    outline: "surface hover:surface-2",
    ghost: "dim hover:text-[var(--text)]",
    danger: "btn-danger",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="surface rounded-xl p-4">
      <div className="text-[11.5px] faint uppercase tracking-wider">{label}</div>
      <div
        className="mono text-[22px] font-semibold mt-2 tracking-tight"
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[11.5px] faint mt-1">{sub}</div>}
    </div>
  );
}

export function KeyValue({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[7px] border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="text-[12px] faint shrink-0">{k}</span>
      <span className={`text-[12px] text-right truncate ${mono ? "mono" : ""}`}>{v}</span>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="text-[13px] dim">{title}</div>
      {hint && <div className="text-[12px] faint mt-1">{hint}</div>}
    </div>
  );
}
