export const usd = (n: number, opts: { compact?: boolean } = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : n < 100 ? 2 : 0,
  }).format(n);

export const num = (n: number, dp = 2): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: dp }).format(n);

export const pct = (n: number, dp = 1) => `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;

export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour12: false });

export const datetime = (ts: number) =>
  new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const ACTION_LABEL: Record<string, string> = {
  private_swap: "Private swap",
  private_transfer: "Private transfer",
  shield: "Shield",
  unshield: "Unshield",
  reshield: "Reshield",
  borrow: "Borrow",
  repay: "Repay",
};
