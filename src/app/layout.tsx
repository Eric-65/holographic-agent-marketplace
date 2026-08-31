import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  Hexagon,
  LayoutDashboard,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Vault,
} from "lucide-react";
import { Link, useRoute } from "./router";
import { useStore } from "../lib/store";
import WalletConnect from "../components/WalletConnect";
import PrivacyStatus from "../components/PrivacyStatus";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/treasury", label: "Treasury", icon: Vault },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/policies", label: "Policies", icon: ScrollText },
  { href: "/compliance", label: "Compliance", icon: ScrollText },
  { href: "/verification", label: "Verification", icon: Activity },
  { href: "/creator", label: "Creator", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRoute();
  const {
    theme,
    toggleTheme,
    wallet,
    connect,
    connectReal,
    connectReady,
    connectWalletConnect,
    connectMock,
    diagnostic,
    walletError,
    errorDetails,
    disconnect,
  } = useStore();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen relative">
      <div className="app-bg" aria-hidden="true" />

      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[228px] flex-col border-r z-40 rail">
        <div className="h-14 flex items-center gap-2.5 px-5 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="h-7 w-7 rounded-lg grid place-items-center holo-edge surface">
            <Hexagon size={13} style={{ color: "var(--accent-3)" }} />
          </span>
          <span className="font-display text-[14px] font-semibold tracking-tight">Holographic</span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all relative"
                style={{
                  background: on ? "var(--track)" : "transparent",
                  color: on ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {on && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r"
                    style={{ background: "var(--accent-3)" }}
                  />
                )}
                <Icon size={14} style={{ color: on ? "var(--accent-3)" : "var(--text-faint)" }} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--track)" }}>
            <div className="mono text-[10px] faint uppercase tracking-wider">Integration</div>
            <div className="mono text-[11px] mt-1.5 space-y-1">
              <Row k="engine" v="v1.2.0" ok />
              <Row k="privacy" v="mock" warn />
              <Row k="network" v="sepolia" ok />
            </div>
          </div>
        </div>
      </aside>

      {/* Topbar — fixed to avoid excessive z-index, overflow-visible so chooser is not clipped */}
      <header className="fixed top-0 right-0 left-0 lg:left-[228px] h-14 z-30 border-b rail overflow-visible">
        <div className="h-full flex items-center gap-3 px-4 sm:px-6 w-full min-w-0 overflow-visible">
          <Link href="/" className="lg:hidden flex items-center gap-2 shrink-0">
            <Hexagon size={15} style={{ color: "var(--accent-3)" }} />
            <span className="font-display text-[13px] font-semibold">Holographic</span>
          </Link>

          <div className="hidden lg:flex items-center gap-2 mono text-[11px] faint shrink-0">
            <span>holographic</span>
            {pathname !== "/" &&
              pathname
                .split("/")
                .filter(Boolean)
                .map((s) => (
                  <span key={s} className="flex items-center gap-2">
                    <span className="opacity-40">/</span>
                    <span style={{ color: "var(--text-dim)" }}>{s}</span>
                  </span>
                ))}
          </div>

          {/* Scrollable utility/status area — ONLY status, not wallet chooser */}
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 overflow-x-auto scrollbar-thin overscroll-x-contain">
            <div className="flex items-center gap-2 shrink-0">
              <PrivacyStatus wallet={wallet} diagnostic={diagnostic} />
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="h-8 w-8 grid place-items-center rounded-lg surface hover:surface-2 transition-all shrink-0"
              >
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
              </button>
            </div>
          </div>

          {/* Separate non-scrolling WalletConnect container — position:relative, overflow:visible, above header — fixes clipping */}
          <div className="shrink-0 relative overflow-visible z-20">
            <WalletConnect
              wallet={wallet}
              diagnostic={diagnostic}
              error={walletError}
              errorDetails={errorDetails}
              onConnect={connect}
              onConnectReal={connectReal}
              onConnectReady={connectReady}
              onConnectWalletConnect={connectWalletConnect}
              onConnectMock={connectMock}
              onDisconnect={disconnect}
            />
          </div>
        </div>
      </header>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex border-t rail">
        {NAV.map((n) => {
          const Icon = n.icon;
          const on = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className="flex-1 py-2.5 flex flex-col items-center gap-1"
              style={{ color: on ? "var(--accent-3)" : "var(--text-faint)" }}
            >
              <Icon size={15} />
              <span className="text-[9.5px]\">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="relative z-10 lg:pl-[228px] pt-14 pb-24 lg:pb-12">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-7">{children}</div>
      </main>
    </div>
  );
}

function Row({ k, v, ok, warn }: { k: string; v: string; ok?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="faint">{k}</span>
      <span style={{ color: warn ? "var(--warn)" : ok ? "var(--good)" : "var(--text-dim)" }}>{v}</span>
    </div>
  );
}
