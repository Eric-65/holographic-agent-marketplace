import { Link, useRoute } from "../../app/router";

const TABS = [
  { href: "/treasury", label: "Overview" },
  { href: "/treasury/schedules", label: "Schedules" },
  { href: "/treasury/budgets", label: "Budgets" },
  { href: "/treasury/payments", label: "Payments" },
  { href: "/treasury/workflows", label: "Workflows" },
];

export default function TreasuryTabs() {
  const { pathname } = useRoute();
  return (
    <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-thin border-b" style={{ borderColor: "var(--border)" }}>
      {TABS.map((t) => {
        const active = t.href === "/treasury" ? pathname === "/treasury" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3.5 py-2.5 text-[12.5px] font-medium whitespace-nowrap relative transition-colors"
            style={{ color: active ? "var(--text)" : "var(--text-dim)" }}
          >
            {t.label}
            {active && <span className="absolute left-3 right-3 -bottom-px h-[2px] rounded-full" style={{ background: "var(--accent-3)" }} />}
          </Link>
        );
      })}
    </div>
  );
}
