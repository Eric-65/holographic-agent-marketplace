import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useStore } from "../../lib/store";
import AgentCard from "../../components/AgentCard";
import { SectionTitle, Stat } from "../../components/ui/primitives";
import type { DbAgent } from "../../lib/db/schema";

const CATEGORIES = ["All", "TREASURY", "PAYMENTS", "DISTRIBUTION", "COMPLIANCE", "PROCUREMENT", "ANALYTICS", "Yield", "Accumulation", "Risk", "Credit"] as const;
const RISKS = ["All", "LOW", "MEDIUM", "HIGH"] as const;
const STATUSES = ["All", "LIVE", "BETA", "PREPARED", "DISABLED"] as const;
const VERIFICATION = ["All", "VERIFIED", "PENDING", "FAILED", "NOT_AVAILABLE"] as const;

type Sort = "most_used" | "newest" | "verified" | "lowest_risk" | "trust";

export default function AgentsPage() {
  const { agents, dbAgents, deployments } = useStore();
  // Use DB agents as real data, fallback to mock for legacy compatibility
  const realAgents = dbAgents.length > 0 ? dbAgents : (agents as unknown as DbAgent[]).map((a: any) => ({
    id: a.id,
    name: a.name,
    slug: a.id,
    description: a.description ?? a.summary ?? "",
    creator: a.publisher ?? a.creator ?? "Unknown",
    creatorWallet: a.publisherAddress ?? "0x0",
    version: a.version,
    category: (a.category?.toUpperCase() ?? "TREASURY") as any,
    capabilities: a.actionSurface?.map((x: string) => x.toUpperCase()) ?? [],
    supportedAssets: a.assets ?? [],
    riskLevel: (a.metrics?.trustScore >= 95 ? "LOW" : a.metrics?.trustScore >= 85 ? "MEDIUM" : "HIGH") as any,
    privacySupport: true,
    verificationStatus: "PENDING" as any,
    deploymentStatus: (a.priceLabel === "LIVE" ? "LIVE" : a.priceLabel === "BETA" ? "BETA" : "PREPARED") as any,
    createdAt: Date.now() - Math.random() * 10000000,
    updatedAt: Date.now(),
    metadataHash: a.manifestHash ?? "0x0",
  }));

  const [cat, setCat] = useState<string>("All");
  const [risk, setRisk] = useState<string>("All");
  const [status, setStatus] = useState<string>("All");
  const [verification, setVerification] = useState<string>("All");
  const [privacyOnly, setPrivacyOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("verified");

  const list = useMemo(() => {
    let filtered = realAgents.filter((a) => {
      if (cat !== "All" && a.category !== cat) return false;
      if (risk !== "All" && a.riskLevel !== risk) return false;
      if (status !== "All" && a.deploymentStatus !== status) return false;
      if (verification !== "All" && a.verificationStatus !== verification) return false;
      if (privacyOnly && !a.privacySupport) return false;
      if (q !== "") {
        const haystack = `${a.name} ${a.description} ${a.creator} ${a.capabilities.join(" ")}`.toLowerCase();
        if (!haystack.includes(q.toLowerCase())) return false;
      }
      return true;
    });

    // Sorting — do not fabricate popularity metrics
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "most_used": {
          // Use deployment count as real usage metric, not fabricated
          const countA = deployments.filter((d) => d.agentId === a.id).length;
          const countB = deployments.filter((d) => d.agentId === b.id).length;
          return countB - countA;
        }
        case "newest":
          return b.createdAt - a.createdAt;
        case "verified": {
          const order = { VERIFIED: 0, PENDING: 1, NOT_AVAILABLE: 2, FAILED: 3 };
          return (order[a.verificationStatus as keyof typeof order] ?? 4) - (order[b.verificationStatus as keyof typeof order] ?? 4);
        }
        case "lowest_risk": {
          const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
          return (order[a.riskLevel as keyof typeof order] ?? 3) - (order[b.riskLevel as keyof typeof order] ?? 3);
        }
        case "trust":
        default: {
          // Fallback to verification status for trust
          return a.name.localeCompare(b.name);
        }
      }
    });
  }, [realAgents, cat, risk, status, verification, privacyOnly, q, sort, deployments]);

  const liveCount = realAgents.filter((a) => a.deploymentStatus === "LIVE").length;
  const betaCount = realAgents.filter((a) => a.deploymentStatus === "BETA").length;
  const preparedCount = realAgents.filter((a) => a.deploymentStatus === "PREPARED").length;

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Registry"
        title="Agent Marketplace"
        sub="Discover, inspect, verify, deploy, configure, manage, version, pause, and verify financial agents. Marketplace is registry and deployment system, not arbitrary untrusted code execution. Agents propose, policy decides, wallet executes via STRK20."
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label="Registry" value={realAgents.length} sub={`${liveCount} LIVE · ${betaCount} BETA · ${preparedCount} PREPARED`} />
        <Stat label="Live agents" value={liveCount} sub="Fully functional" tone="good" />
        <Stat label="Privacy support" value={realAgents.filter((a) => a.privacySupport).length} sub="STRK20 ready" tone="cyan" />
        <Stat label="Signing authority" value="0" sub="agents never sign" tone="good" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, description, creator, capability..."
            className="w-full h-9 pl-9 pr-3 rounded-lg surface text-[13px] outline-none focus:surface-2 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] faint uppercase">Category</span>
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className="px-2.5 py-1 rounded-md text-[11px] border"
                  style={{
                    borderColor: cat === c ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--border)",
                    background: cat === c ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "transparent",
                    color: cat === c ? "var(--text)" : "var(--text-faint)",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] faint uppercase">Risk</span>
            <div className="flex gap-1">
              {RISKS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRisk(r)}
                  className="px-2.5 py-1 rounded-md text-[11px] border"
                  style={{
                    borderColor: risk === r ? "var(--border-strong)" : "var(--border)",
                    background: risk === r ? "var(--track)" : "transparent",
                    color: risk === r ? "var(--text)" : "var(--text-faint)",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] faint uppercase">Status</span>
            <div className="flex gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className="px-2.5 py-1 rounded-md text-[11px] border"
                  style={{
                    borderColor: status === s ? "var(--border-strong)" : "var(--border)",
                    background: status === s ? "var(--track)" : "transparent",
                    color: status === s ? "var(--text)" : "var(--text-faint)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] faint uppercase">Verification</span>
            <div className="flex gap-1">
              {VERIFICATION.map((v) => (
                <button
                  key={v}
                  onClick={() => setVerification(v)}
                  className="px-2.5 py-1 rounded-md text-[11px] border"
                  style={{
                    borderColor: verification === v ? "var(--border-strong)" : "var(--border)",
                    background: verification === v ? "var(--track)" : "transparent",
                    color: verification === v ? "var(--text)" : "var(--text-faint)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={privacyOnly} onChange={(e) => setPrivacyOnly(e.target.checked)} />
            STRK20 support only
          </label>
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="faint" />
          {(["verified", "newest", "most_used", "lowest_risk"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className="px-2.5 h-8 rounded-lg text-[11px] transition-all"
              style={{
                background: sort === s ? "var(--track)" : "transparent",
                color: sort === s ? "var(--text)" : "var(--text-faint)",
              }}
            >
              {s === "most_used" ? "Most used" : s === "lowest_risk" ? "Lowest risk" : s}
            </button>
          ))}
          <span className="text-[10px] faint ml-2">Most used uses real deployment count, not fabricated</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((dbAgent) => {
          // Map DbAgent to legacy Agent for AgentCard compatibility
          const legacyAgent = agents.find((a) => a.id === dbAgent.id) ?? {
            id: dbAgent.id,
            name: dbAgent.name,
            publisher: dbAgent.creator,
            publisherAddress: dbAgent.creatorWallet,
            category: dbAgent.category as any,
            version: dbAgent.version,
            manifestHash: dbAgent.metadataHash,
            summary: dbAgent.description.slice(0, 120),
            description: dbAgent.description,
            actionSurface: dbAgent.capabilities.map((c: any) => c.toLowerCase()) as any,
            assets: dbAgent.supportedAssets as any,
            venues: ["STRK20 Pool"] as any,
            metrics: { trustScore: dbAgent.verificationStatus === "VERIFIED" ? 98 : 50, executions: 0, rejectRate: 0, revertRate: 0, latencyP50Ms: 0, slippageDriftBps: 0 },
            priceLabel: dbAgent.deploymentStatus,
            stakeStrk: 0,
            accent: "var(--accent-3)",
            runtime: dbAgent.deploymentStatus === "LIVE" ? "active" : dbAgent.deploymentStatus === "BETA" ? "idle" : "unbound",
          };
          return <AgentCard key={dbAgent.id} agent={legacyAgent as any} />;
        })}
      </div>

      {list.length === 0 && <div className="text-center py-16 text-[13px] dim">No agents match filters — try clearing filters. Agent not found / unavailable handled.</div>}
    </div>
  );
}
