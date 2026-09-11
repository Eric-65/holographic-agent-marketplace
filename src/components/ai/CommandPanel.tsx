import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, CircleHelp, Send, User } from "lucide-react";
import { useStore } from "../../lib/store";
import { Badge, Button, Panel } from "../ui/primitives";
import MotionStatus from "../motion/MotionStatus";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import { interpretMessage, previewIntent, getAIProvider, isUsingMockProvider, type IntentPreview as IntentPreviewData } from "../../lib/ai";
import { requestExecution } from "../../lib/ai/requestExecution";
import { getBudgetsSummary, getPendingApprovalsSummary, getStatusByReference } from "../../lib/ai/tools";
import { formatMinor } from "../treasury/ExecutionRequestCard";
import IntentPreview from "./IntentPreview";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  intentId?: string;
}

const INFORMATIONAL_ACTIONS = new Set(["BUDGET_CHECK", "APPROVAL_REQUEST", "EXECUTION_STATUS", "VERIFICATION_STATUS"]);

function informationalAnswer(userId: string, action: string, referenceId?: string): string {
  if (action === "BUDGET_CHECK") {
    const budgets = getBudgetsSummary(userId);
    if (budgets.length === 0) return "You don't have any budgets set up yet.";
    return budgets.map((b) => `${b.name}: ${formatMinor(b.remaining)} remaining of ${formatMinor(b.limit)} (${b.status.toLowerCase()})`).join("\n");
  }
  if (action === "APPROVAL_REQUEST") {
    const pending = getPendingApprovalsSummary(userId);
    if (pending.length === 0) return "Nothing is waiting on your approval right now.";
    return `${pending.length} payment${pending.length === 1 ? "" : "s"} waiting on your approval, totalling ${formatMinor(pending.reduce((s, p) => s + p.intent.amount, 0))}.`;
  }
  if ((action === "EXECUTION_STATUS" || action === "VERIFICATION_STATUS") && referenceId) {
    const { kind, record } = getStatusByReference(userId, referenceId);
    if (kind === "unknown" || !record) return `I couldn't find anything matching "${referenceId}".`;
    if (kind === "execution_request") {
      const r = record as { status: string };
      return `${referenceId} is currently ${r.status.replace(/_/g, " ").toLowerCase()}.`;
    }
    const s = record as { status: string; occurrenceCount: number };
    return `${referenceId} is ${s.status.toLowerCase()}, with ${s.occurrenceCount} occurrence(s) so far.`;
  }
  return "I'll need a reference ID to look that up — the one shown on the payment or schedule.";
}

/**
 * The AI command/chat interface. Every response is either a display-only
 * answer (informational actions, resolved from real tool data — never the
 * model's own guess) or an IntentPreview the user must explicitly confirm.
 * There is no path here that calls requestExecution without that click.
 */
export default function CommandPanel() {
  const { dbUser, refreshFromDb } = useStore();
  const reduced = useReducedMotion();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, IntentPreviewData | null>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [why, setWhy] = useState<Record<string, string>>({});
  const sessionId = useRef(`session-${Math.random().toString(36).slice(2)}`);
  const scrollRef = useRef<HTMLDivElement>(null);
  const provider = useMemo(() => getAIProvider(), [entries.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [entries, reduced]);

  if (!dbUser) return null;

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setEntries((e) => [...e, { id: `u-${Date.now()}`, role: "user", content: message }]);
    setBusy(true);
    try {
      const result = await interpretMessage(dbUser.id, sessionId.current, message);
      const structured = result.intent.structuredIntent as Record<string, unknown> | null;
      const action = (structured?.action as string) ?? "UNSUPPORTED";

      let reply = result.reply;
      if (structured && INFORMATIONAL_ACTIONS.has(action)) {
        reply = informationalAnswer(dbUser.id, action, structured.referenceId as string | undefined);
      }

      setEntries((e) => [...e, { id: `a-${Date.now()}`, role: "assistant", content: reply, intentId: result.intent.id }]);

      if (structured && (action === "PRIVATE_TRANSFER" || action === "SCHEDULE_PAYMENT" || action === "PAYMENT_REQUEST")) {
        const preview = previewIntent(dbUser.id, result.intent.id);
        setPreviews((p) => ({ ...p, [result.intent.id]: preview }));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = (intentId: string) => {
    if (!dbUser) return;
    setConfirmingId(intentId);
    try {
      const outcome = requestExecution(intentId, dbUser.id);
      refreshFromDb();
      let message: string;
      if (outcome.kind === "execution_request") {
        message =
          outcome.executionRequest.status === "BLOCKED"
            ? `Blocked by policy: ${outcome.executionRequest.verdict.reasons.join("; ")}`
            : outcome.executionRequest.status === "AWAITING_USER"
              ? "Passed policy — waiting on your approval in Treasury → Payments before it can be authorized."
              : "Passed policy — ready for wallet authorization in Treasury → Payments.";
      } else if (outcome.kind === "schedule") {
        message = "Schedule created — every future occurrence will still require your explicit approval.";
      } else if (outcome.kind === "payment_request") {
        message = "Payment request created — approve it from Treasury → Payment requests to send it for policy review.";
      } else {
        message = `Could not proceed: ${outcome.reason}`;
      }
      setOutcomes((o) => ({ ...o, [intentId]: message }));
      setPreviews((p) => ({ ...p, [intentId]: null }));
    } finally {
      setConfirmingId(null);
    }
  };

  const explainWhy = async (intentId: string, entry: ChatEntry) => {
    const evidence = { question: "Why was this decided this way?", reasons: outcomes[intentId] ? [outcomes[intentId]] : [entry.content] };
    const explanation = await getAIProvider().explainDecision({ question: "Why?", evidence });
    setWhy((w) => ({ ...w, [intentId]: explanation }));
  };

  return (
    <Panel padded={false} edge className="flex flex-col h-[560px]">
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <Bot size={15} style={{ color: "var(--accent-3)" }} />
          <span className="font-display text-[13.5px] font-semibold">Treasury Assistant</span>
        </div>
        <Badge tone={isUsingMockProvider() ? "neutral" : "cyan"}>{provider.name === "mock" ? "MOCK — no data leaves this app" : `${provider.model}`}</Badge>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {entries.length === 0 && (
          <div className="text-[12.5px] faint py-8 text-center">
            Try: "Pay 25 USDC to Acme for consulting" or "How much budget do I have left?"
            <br />
            I can propose payments and schedules — a human approval and the policy engine still decide everything.
          </div>
        )}
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const preview = entry.intentId ? previews[entry.intentId] : null;
            return (
              <motion.div
                key={entry.id}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex gap-2.5 ${entry.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <span className="h-6 w-6 rounded-full grid place-items-center shrink-0 surface" aria-hidden>
                  {entry.role === "user" ? <User size={12} /> : <Bot size={12} style={{ color: "var(--accent-3)" }} />}
                </span>
                <div className={`max-w-[85%] space-y-2 ${entry.role === "user" ? "items-end" : ""}`}>
                  <div className="rounded-lg px-3 py-2 text-[12.5px] whitespace-pre-line" style={{ background: entry.role === "user" ? "var(--accent-3)" : "var(--track)", color: entry.role === "user" ? "#fff" : "var(--text)" }}>
                    {entry.content}
                  </div>
                  {entry.role === "assistant" && entry.intentId && (
                    <button
                      onClick={() => explainWhy(entry.intentId!, entry)}
                      className="inline-flex items-center gap-1 text-[10.5px] faint hover:text-[var(--text)]"
                    >
                      <CircleHelp size={11} /> Why?
                    </button>
                  )}
                  {entry.intentId && why[entry.intentId] && <div className="text-[11px] faint italic">{why[entry.intentId]}</div>}
                  {entry.intentId && preview && <IntentPreview preview={preview} confirming={confirmingId === entry.intentId} onConfirm={() => confirm(entry.intentId!)} onCancel={() => setPreviews((p) => ({ ...p, [entry.intentId!]: null }))} />}
                  {entry.intentId && outcomes[entry.intentId] && (
                    <div className="flex items-center gap-2">
                      <MotionStatus status={outcomes[entry.intentId].startsWith("Blocked") ? "BLOCKED" : outcomes[entry.intentId].startsWith("Could not") ? "FAILED" : "APPROVED"} size="sm" />
                      <span className="text-[11px] dim">{outcomes[entry.intentId]}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {busy && <MotionStatus status="THINKING" size="sm" />}
      </div>

      <div className="border-t p-3 flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about a payment, budget, or approval…"
          disabled={busy}
          className="flex-1 h-9 px-3 rounded-lg surface text-[13px] outline-none"
        />
        <Button variant="primary" size="sm" onClick={send} disabled={busy || !input.trim()}>
          <Send size={13} />
        </Button>
      </div>
    </Panel>
  );
}
