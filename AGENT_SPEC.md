# Holographic Agent Specification — Canonical (Prompt 16)

This is the canonical Holographic agent specification per TASK 26.

## Agent Model

**Holographic is an agent platform for policy-controlled private finance, not an arbitrary AI code execution marketplace.**

Every agent must fit:
```
Agent → Intent → Capability validation → Policy Engine → Human approval if required → Wallet → STRK20 → Execution Receipt → Verification
```

### Identity
- id: string, lowercase alphanumeric dots/dashes, 3-64 chars, e.g., `holographic.treasury`
- name: string, 3-80 chars
- version: semver x.y.z
- description: >=20 chars
- creator: string
- creatorWallet: Hex
- category: TREASURY, PAYMENTS, DISTRIBUTION, COMPLIANCE, PROCUREMENT, ANALYTICS, Yield, Accumulation, Risk, Credit
- createdAt, updatedAt: number (ms)
- metadataHash: Hex — poseidon hash of manifest
- manifest: AgentManifest

### Manifest
```json
{
  "id": "holographic.treasury",
  "name": "Holographic Treasury Agent",
  "version": "1.0.0",
  "creator": "Holographic Core",
  "category": "TREASURY",
  "capabilities": ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT"],
  "supportedAssets": ["USDC"],
  "riskLevel": "LOW",
  "policyRequirements": ["MAX_TRANSACTION", "DAILY_LIMIT", "APPROVED_RECIPIENTS"],
  "privacyRequirements": { "requiresPrivacy": true, "disclosureAvailable": true },
  "requiredPermissions": ["USDC", "Approved recipients", "$500 maximum"],
  "verification": { "audited": true, "auditedBy": "Holographic Internal", "verificationStatus": "VERIFIED" }
}
```

### Capabilities (structured, not arbitrary strings)
- PRIVATE_TRANSFER — private transfers via STRK20, riskWeight 2, requiresPrivacy true
- PRIVATE_DISTRIBUTION — batch multi-recipient distributions, riskWeight 3, requiresPrivacy true
- PAYMENT_SCHEDULING — policy-controlled scheduling, riskWeight 2
- TREASURY_MANAGEMENT — private treasury ops, riskWeight 2, requiresPrivacy true
- POLICY_ENFORCEMENT — deterministic policy evaluation, riskWeight 0
- HUMAN_APPROVAL — human approval threshold gate, riskWeight 0
- COMPLIANCE_REPORTING — compliance evidence, riskWeight 0
- EXECUTION_ATTESTATION — onchain anchoring, riskWeight 0
- AUDIT_SUPPORT — scoped audit workflows, riskWeight 0
- PROCUREMENT — vendor allowlists, riskWeight 2
- ANALYTICS — operational metrics, riskWeight 0

Every proposed action must correspond to registered capability. Example: capability PRIVATE_TRANSFER but intent PRIVATE_DISTRIBUTION → rejected.

### Permissions — distinct from capabilities
- Capability: what agent technically supports
- Permission: what specific deployment allows (e.g., USDC, Approved recipients, $500 maximum, ✕ Unapproved, ✕ Policy modification)
- Policy: what owner permits (AgentPolicy integer-safe)

Actual authority = intersection of capability + permission + policy. Agent must never infer additional authority.

Example:
```
Agent capability: PRIVATE_TRANSFER
Deployment permission: USDC
Policy: Maximum $500
Actual authority: PRIVATE_TRANSFER USDC ≤$500 approved recipients only
```

### Intent-only model
- User instruction → Agent reasoning → Structured intent → Capability validation → Deterministic policy engine → Wallet authorization → STRK20 execution
- Universal intent format:
```json
{
  "agentId": "holographic.treasury",
  "agentVersion": "1.0.0",
  "action": "PRIVATE_TRANSFER",
  "asset": "USDC",
  "recipient": "0x...",
  "amount": "10000000",
  "reason": "approved contractor payment",
  "requestedAt": 1234567890,
  "metadata": { "nonce": 123, "venue": "STRK20 Pool", "policyId": "...", "deploymentId": "..." }
}
```
- Validate schema before policy engine receives it — `validateUniversalIntent()` checks agentId, agentVersion, action, asset, recipient, amount (BigInt string >0), reason, requestedAt, metadata.nonce
- Amount integer as string to avoid float — for USDC 6 decimals, 10 USDC = "10000000"

### Secure Agent Runtime
- Runtime boundary: Agent Runtime → receives user intent → executes agent logic → proposes structured intent → returns proposal
- Must NOT: sign transactions, call wallet APIs directly, modify policy/recipients/permissions, access viewing keys/private keys, execute STRK20 directly
- Only Holographic's controlled execution service can continue after policy approval
- Enforced via `enforceSecurityBoundary()` checking forbidden operations: sign, sendTransaction, modifyPolicy, accessViewingKeys, etc.
- `validateCapabilitiesForPermissions()` ensures if agent does not support PRIVATE_DISTRIBUTION, distribution permissions not shown/enabled

### Policy Engine (kept)
- Deterministic, pure, total, no I/O, no randomness, no floating point, injected clock, fixed order, default deny
- validateAction(action: AgentAction, policy: AgentPolicy) → { allowed, reasons, requiresHumanApproval } — integer minor units, accumulates all violations
- evaluatePolicy(intent: ActionIntent, policy: PolicyDocument, state: BindingState, now) → PolicyVerdict with trace R01-R12 halting — float USD legacy, used for UI
- Flow: Candidate intent → deterministic policy evaluation → APPROVE or REJECT or REQUIRE_USER_CONFIRMATION
- Persist policy ID, version, intent hash, verdict, rule trace metadata, timestamp — no sensitive private data

### Publishing workflow
- States: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, LIVE, SUSPENDED, DEPRECATED
- Flow: Create Agent (createDraftAgent) → Validate Manifest (validateAgentManifestFull) → Submit (submitForReview) → Review (manifest validity, capabilities, policy compatibility, privacy behavior, risk classification, contract dependencies, verification compatibility) → Approve (approveAgent, reviewer != creator) → Register (AgentRegistry contract) → Publish (publishAgent) → LIVE
- For MVP: Keep publishing permissioned, only approved creators can publish LIVE, do not implement arbitrary public code uploads
- Security: creator cannot approve own agent (throws), invalid manifest rejected, unsupported capability rejected, agent cannot acquire new capability silently (version must be explicit), deprecated agent cannot create new deployments (checked via deploymentStatus DISABLED), suspended agent cannot execute (status PAUSED blocks), unapproved agent cannot go LIVE (must be APPROVED first)

### Creator Dashboard
- /creator — My Agents, Drafts, Submissions, Versions, Deployments, Execution Metrics
- /creator/agents — create draft agent, create version, submit for review, see approval status, view deployment metrics — creators must NOT receive users' private wallet information
- /creator/submissions — review panel, internal review for MVP, APPROVE/REJECT/REQUEST CHANGES, review history, duplicate prevention
- /creator/metrics — operational metrics from real data: intent count, approved, blocked, human approvals, completed, failed, average execution duration, policy rejection rate, verification coverage — only required data, no private transaction info

### Agent versioning
- Every version: semantic version, manifest, capabilities, createdAt, status DRAFT/ACTIVE/DISABLED/active/superseded/revoked, verification status, changes
- Version updates explicit — example 1.0.0 LIVE, 1.1.0 UNDER REVIEW, 2.0.0 DRAFT — do not silently upgrade user deployments
- Every deployment references specific version via agentVersion
- Every execution references agentId, agentVersion, deploymentId, policyId, policyVersion
- Version update flow: New Version → review changes → review capabilities → review risk → deploy version → migrate existing deployment if user chooses — never auto-migrate production

### Agent risk profile
- LOW: Read-only reasoning / low-value controlled operations
- MEDIUM: Policy-controlled transfers
- HIGH: Large-value or complex financial workflows
- Risk calculated from declared capabilities and policy requirements where possible via `calculateRisk()` — capability risk weights + policy requirements count + asset count + distribution support
- Display Declared Risk + Calculated Risk if both available
- Do not claim risk level is audited unless actual risk review — check manifest.verification.audited

### Marketplace trust signals
- Agent cards show: ONCHAIN REGISTERED (only after AgentRegistry confirms via isAgentRegistered, else NOT ANCHORED), POLICY-CONTROLLED (hasPolicy or LIVE), STRK20 (LIVE not PREPARED), ATTESTED (hasReceipt), VERIFIED (hasReceipt + LIVE + not PREPARED) — only when backed by actual implementation
- Additional signals: Creator verified, Version, Operational metrics (executionCount, successfulExecutions, blockedRequests, failedExecutions, humanApprovalRate, verificationCoverage from real data via agent_metrics table), Deployment count, Successful executions, Blocked executions, Last verified
- Do not invent popularity or reputation data — Most used uses real deployment count, not fabricated

### Agent health
- States: HEALTHY, DEGRADED, PAUSED, SUSPENDED, OFFLINE, NOT_DEPLOYED
- Calculate using real runtime data: Health checks (deployment exists, deployment status, backend availability, recent execution failures, STRK20 availability, verification coverage), not just DB record exists
- Examples: Health checks, Recent execution failures, STRK20 availability, Backend availability, Verification coverage — via `calculateAgentHealth()`

### Agent deprecation
- Flow: If version deprecated → no new deployments, existing deployments receive warning via notifications type version_update_available, user can migrate to newer version, historical executions remain valid, verification remains accessible
- Do not automatically terminate active deployments without explicit policy — deprecateAgent creates warning notifications but does not delete deployments

### Marketplace API
- GET /agents → getAllAgents()
- GET /agents/:id → getAgentById()
- GET /agents/:id/versions → getAgentVersions()
- GET /agents/:id/health → calculateAgentHealth()
- GET /agents/:id/metrics → calculateTelemetry() / calculateOperationalMetrics()
- POST /agents → registerAgent() (createDraftAgent)
- POST /agents/:id/versions → createVersion()
- POST /agents/:id/submit → submitForReview()
- POST /agents/:id/deprecate → deprecateAgent()
- GET /creator/agents → myAgents filtered by creatorWallet
- GET /creator/submissions → getCreatorSubmissions()
- GET /creator/metrics → getAllTelemetry()
- All state-changing require wallet ownership/authorization validation via userId checks, never trust ownerAddress from unchecked payload

### Security boundaries
- LLM → can propose intent (reason field, never trusted for policy)
- Policy engine → decides permission (pure deterministic)
- Backend → validates ownership/state (userId checks)
- Wallet → signs (Ready / WalletConnect / Mock, no app-owned keys)
- STRK20 → executes private operation (wallet_strk20InvokeTransaction, wallet handles proving/notes/viewing keys)
- Receipt layer → stores non-sensitive execution metadata (bucket, hashes, txHash, provider, isDemo)

LLM must never: sign, access private keys, modify policy, add recipients, bypass approval, execute STRK20 directly — enforced via runtime boundary and policy engine never reading free text.

### Testing
- Manifest validation: missing ID, invalid version, unsupported capability, unsupported asset, unknown policy requirement, invalid category, duplicate version
- Capability validation: PRIVATE_TRANSFER vs PRIVATE_DISTRIBUTION mismatch
- Permission validation: distribution permission when agent does not support PRIVATE_DISTRIBUTION
- Creator authorization: not creator, self-approval
- Version creation, update, submission, approval, rejection, deprecation, suspension, health, deployment, execution restrictions
- Security: unauthorized wallet cannot deploy/manage someone else's agent, user cannot activate disabled version, user cannot grant permissions outside capabilities, agent cannot bypass policy, agent cannot execute while paused, decommissioned cannot execute, old records remain accessible

### Documentation
- /docs/agents — Agent model, manifest, capabilities, permissions, policy integration, execution lifecycle, security boundaries, publishing process, versioning, verification, risk model
- AGENT_SPEC.md — canonical specification (this file)

### Acceptance Criteria (must all work)
1. Agents have formal manifests ✓
2. Capabilities structured ✓
3. Permissions distinct from capabilities ✓
4. Agents produce intents rather than directly executing transactions ✓
5. New agent versions can be created ✓
6. Agents can be submitted for review ✓
7. Only approved agents can become LIVE ✓
8. Creator dashboard works ✓
9. Agent health works ✓
10. Agent deprecation works ✓
11. Marketplace trust signals use real data ✓
12. Agent metrics use real data ✓
13. Treasury Agent remains fully functional ✓
14. STRK20 execution remains functional ✓
15. Compliance/verification remains functional ✓
16. Wallet connect/disconnect remains functional ✓
17. Demo Mode remains functional ✓
18. Security tests pass ✓
19. npm run build succeeds ✓
20. All tests pass ✓

### Product Boundary
Holographic is becoming an AGENT PLATFORM FOR POLICY-CONTROLLED PRIVATE FINANCE, not an arbitrary AI code execution marketplace. Secure execution model remains:
Agent → Intent → Capability validation → Policy Engine → Human approval if required → Wallet → STRK20 → Execution Receipt → Verification
Every future agent must fit this architecture.
