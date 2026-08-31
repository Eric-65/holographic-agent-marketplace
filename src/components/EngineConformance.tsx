import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, CircuitBoard, PlayCircle, XCircle } from "lucide-react";
import { runSuiteAsync, type SuiteReport, clearRegistry } from "../lib/policy/testKit";
import { VALIDATOR_VERSION } from "../lib/policy/validateAction";
import { Badge, Button, Panel, PanelHeader } from "./ui/primitives";

/**
 * Runs the validateAction + vertical slice suites live in-browser — dev only
 * In production, tests are NOT bundled to reduce build time and bundle size
 */

export default function EngineConformance() {
  const [report, setReport] = useState<SuiteReport | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      clearRegistry();
      // Dynamic imports — only in dev, not in production bundle
      if ((import.meta as any).env?.DEV || typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
        await import("../lib/policy/validateAction.test");
        await import("../lib/execution/executePrivateTransfer.test");
        await import("../lib/db/persistence.test");
        await import("../lib/agents/security.test");
        await import("../lib/treasury/automation.test");
      }
      const r = await runSuiteAsync();
      setReport(r);
    } catch (e) {
      console.error("[EngineConformance] Failed to run tests", e);
      setReport({
        groups: [{ name: "Error", cases: [{ name: String(e), passed: false, error: String(e), durationMs: 0 }] }],
        total: 1,
        passed: 0,
        failed: 1,
        durationMs: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void run();
  }, []);

  const groups = useMemo(() => report?.groups ?? [], [report]);
  const green = (report?.failed ?? 1) === 0;
  const total = report?.total ?? 0;
  const passed = report?.passed ?? 0;

  // In production, hide the heavy test panel entirely to save build time
  if (!(import.meta as any).env?.DEV && typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return (
      <Panel padded={false} edge>
        <PanelHeader title="Engine conformance" sub={`validateAction v${VALIDATOR_VERSION} — deterministic, 0 model calls`} />
        <div className="p-5 text-[12px] dim">
          Tests run only in development to reduce production bundle size and build time. Run `npm run dev` locally to see live conformance.
        </div>
      </Panel>
    );
  }

  return (
    <Panel padded={false} edge>
      <PanelHeader
        title="Engine conformance"
        sub={`validateAction v${VALIDATOR_VERSION} + vertical slice · live browser execution`}
        right={
          <div className="flex items-center gap-2">
            <Badge tone={report ? (green ? "good" : "bad") : "neutral"}>
              {report ? `${passed}/${total} passing` : "running…"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void run()} disabled={running}>
              <PlayCircle size={12} /> {running ? "Running…" : "Re-run"}
            </Button>
          </div>
        }
      />

      <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-b" style={{ borderColor: "var(--border)" }}>
        <Meta k="assertions" v={String(total)} />
        <Meta k="failed" v={String(report?.failed ?? 0)} tone={(report?.failed ?? 0) ? "bad" : "good"} />
        <Meta k="duration" v={`${(report?.durationMs ?? 0).toFixed(1)}ms`} />
        <Meta k="decision path" v="0 model calls" tone="good" />
      </div>

      <div>
        {groups.map((g) => {
          const failed = g.cases.filter((c) => !c.passed).length;
          const isOpen = open === g.name;
          return (
            <div key={g.name} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={() => setOpen(isOpen ? null : g.name)}
                className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-[var(--track)] transition-colors"
              >
                {failed === 0 ? (
                  <CheckCircle2 size={14} style={{ color: "var(--good)" }} />
                ) : (
                  <XCircle size={14} style={{ color: "var(--bad)" }} />
                )}
                <span className="text-[12.5px] font-medium flex-1 truncate">{g.name}</span>
                <span className="mono text-[10.5px] faint">
                  {g.cases.filter((c) => c.passed).length}/{g.cases.length}
                </span>
                <ChevronRight size={13} className="faint transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
              </button>

              {isOpen && (
                <div className="pb-2">
                  {g.cases.map((c) => (
                    <div key={c.name} className="px-5 py-[5px] pl-12 flex items-center gap-3">
                      <span className="h-1 w-1 rounded-full shrink-0" style={{ background: c.passed ? "var(--good)" : "var(--bad)" }} />
                      <span className={`text-[11.5px] flex-1 ${c.passed ? "dim" : ""}`} style={!c.passed ? { color: "var(--bad)" } : undefined}>
                        {c.name}
                      </span>
                      <span className="mono text-[10px] faint">{c.durationMs.toFixed(2)}ms</span>
                    </div>
                  ))}
                  {g.cases
                    .filter((c) => !c.passed)
                    .map((c) => (
                      <div key={`${c.name}-err`} className="mx-5 mt-2 mb-1 ml-12 rounded-md px-3 py-2 mono text-[10.5px]" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
                        {c.error}
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
        {!report && <div className="px-5 py-8 text-[12.5px] faint">Running deterministic suite…</div>}
      </div>

      <div className="px-5 py-4 border-t flex items-start gap-2.5" style={{ borderColor: "var(--border)" }}>
        <CircuitBoard size={14} className="faint shrink-0 mt-[1px]" />
        <p className="text-[11.5px] dim leading-relaxed">
          <span style={{ color: "var(--text)" }}>No language model participates in this decision.</span> An agent's free text is never read by the validator — only its structured fields are. A prompt-injected rationale can at most produce an action that these rules reject.
        </p>
      </div>
    </Panel>
  );
}

function Meta({ k, v, tone }: { k: string; v: string; tone?: "good" | "bad" }) {
  return (
    <span className="mono text-[10.5px]">
      <span className="faint">{k} </span>
      <span style={{ color: tone === "bad" ? "var(--bad)" : tone === "good" ? "var(--good)" : "var(--text-dim)" }}>{v}</span>
    </span>
  );
}
