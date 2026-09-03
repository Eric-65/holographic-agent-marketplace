import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

/**
 * Minimal history router matching the Next.js App Router route table.
 *
 * The file layout under src/app mirrors Next.js exactly:
 *   app/page.tsx · app/agents/page.tsx · app/agents/[id]/page.tsx
 *   app/treasury/page.tsx · app/activity/page.tsx
 *   app/policies/page.tsx · app/settings/page.tsx
 *
 * Porting to Next.js is mechanical: delete this file, rename the exported
 * page components to default exports (already the case), and swap `Link` for
 * `next/link` + `useRoute` for `useParams`/`usePathname`.
 */

export const ROUTES = [
  "/",
  "/agents",
  "/agents/[id]",
  "/treasury",
  "/treasury/schedules",
  "/treasury/budgets",
  "/treasury/payments",
  "/treasury/workflows",
  "/treasury/payment-requests",
  "/settings/automation",
  "/activity",
  "/policies",
  "/settings",
  "/compliance",
  "/compliance/audits",
  "/verification",
  "/creator",
  "/creator/agents",
  "/creator/submissions",
  "/creator/metrics",
] as const;

export type RoutePattern = (typeof ROUTES)[number];

interface RouteContextValue {
  pathname: string;
  pattern: RoutePattern;
  params: Record<string, string>;
  push: (href: string) => void;
}

const RouteCtx = createContext<RouteContextValue | null>(null);

function match(pathname: string): { pattern: RoutePattern; params: Record<string, string> } {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const segs = clean.split("/").filter(Boolean);
  if (segs.length === 0) return { pattern: "/", params: {} };
  if (segs[0] === "agents" && segs.length === 2)
    return { pattern: "/agents/[id]", params: { id: segs[1] } };
  if (segs[0] === "compliance" && segs[1] === "audits") return { pattern: "/compliance/audits", params: {} };
  if (segs[0] === "treasury" && segs[1] === "schedules") return { pattern: "/treasury/schedules", params: {} };
  if (segs[0] === "treasury" && segs[1] === "budgets") return { pattern: "/treasury/budgets", params: {} };
  if (segs[0] === "treasury" && segs[1] === "payments") return { pattern: "/treasury/payments", params: {} };
  if (segs[0] === "treasury" && segs[1] === "workflows") return { pattern: "/treasury/workflows", params: {} };
  if (segs[0] === "treasury" && segs[1] === "payment-requests") return { pattern: "/treasury/payment-requests", params: {} };
  if (segs[0] === "settings" && segs[1] === "automation") return { pattern: "/settings/automation", params: {} };
  if (segs[0] === "creator" && segs[1] === "agents") return { pattern: "/creator/agents", params: {} };
  if (segs[0] === "creator" && segs[1] === "submissions") return { pattern: "/creator/submissions", params: {} };
  if (segs[0] === "creator" && segs[1] === "metrics") return { pattern: "/creator/metrics", params: {} };
  const direct = `/${segs[0]}` as RoutePattern;
  if ((ROUTES as readonly string[]).includes(direct)) return { pattern: direct, params: {} };
  if ((ROUTES as readonly string[]).includes(clean as RoutePattern)) return { pattern: clean as RoutePattern, params: {} };
  return { pattern: "/", params: {} };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const push = useCallback((href: string) => {
    window.history.pushState({}, "", href);
    setPathname(href);
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ pathname, ...match(pathname), push }), [pathname, push]);
  return <RouteCtx.Provider value={value}>{children}</RouteCtx.Provider>;
}

export function useRoute() {
  const ctx = useContext(RouteCtx);
  if (!ctx) throw new Error("useRoute must be used inside <RouterProvider>");
  return ctx;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

export function Link({ href, children, onClick, ...rest }: LinkProps) {
  const { push } = useRoute();
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onClick?.(e);
        push(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
