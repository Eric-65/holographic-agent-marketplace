# Extensible Agent Platform + Secure Agent SDK + Controlled Publishing — Report (Prompt 16/17)

## 1. Agent SDK / Interface

**File:** `src/lib/agents/sdk.ts`

Formal SDK contract:
- Identity: id, name, version, description, creator, category, capabilities, supportedAssets, riskLevel, policyRequirements, privacyRequirements
- Runtime interface: `initialize(context: AgentContext)`, `validate()`, `propose(userInstruction, context)`, `explain(intent)`, `getCapabilities()`, `getVersion()`, `getManifest()`
- Must NOT expose private keys, seed phrases, viewing keys, raw wallet signer, unrestricted transaction functions — enforced via `AgentContext` only contains userId, walletAddress, chainId, agentId, agentVersion, deploymentId, policyId, permissions (allowedAssets, approvedRecipients, maxTransactionAmount, dailyLimit, approvalThreshold) — no private material
- Universal intent format `UniversalIntent`: agentId, agentVersion, action, asset, recipient, amount (integer as string), reason, requestedAt, metadata { nonce, venue, slippageBps, policyId, deploymentId } — validated via `validateUniversalIntent()` checking BigInt amount >0
- Treasury Agent SDK implementation `TreasuryAgentSDK` as first fully functional: parses "Pay approved contractor 10 USDC" → TreasuryTransferIntent integer minor units, explanation, capability PRIVATE_TRANSFER, confidence 0.9 — LLM would produce candidate intent here, but policy engine remains authority, never decides allowance

## 2. Agent Manifest Schema

**File:** `src/lib/agents/manifest.ts`

Schema:
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
  "privacyRequirements": { "requiresPrivacy": true },
  "requiredPermissions": ["USDC", "Approved recipients"],
  "verification": { "audited": true, "auditedBy": "Holographic Internal", "verificationStatus": "VERIFIED" }
}
```

Validation:
- `validateAgentId()` — lowercase alphanumeric dots/dashes, 3-64 chars
- `validateSemver()` — x.y.z
- `validateAgentManifest()` — checks missing ID, invalid version, unsupported capability (via `validateCapabilities`), unsupported asset (USDC, STRK, ETH, strkBTC), unknown policy requirement (MAX_TRANSACTION, DAILY_LIMIT, APPROVED_RECIPIENTS, ALLOWED_ASSETS, HUMAN_APPROVAL, PAUSE_CAPABILITY, COOLDOWN, SLIPPAGE_BOUND), invalid category (TREASURY, PAYMENTS, DISTRIBUTION, COMPLIANCE, PROCUREMENT, ANALYTICS + legacy), duplicate version via DB check, plus warnings for best practices
- Returns structured errors + warnings, `isManifestValid()`

## 3. Capability System

**File:** `src/lib/agents/capabilities.ts`

Structured registry:
- PRIVATE_TRANSFER (riskWeight 2, requiresPrivacy true)
- PRIVATE_DISTRIBUTION (riskWeight 3, requiresPrivacy true)
- PAYMENT_SCHEDULING (riskWeight 2)
- TREASURY_MANAGEMENT (riskWeight 2, requiresPrivacy true)
- POLICY_ENFORCEMENT (0), HUMAN_APPROVAL (0), COMPLIANCE_REPORTING (0), EXECUTION_ATTESTATION (0), AUDIT_SUPPORT (0), PROCUREMENT (2), ANALYTICS (0)
- `isValidCapability()`, `getCapability()`, `capabilityRiskWeight()`, `capabilityRequiresPrivacy()`, `validateCapabilities()`, `validateIntentCapability()` — maps intent action to required capabilities, rejects if mismatch (e.g., capability PRIVATE_TRANSFER but intent PRIVATE_DISTRIBUTION → rejected)

## 4. Permission System

**File:** `src/lib/agents/permissions.ts`

- `AgentCapability`: id, supported
- `DeploymentPermission`: id, label, allowed, value, source capability/policy/recipient
- `PermissionModel`: agentId, deploymentId, capabilities, permissions, policy, actualAuthority { capabilities, assets, maxTransaction, dailyLimit, approvalThreshold, approvedRecipients, canModifyPolicy false, canAddRecipients false, canBypassPolicy false, canAccessWalletAuthority false }
- `buildPermissionModel()` builds from agentCapabilities + AgentPolicy — actual authority = intersection, agent must never infer additional authority
- `validatePermission()` — if agent does not support PRIVATE_DISTRIBUTION, do not allow distribution permissions
- `validatePermissions()` — checks all permissions against capabilities

Example authority:
```
Agent capability: PRIVATE_TRANSFER
Deployment permission: USDC
Policy: Maximum $500
Actual authority: PRIVATE_TRANSFER USDC ≤$500 approved recipients only
```

## 5. Publishing Workflow

**File:** `src/lib/agents/publishing.ts`

States: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, LIVE, SUSPENDED, DEPRECATED
Flow: Create Agent (createDraftAgent) → Validate Manifest → Submit (submitForReview) → Review (manifest validity, capabilities, policy compatibility, privacy behavior, risk classification, contract dependencies, verification) → Approve (approveAgent, reviewer != creator) → Register (AgentRegistry contract) → Publish (publishAgent) → LIVE

- `createDraftAgent(manifest, creatorWallet)` — validates manifest, checks duplicate ID, creates DbAgent with deploymentStatus DISABLED (DRAFT), creates publishing record in localStorage `holographic:db:v4:publishing_records`, creates agent_version DRAFT, creates notification, audit event agent_registered
- `submitForReview(agentId, creatorWallet)` — validates manifest, checks creator ownership, sets status SUBMITTED, submittedAt, updates agent to BETA/PENDING, audit event
- `approveAgent(agentId, reviewer, creatorWallet)` — checks reviewer != creatorWallet (creator cannot approve own agent), sets APPROVED, reviewedAt, approvedAt, reviewer, updates agent to LIVE/VERIFIED, audit event
- `rejectAgent(agentId, reviewer, reason)` — sets REJECTED, reviewNotes, agent DISABLED
- `publishAgent(agentId)` — checks APPROVED exists (unapproved cannot go LIVE), sets LIVE, publishedAt, agent LIVE
- `suspendAgent(agentId)` — sets SUSPENDED, suspendedAt, agent DISABLED/FAILED
- `deprecateAgent(agentId, creatorWallet)` — checks creator ownership, sets DEPRECATED, deprecatedAt, no new deployments, existing deployments receive warning via notifications type version_update_available, historical remains valid
- `getPublishingRecords()`, `getCreatorSubmissions()` — for creator dashboard

For MVP: permissioned, only approved creators can publish LIVE, no arbitrary public code uploads.

## 6. Creator Dashboard

**Routes:**
- /creator — My Agents, Drafts, Submissions, Versions, Deployments, Execution Metrics — shows stats My Agents, Submissions pending, Deployments active, Executions receipts, lists myAgents with verification badges + telemetry, submissions with status badges
- /creator/agents — create draft agent form with fields ID, Name, Version, Category, Risk, Supported assets, Description, Capabilities (structured buttons), Validate manifest button, Create draft button, plus My Agents list with Versions and Submit for review / Publish LIVE actions
- /creator/submissions — review panel: Manifest validity, Capabilities, Policy compatibility, Privacy behavior, Risk classification, Contract dependencies, Verification compatibility, Reviewer decisions APPROVE/REJECT/REQUEST CHANGES, review history, duplicate prevention, do not allow self-approval
- /creator/metrics — Execution Metrics: intent count, approved, blocked, human approvals, completed, failed, average execution duration, policy rejection rate, verification coverage — only required data, no private transaction info, plus Security boundaries panel, operational metrics from real data

Creators must NOT receive users' private wallet information — only userId, no viewing keys, no private notes.

## 7. Versioning

**Agent versions real:**
- Table agent_versions: id, agentId, version, manifestHash, actionSurface, assets, capabilities, createdAt, status active/superseded/revoked/DRAFT/ACTIVE/DISABLED, changes
- Every deployment references specific version via agentVersion
- Every execution references agentId, agentVersion (from deployment), deploymentId, policyId, policyVersion (from policy and intent metadata)
- Do not silently update deployed agent to new version — deployment keeps original, new version creates new agent_version record, old superseded

**Version update flow:**
- New Version → review changes → review capabilities → review risk → deploy version → migrate existing deployment if user chooses — never auto-migrate production
- UI shows CURRENT VERSION v1.0.0 and AVAILABLE VERSION v1.1.0 with [Review Update] via createVersion() which creates new version, supersedes old, updates agent version, creates version_update_available notifications for each deployment
- Policy versions: immutable once committed, policy_versions table, new version on edit, existing executions reference original

## 8. Risk Model

**File:** `src/lib/agents/risk.ts`

- LOW: Read-only reasoning / low-value controlled operations
- MEDIUM: Policy-controlled transfers
- HIGH: Large-value or complex financial workflows
- Calculated from declared capabilities and policy requirements via `calculateRisk()` — capability risk weights (PRIVATE_TRANSFER 2, PRIVATE_DISTRIBUTION 3, etc.) + policy requirements count *0.5 + asset count *0.3 + distribution support +2, normalized 0-10, LOW if <3, MEDIUM if 3-7, HIGH if >=7
- Display Declared Risk + Calculated Risk if both available, with reasons: high-risk capabilities, complex policy requirements, multiple assets, distribution support, declared vs calculated difference
- Do not rely solely on creator-provided risk labels — use calculated for safety, do not claim audited unless actual review via manifest.verification.audited

## 9. Health System

**File:** `src/lib/agents/health.ts`

- States: HEALTHY, DEGRADED, PAUSED, SUSPENDED, OFFLINE, NOT_DEPLOYED
- Calculate using real runtime data — do not mark healthy simply because DB record exists
- Checks: Deployment exists, Deployment status (PAUSED → PAUSED, DISABLED/DECOMMISSIONED/quarantined → SUSPENDED/OFFLINE, ACTIVE → pass), Backend availability (db.isAvailable()), Recent execution failures (0 → pass, <3 → warn, >=3 → fail), STRK20 availability (via localStorage adapterKind real → pass else warn), Verification coverage (receipts filtered, >=80% pass, >=50% warn)
- Final status: if paused/suspended/offline keep, else if backend unavailable → OFFLINE, recentFailures >=3 → DEGRADED, recentFailures >0 → DEGRADED, else HEALTHY
- `calculateAgentHealth(agentId, userId)`, `getAllAgentsHealth(userId)`

## 10. Marketplace changes

- Loads real agent data from DB (dbAgents) with fallback to mock for legacy compatibility
- Search by name, description, creator, capability — real filtering
- Filters: Category (TREASURY, PAYMENTS, DISTRIBUTION, COMPLIANCE, PROCUREMENT, ANALYTICS, Yield, Accumulation, Risk, Credit), Risk (LOW/MEDIUM/HIGH), Status (LIVE/BETA/PREPARED/DISABLED), Verification (VERIFIED/PENDING/FAILED/NOT_AVAILABLE), STRK20 support (privacyOnly checkbox)
- Sorting: Most used (real deployment count), Newest (createdAt), Verified (VERIFIED→PENDING→NOT_AVAILABLE→FAILED), Lowest risk (LOW→MEDIUM→HIGH) — note Most used uses real deployment count, not fabricated
- Agent cards show: name, creator, version, category, status, risk, STRK20 support, policy support, verification status, capabilities, actions VIEW/DEPLOY (DEPLOY only when deployable), badges REGISTERED, POLICY-CONTROLLED, STRK20 READY, ATTESTED, VERIFIED only when backed by actual implementation (deployment, policy, receipt, live status), PREPARED never VERIFIED, plus Application/OFFCHAIN vs ONCHAIN status line
- Agent detail page: comprehensive sections OVERVIEW, CAPABILITIES (structured), PERMISSIONS (capability vs permission distinction), POLICY (PolicyEditor), PRIVACY (PrivacyStatus), TRUST (OnchainStatus + operational metrics), VERSION (agentVersions), EXECUTION (TreasuryTransferForm + run cycle), AUDIT (audit trail) + DeploymentWizard with authority review + AgentWorkflow visualization
- Comparison: AgentComparison component allows up to 3 agents, compares Purpose, Capabilities, Assets, Risk, Policies, Privacy, Verification, Version, Operational metrics — lightweight, uses calculateTelemetry real data
- Deployment experience: terminology DEPLOY not INSTALL, shows Agent, Version, Capabilities, Permissions, Required policy, Risk, Privacy support, then Configure → Review → Deploy via DeploymentWizard with explicit confirmation

## 11. Security tests

**File:** `src/lib/agents/security.test.ts` — 14 tests:

- unapproved agent cannot go LIVE — publishAgent throws if not APPROVED
- creator cannot approve own agent — approveAgent checks reviewer != creatorWallet
- invalid manifest rejected — missing ID, invalid version, empty capabilities
- unsupported capability rejected — FAKE_CAPABILITY
- agent cannot acquire new capability silently — hasDistribution false, validateCapabilitiesForPermissions rejects PRIVATE_DISTRIBUTION when only PRIVATE_TRANSFER
- deprecated agent cannot create new deployments — deploymentStatus DISABLED after deprecate
- suspended agent cannot execute — pauseDeployment sets PAUSED/DISABLED, deployment status check blocks execution
- agent cannot bypass policy — validateAction rejects unapproved recipient
- agent cannot call wallet directly — enforceSecurityBoundary rejects callWalletApiDirectly
- agent cannot access private keys — rejects accessPrivateKeys
- agent cannot access viewing keys — rejects accessViewingKeys
- agent cannot access secrets — rejects accessWalletCredentials
- unauthorized wallet cannot deploy/manage someone else's agent — pauseDeployment checks userId ownership
- user cannot grant permissions outside capabilities — validateCapabilitiesForPermissions rejects PRIVATE_DISTRIBUTION when only PRIVATE_TRANSFER
- risk calculated from capabilities not just declared — calculateRisk returns declared + calculated + riskScore

All must fail safely — no crash, returns error or false.

## 12. API changes

- `src/lib/api/agents.ts` — extended to DbAgent with structured fields, seedAgents creates 4 initial + capabilities + metrics, added getAgentVersions, getAgentCapabilities, getAgentMetrics, validateManifest, registerAgent, createVersion with notifications for version update available
- `src/lib/api/deployments.ts` — deployAgent verifies wallet belongs to user and connected, checks duplicate active deployment idempotency, creates deployment DRAFT→ACTIVE + agent_version + policy + policy_version, pause/resume/disable verify ownership, added decommission
- `src/lib/api/endpoints.ts` — clear endpoints: GET /agents, GET /agents/:id, GET /agents/:id/versions, GET /agents/:id/health, GET /agents/:id/metrics, POST /agents, POST /agents/:id/versions, POST /agents/:id/submit, POST /agents/:id/deprecate, GET /deployments, GET /deployments/:id, POST /deployments/:id/activate/pause/resume/decommission, GET /creator/agents, GET /creator/submissions, GET /creator/metrics — all with ownership validation, blockchain execution inside domain service not raw STRK20
- `src/lib/db/client.ts` — v4 with new tables agent_capabilities, agent_permissions, agent_metrics, notifications, audit_requests, audit_events, verification_results, plus helpers getAgentCapabilitiesByAgent, getAgentMetricsByAgent, getNotificationsByUser, duplicate audit request check, idempotency for execution_requests
- `src/lib/agents/` — new SDK layer: capabilities, manifest, sdk, permissions, runtime, health, metrics, publishing, validator, registry, composition, risk, index

## 13. Database changes

- Added: agent_capabilities, agent_permissions, agent_metrics, notifications, plus existing audit_requests, audit_events, verification_results, policy_versions, agent_versions, policy_decisions, execution_results, execution_receipts
- Reused existing policy/execution/audit tables rather than duplicating
- Bumped version v3→v4
- Privacy-safe: never stores viewing keys, private keys, seed phrases, private notes, proof witnesses, shielded balances, private counterparty info beyond allowlist

## 14. Documentation added

- `AGENT_SPEC.md` — canonical Holographic agent specification with Agent model, Manifest, Capabilities, Permissions, Policy integration, Execution lifecycle, Security boundaries, Publishing process, Versioning, Verification, Risk model, Testing, Acceptance criteria
- `public/docs/agents.md` — /docs/agents documentation for Agent model, manifest, capabilities, permissions, policy integration, execution lifecycle, security boundaries, publishing process, versioning, verification, risk model
- `MARKETPLACE_REPORT.md` (previous milestone) — marketplace functionality
- `PERSISTENT_APP_REPORT.md`, `ONCHAIN_REPORT.md`, `STRK20_REPORT.md`, `REAL_WALLET_REPORT.md`, `DEBUG_REPORT.md` — previous milestones
- README.md updated with new routes /compliance, /verification, /creator, /creator/agents, /creator/submissions, /creator/metrics, plus contract table with LIVE/TESTNET/PHASE_2, plus agent catalog with LIVE/BETA/PREPARED

## 15. Build/test results

- `npm run build` → success, 1990 modules (now 1990 with new components), 1176kB (326kB gzip) — 4.6-5.6s due to vite-plugin-singlefile inlining 1.1MB + starknet v10 + get-starknet eval warnings, but dev server `npm run dev` is instant (<200ms HMR). Optimized by making RpcProvider dynamic imports in adapters and making tests dev-only via dynamic import in EngineConformance (only imports when import.meta.env.DEV or localhost, production shows placeholder)
- `scarb build` / `snforge test` — prepared, contracts rewritten to avoid is_zero() trait, simple immutable MVP, 23 tests scaffolded, need local toolchain to run
- Frontend tests: validateAction 40+, executePrivateTransfer 11 cases, persistence 15+, security 14 cases — 80+ total assertions via testKit async-aware runSuiteAsync() live in-browser on /policies page
- All tests pass in mock mode, no TS errors

## 16. Remaining limitations

- Contracts not yet deployed to Sepolia in this env — placeholder 0x0, deployed false, TESTNET status, need real Sepolia account + sncast + env vars, then update sepolia.json
- Scarb/snforge not installed in sandbox — cannot run locally here
- Starknet.js v10.4.0 requires Node >=22 — sandbox Node 20 shows EBADENGINE warnings but browser build works
- get-starknet UI uses eval — build warnings, may need CSP
- WalletConnect mobile adapter uses get-starknet discovery, not StarknetKit (incompatible with v10 peer ^8.0.0) — needs real mobile test
- Provider hardcoded Sepolia RPC — block number may be wrong if wallet on mainnet, should create provider per chainId dynamically
- Silent reconnect may still prompt if not pre-authorized — stays disconnected per spec, correct but may need neverAsk mode
- Privacy capability detection heuristic — checks strk20Balances method existence, NOT_REGISTERED still means capable
- No paymaster for gasless private transfers — AVNU paymaster mentioned, not yet integrated
- 10-block proving delay per SDK README not yet implemented
- Receipt block number from wallet_strk20InvokeTransaction only returns txHash, not block — need waitForTransaction
- Compliance report totals from DB, not onchain — if DB cleared, DATA INCOMPLETE
- Auditor roles enforced via userId filtering only, not onchain RBAC — MVP
- Agent manifest validation basic — checks required fields and allowed capabilities, but not full JSON schema validation
- Notifications in-app only, no email/SMS — per spec sufficient
- Agent comparison limited to 3 agents, no pagination for large catalog
- Deployment wizard uses PolicyEditor float model mapped to integer-safe — should consolidate to integer-safe only

## 17. Recommended Prompt 19 milestone

**Production hardening + Real Sepolia E2E + Pilot:**

1. Deploy 3 contracts to Sepolia via deploy-sepolia.sh:
   ```
   cd contracts
   scarb build
   snforge test
   export STARKNET_RPC_URL="https://starknet-sepolia.public.blastapi.io/rpc/v0_8"
   sncast declare --contract-name AgentRegistry --url $STARKNET_RPC_URL
   sncast deploy --class-hash <HASH> --arguments <OWNER_ADDRESS> --url $STARKNET_RPC_URL
   # Repeat for PolicyCommitment, ExecutionAttestor
   # Update sepolia.json with real addresses, tx hashes, timestamp
   ```

2. Update frontend config to set deployed true and isLive true after verification, add Voyager links

3. Test full lifecycle with Ready X extension on Sepolia:
   - Connect wallet → Marketplace loads real DB agents (DISCOVER) → Search works → Filters work (Category/Risk/Status/Verification/STRK20) → Agent details comprehensive (OVERVIEW, CAPABILITIES, PERMISSIONS, POLICY, PRIVACY, TRUST, VERSION, EXECUTION, AUDIT) + Workflow visualization + OnchainStatus → Deploy Treasury Agent via wizard (Review Agent → Capabilities → Policy → Recipients → Authority review with CAN/LIMITS/CANNOT + explicit confirm → Risk → Deploy → Activate) → Creates persistent record associated with wallet → Configure $500 max tx, $2000 daily, USDC, approved recipients → Add contractor → Review permissions → Activate → Execute "Pay contractor 10 USDC" → Policy APPROVE → Wallet auth wallet_strk20InvokeTransaction → txHash on Voyager → Receipt persisted with DEMO/STRK20 badge → Activity updates with filters ALL/APPROVED/BLOCKED/PENDING APPROVAL/COMPLETED/FAILED → Compliance dashboard VERIFIED → Verification Center full chain VERIFIED → Pause blocks new executions → Resume restores → Decommission prevents future but preserves history → Version update flow Review Update → Creator dashboard My Agents/Drafts/Submissions/Versions/Deployments/Execution Metrics → Agent health HEALTHY/DEGRADED/PAUSED/SUSPENDED/OFFLINE → Agent metrics operational metrics from real data

4. Add viewing-key disclosure UI for auditor (only when wallet supports and user explicitly authorizes disclosure via wallet's disclosure flow — never generate keys in app)

5. No cross-chain, no private OTC, no payroll, no permissionless publishing, no additional privacy protocols, no agent NFTs/staking/token mechanics — focus on genuinely useful and safe marketplace, one fully working real-world workflow over feature quantity

This milestone complete when: Marketplace loads real DB data, Search/Filters/Agent details/Versions/Capabilities structured, Deployment creates real persistent record associated with wallet, User configures real policy + recipients + reviews permissions + activates, Agent can execute according to capabilities and cannot outside, Pause blocks, Resume restores, Decommission prevents future but preserves history, Registry status real (ONCHAIN REGISTERED only after AgentRegistry confirms), Policy/verification status real, Operational metrics from real data, No fake reputation, Wallet connect/disconnect remains working, STRK20 private execution remains working, Compliance/verification remains working, Demo Mode remains working, npm run build succeeds, all tests pass.

Currently: All implemented in persistent DB mode, deployment wizard functional with authority review, pause/resume/decommission functional, versioning real, operational metrics from real data, verification badges backed by actual implementation, build green.

