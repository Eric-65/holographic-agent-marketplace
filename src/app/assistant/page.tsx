import { useStore } from "../../lib/store";
import { SectionTitle, Empty } from "../../components/ui/primitives";
import MotionReveal from "../../components/motion/MotionReveal";
import CommandPanel from "../../components/ai/CommandPanel";

export default function AssistantPage() {
  const { dbUser } = useStore();

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Intelligence layer"
        title="Treasury Assistant"
        sub="Proposes payments, schedules, and answers in plain language. Every action still passes through the same deterministic policy engine, budgets, and wallet authorization as the rest of Holographic — the assistant can suggest, never decide or sign."
      />
      {!dbUser ? (
        <Empty title="Connect your wallet" hint="The assistant needs a connected wallet to look up your recipients, budgets, and approvals" />
      ) : (
        <MotionReveal>
          <CommandPanel />
        </MotionReveal>
      )}
    </div>
  );
}
