import { useState } from "react";
import { useStore } from "../../../lib/store";
import { SectionTitle, Panel, PanelHeader, Badge, Button } from "../../../components/ui/primitives";
import { short } from "../../../lib/hash";
import { datetime } from "../../../lib/format";
import { validateAgentManifestFull } from "../../../lib/agents/validator";
import { createDraftAgent, submitForReview, publishAgent } from "../../../lib/agents/publishing";
import { CAPABILITIES } from "../../../lib/agents/capabilities";
import type { AgentManifest } from "../../../lib/agents/manifest";
import { Plus, Rocket, Send } from "lucide-react";

export default function CreatorAgentsPage() {
  const { dbUser, dbAgents, agentVersions, refreshFromDb } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const [manifest, setManifest] = useState<AgentManifest>({
    id: "holographic.procurement",
    name: "Holographic Procurement Agent",
    version: "0.1.0",
    description: "Policy-controlled procurement workflows with vendor allowlists for private contractor payments. This agent proposes intents, never signs, never bypasses policy.",
    creator: "Holographic Core",
    category: "PROCUREMENT",
    capabilities: ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT", "PROCUREMENT"],
    supportedAssets: ["USDC"],
    riskLevel: "MEDIUM",
    policyRequirements: ["MAX_TRANSACTION", "DAILY_LIMIT", "APPROVED_RECIPIENTS", "ALLOWED_ASSETS"],
    privacyRequirements: { requiresPrivacy: true },
    requiredPermissions: ["USDC", "Approved recipients"],
    verification: { audited: false, verificationStatus: "PENDING" },
  });
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ReturnType<typeof validateAgentManifestFull> | null>(null);

  const myAgents = dbUser ? dbAgents.filter((a) => a.creatorWallet.toLowerCase() === dbUser.address.toLowerCase()) : [];

  const handleValidate = () => {
    const result = validateAgentManifestFull(manifest, dbUser?.address);
    setValidation(result);
  };

  const handleCreate = () => {
    if (!dbUser) {
      setError("Connect wallet first");
      return;
    }
    setError(null);
    try {
      createDraftAgent(manifest as any, dbUser.address);
      refreshFromDb();
      setFormOpen(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSubmit = (agentId: string) => {
    if (!dbUser) return;
    try {
      submitForReview(agentId, dbUser.address);
      refreshFromDb();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handlePublish = (agentId: string) => {
    try {
      publishAgent(agentId);
      refreshFromDb();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Creator"
        title="My Agents"
        sub="Create draft agent, create version, submit for review, see approval status, view deployment metrics. Creators must NOT receive users' private wallet information. Publishing permissioned, only approved creators can publish LIVE."
        right={
          <Button variant="primary" size="sm" onClick={() => setFormOpen((o) => !o)}>
            <Plus size={12} /> {formOpen ? "Close form" : "Create draft agent"}
          </Button>
        }
      />

      {error && <div className="text-[11px] px-3 py-2 rounded" style={{ background: "color-mix(in oklab, var(--bad) 10%, transparent)", color: "var(--bad)" }}>{error}</div>}

      {formOpen && (
        <Panel padded={false} edge>
          <PanelHeader title="Create draft agent — manifest" sub="Validate all manifests, reject malformed or conflicting" />
          <div className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] faint uppercase">ID (lowercase dots/dashes)</label>
                <input value={manifest.id} onChange={(e) => setManifest({ ...manifest, id: e.target.value })} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] mono outline-none" />
              </div>
              <div>
                <label className="text-[11px] faint uppercase">Name</label>
                <input value={manifest.name} onChange={(e) => setManifest({ ...manifest, name: e.target.value })} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] outline-none" />
              </div>
              <div>
                <label className="text-[11px] faint uppercase">Version (semver)</label>
                <input value={manifest.version} onChange={(e) => setManifest({ ...manifest, version: e.target.value })} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] mono outline-none" />
              </div>
              <div>
                <label className="text-[11px] faint uppercase">Category</label>
                <select value={manifest.category} onChange={(e) => setManifest({ ...manifest, category: e.target.value as any })} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] outline-none">
                  {["TREASURY", "PAYMENTS", "DISTRIBUTION", "COMPLIANCE", "PROCUREMENT", "ANALYTICS"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] faint uppercase">Risk</label>
                <select value={manifest.riskLevel} onChange={(e) => setManifest({ ...manifest, riskLevel: e.target.value as any })} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] outline-none">
                  <option value="LOW">LOW — read-only / low-value</option>
                  <option value="MEDIUM">MEDIUM — policy-controlled transfers</option>
                  <option value="HIGH">HIGH — large-value complex</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] faint uppercase">Supported assets</label>
                <input value={manifest.supportedAssets.join(",")} onChange={(e) => setManifest({ ...manifest, supportedAssets: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-1 w-full h-9 px-3 rounded-lg surface text-[12.5px] outline-none" placeholder="USDC,STRK" />
              </div>
            </div>

            <div>
              <label className="text-[11px] faint uppercase">Description</label>
              <textarea value={manifest.description} onChange={(e) => setManifest({ ...manifest, description: e.target.value })} className="mt-1 w-full h-20 px-3 py-2 rounded-lg surface text-[12.5px] outline-none" />
            </div>

            <div>
              <label className="text-[11px] faint uppercase">Capabilities (structured)</label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.keys(CAPABILITIES).map((cap) => (
                  <button
                    key={cap}
                    onClick={() => {
                      const has = manifest.capabilities.includes(cap);
                      setManifest({ ...manifest, capabilities: has ? manifest.capabilities.filter((c) => c !== cap) : [...manifest.capabilities, cap] });
                    }}
                    className="px-2.5 py-1 rounded-md text-[11px] border"
                    style={{
                      borderColor: manifest.capabilities.includes(cap) ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--border)",
                      background: manifest.capabilities.includes(cap) ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "transparent",
                      color: manifest.capabilities.includes(cap) ? "var(--text)" : "var(--text-faint)",
                    }}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleValidate}>Validate manifest</Button>
              <Button variant="primary" size="sm" onClick={handleCreate}><Rocket size={12} /> Create draft</Button>
            </div>

            {validation && (
              <div className="rounded-lg p-3 text-[11px] mono" style={{ background: validation.valid ? "color-mix(in oklab, var(--good) 10%, transparent)" : "color-mix(in oklab, var(--bad) 10%, transparent)", border: `1px solid ${validation.valid ? "color-mix(in oklab, var(--good) 30%, transparent)" : "color-mix(in oklab, var(--bad) 30%, transparent)"}` }}>
                <div className="font-medium" style={{ color: validation.valid ? "var(--good)" : "var(--bad)" }}>{validation.valid ? "✓ Valid manifest" : "✗ Invalid manifest"}</div>
                {validation.errors.map((e, i) => (
                  <div key={i} style={{ color: "var(--bad)" }}>{e}</div>
                ))}
                {validation.warnings.map((w, i) => (
                  <div key={`w-${i}`} style={{ color: "var(--warn)" }}>{w}</div>
                ))}
                <div className="mt-2 faint">Checks: {Object.entries(validation.checks).map(([k, v]) => `${k}:${v ? "✓" : "✗"}`).join(" ")}</div>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel padded={false}>
        <PanelHeader title={`My Agents — ${myAgents.length}`} sub="Drafts, versions, deployments" />
        {myAgents.length === 0 ? (
          <div className="p-5 text-[12px] faint">No agents — create draft above. For MVP, curated creator model, no permissionless third-party executable code uploads yet.</div>
        ) : (
          <div>
            {myAgents.map((a) => {
              const versions = agentVersions.filter((v) => v.agentId === a.id);
              return (
                <div key={a.id} className="border-b last:border-0 px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium">{a.name} v{a.version} <Badge tone={a.deploymentStatus === "LIVE" ? "good" : a.deploymentStatus === "BETA" ? "cyan" : "neutral"}>{a.deploymentStatus}</Badge></div>
                      <div className="mono text-[10.5px] faint">{short(a.id, 10, 6)} · {a.category} · {a.riskLevel} · {a.verificationStatus} · {datetime(a.createdAt)}</div>
                      <div className="text-[11px] dim mt-1">{a.description.slice(0, 120)}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {a.capabilities.map((c) => (
                          <Badge key={c} tone="neutral">{c}</Badge>
                        ))}
                      </div>
                      <div className="mt-2 text-[10.5px] faint">Versions: {versions.map((v) => `${v.version}(${v.status})`).join(", ") || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => handleSubmit(a.id)}><Send size={11} /> Submit for review</Button>
                      <Button variant="ghost" size="sm" onClick={() => handlePublish(a.id)}><Rocket size={11} /> Publish LIVE</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
