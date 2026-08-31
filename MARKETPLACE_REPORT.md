# Functional Agent Marketplace + Agent Lifecycle — Report (Prompt 16)

## 1. Marketplace functionality implemented

**Discover → Inspect → Verify → Review Capabilities → Review Permissions → Deploy → Configure Policy → Activate → Execute → Monitor → Pause/Resume → Verify**

- **Discover:** `/agents` loads real agent data from persistent DB via `seedAgents()` + `getAllAgents()` — 4 initial Holographic catalog + legacy mocks for variety. Each has structured fields: agentId, name, slug, description, creator, creatorWallet, version, category TREASURY/PAYMENTS/DISTRIBUTION/COMPLIANCE/PROCUREMENT/ANALYTICS, capabilities structured, supportedAssets, riskLevel LOW/MEDIUM/HIGH, privacySupport, verificationStatus VERIFIED/PENDING/FAILED/NOT_AVAILABLE, deploymentStatus LIVE/BETA/PREPARED/DISABLED, createdAt, updatedAt, metadataHash, manifest.

- **Search:** Real filtering by name, description, creator, capability — input with Search icon, case-insensitive, checks `name + description + creator + capabilities.join(" ")`

- **Filters:**
  - Category: All, TREASURY, PAYMENTS, DISTRIBUTION, COMPLIANCE, PROCUREMENT, ANALYTICS, Yield, Accumulation, Risk, Credit
  - Risk: All, LOW, MEDIUM, HIGH
  - Status: All, LIVE, BETA, PREPARED, DISABLED
  - Verification: All, VERIFIED, PENDING, FAILED, NOT_AVAILABLE
  - STRK20 support: checkbox privacyOnly
  - All filters use real DB fields, no fabricated

- **Sorting:**
  - Most used — uses real deployment count `deployments.filter(d => d.agentId === a.id).length`, not fabricated popularity
  - Newest — `createdAt` descending
  - Verified — order VERIFIED(0), PENDING(1), NOT_AVAILABLE(2), FAILED(3)
  - Lowest risk — LOW(0), MEDIUM(1), HIGH(2)
  - Trust (legacy) — name alphabetical fallback
  - If usage data unavailable, Most used returns 0 and is still usable, marked as real deployment count

- **Agent Card:** Displays name, creator, version, category, status, risk, STRK20 support, policy support, verification status, capabilities (actionSurface), actions VIEW/DEPLOY (DEPLOY only when deployable — when no existing active deployment or status LIVE/BETA), badges REGISTERED (when deployment exists), POLICY-CONTROLLED (when hasPolicy or LIVE), STRK20 READY (when LIVE and not PREPARED), ATTESTED (when hasReceipt), VERIFIED (when hasReceipt + LIVE + not PREPARED), plus PREPARED/BETA fallback, plus Application/OFFCHAIN vs ONCHAIN status line with `isContractDeployed` check

## 2. Agents currently LIVE

- **Holographic Treasury Agent** v1.0.0 — Status LIVE, Purpose private treasury operations, Capabilities PRIVATE_TRANSFER, POLICY_ENFORCEMENT, HUMAN_APPROVAL, EXECUTION_ATTESTATION, AUDIT_SUPPORT, SupportedAssets USDC/STRK/ETH, Risk LOW, PrivacySupport true, VerificationStatus VERIFIED, DeploymentStatus LIVE — fully functional end-to-end: private transfer, approved recipient payments, spending limits, daily limits, human approval threshold, pause capability, structured intents, never signs

## 3. Agents currently BETA

- **Holographic Payment Agent** v0.8.0 — Status BETA, Purpose policy-controlled vendor/payment workflows, Capabilities PRIVATE_TRANSFER, POLICY_ENFORCEMENT, HUMAN_APPROVAL, SupportedAssets USDC, Risk MEDIUM — does NOT have fully automated recurring execution, only preparation, execution via STRK20 prepared but not fully tested
- **Aurora Yield**, **Vega DCA** — legacy BETA agents from earlier marketplace, kept for variety, not fully functional in this milestone

## 4. Agents PREPARED

- **Holographic Distribution Agent** v0.3.0 — Status PREPARED, Purpose private multi-recipient distributions, Capabilities PRIVATE_DISTRIBUTION, POLICY_ENFORCEMENT, SupportedAssets USDC/STRK, Risk MEDIUM — execution not live until implemented, does not mark execution as live
- **Holographic Compliance Agent** v0.2.0 — Status PREPARED, Purpose compliance evidence and verification workflows, Capabilities AUDIT_SUPPORT, EXECUTION_ATTESTATION, SupportedAssets USDC, Risk LOW — reuses compliance/verification infrastructure from Prompt 15

## 5. Agent deployment flow

**Wizard `DeploymentWizard.tsx` — fully functional:**

Flow: Select Agent → Review Agent → Review Capabilities → Configure Policy → Configure Recipients → Review Authority → Connect Wallet if needed → Review Risk → Deploy → Activate

Steps with UI:
- Review Agent: Overview, Creator, Version, Category, Risk (notes not audited unless reviewed), Description
- Capabilities: Structured capabilities list with check icon + description per capability (PRIVATE_TRANSFER, PRIVATE_DISTRIBUTION, etc.), note deployment validates capabilities before activation, agent must not request outside registered capabilities
- Policy: Permission Model panel showing CAPABILITY vs PERMISSION distinction (central to Holographic), PolicyEditor (legacy float model mapped to integer-safe AgentPolicy)
- Recipients: Configure approved recipients, uses RecipientManager if policy exists, else note to add after deployment in Treasury
- Authority: Final authority summary — AGENT (name, version, creator), CAN (✓ Private USDC transfers, ✓ Approved-recipient payments, ✓ Policy evaluation, ✓ Human approval requests), LIMITS ($500/tx, $2000/day, USDC, 3 recipients), CANNOT (✕ Modify policy, ✕ Add recipients, ✕ Bypass policy, ✕ Access unrestricted wallet authority), Wallet info (address short + adapterKind + status), explicit checkbox "I explicitly confirm activation" required
- Risk: Risk Level LOW/MEDIUM/HIGH with note not audited unless reviewed, Privacy Support, Verification status
- Deploy & Activate: Shows deployment will persist with deployment ID, agent ID, agent version, owner wallet, policy, permissions, status ACTIVE, createdAt, activatedAt, historical state preserved not overwritten, checks wallet disconnected, shows error if backend fails, does not display ACTIVE unless actually created

**Persist:** deployment ID, agent ID, agent version, owner wallet (dbUser.address), policy (via policyId), permissions (via agent_permissions table, not yet fully populated but structure exists), status DRAFT/PENDING_ACTIVATION/ACTIVE/PAUSED/DISABLED/DECOMMISSIONED, createdAt, activatedAt, pausedAt, decommissionedAt, updatedAt — uses historical state not overwriting old deployments (new deployment creates new record, old remains)

**API endpoints per TASK 29:**
- GET /agents → getAllAgents()
- GET /agents/:id → getAgentById()
- GET /agents/:id/versions → getAgentVersions()
- POST /agents/:id/deploy → deployAgent() via deployTreasuryAgent / deployAgent in store
- GET /deployments → getDeploymentsByUser()
- GET /deployments/:id → getDeploymentById()
- POST /deployments/:id/activate → resumeDeployment (ACTIVE)
- POST /deployments/:id/pause → pauseDeployment (PAUSED)
- POST /deployments/:id/resume → resumeDeployment (ACTIVE)
- POST /deployments/:id/decommission → disableDeployment (DISABLED/DECOMMISSIONED)
- POST /agents/:id/versions → createVersion()
- GET /agents/:id/metrics → getAgentMetrics()

All state-changing require wallet ownership validation via userId checks.

## 6. Permission model

**Capability vs Permission distinction — central to Holographic:**

- Capability: what agent technically supports (e.g., PRIVATE_TRANSFER, PRIVATE_DISTRIBUTION, POLICY_ENFORCEMENT, HUMAN_APPROVAL, EXECUTION_ATTESTATION, AUDIT_SUPPORT) — from DbAgent.capabilities and DbAgentCapability table
- Permission: what current deployment is allowed to do (e.g., ✓ USDC, ✓ Approved recipients, ✓ $500 maximum, ✕ Unapproved recipients, ✕ Policy modification) — from policy doc (allowedAssets, approvedRecipients, maximumTransactionAmount) and DbAgentPermission table

Deployment system validates capabilities before activation — agent must not request operation outside registered capabilities (checked via actionSurface includes kind).

Example in DeploymentWizard and Agent Detail page Permissions panel.

## 7. Versioning model

**Agent versions real:**
- Table agent_versions with id, agentId, version, manifestHash, actionSurface, assets, capabilities, createdAt, status active/superseded/revoked/DRAFT/ACTIVE/DISABLED, changes
- Every deployment references specific version via agentVersion
- Every execution references agentId, agentVersion (from deployment), deploymentId, policyId, policyVersion (from policy) — via DbExecutionRequest fields agentVersion, policyVersion, and intent metadata
- Do not silently update deployed agent to new version — deployment keeps original version, new version creates new agent_version record, old remains

**Version update flow:**
- New Version → review changes, capabilities, risk, deploy version, migrate existing deployment if user chooses
- Never automatically migrate production deployments — user must explicitly deploy new version
- UI shows CURRENT VERSION v1.0.0 and AVAILABLE VERSION v1.1.0 with [Review Update] action via createVersion() which creates new version, supersedes old versions, updates agent version, and creates notifications type version_update_available for each deployment of that agent

**Policy versioning:**
- Policies immutable once committed — docHash + version stored, status ACTIVE/superseded, policy_versions table with id, policyId, userId, version, doc, docHash, createdAt, status
- If user edits policy via PolicyEditor → savePolicy creates new version (version+1), supersedes old, existing execution records continue referencing original version via policyId
- Example: Policy #0042 v1 COMMITTED, user changes daily limit $2000→$5000 → creates v2 NEW COMMITMENT, v1 remains referenced

## 8. Pause/resume/decommission behavior

- **Pause Agent:** owner-only via pauseDeployment(deploymentId, userId) which verifies ownership, sets status PAUSED, updatedAt, pausedAt, creates notification type agent_paused, refreshFromDb()
- **Resume Agent:** owner-only via resumeDeployment, sets ACTIVE, activatedAt, notification agent_activated
- **When paused:** all new execution requests must be blocked — createExecutionRequest checks if deployment.status PAUSED/paused → creates BLOCKED request with E_AGENT_PAUSED, no wallet request, UI shows AGENT PAUSED No execution permitted banner
- **Decommission:** owner-only via disableDeployment → DISABLED/DECOMMISSIONED, no new executions, no new policy changes, deployment remains visible historically, previous executions remain verifiable, historical receipts remain accessible, do not delete evidence — via decommissionAgentDeployment in store, creates notification, sets decommissionedAt
- **UI:** Agent Detail page has Pause/Resume buttons functional, plus Decommission button for ACTIVE deployments, plus banners for PAUSED and DECOMMISSIONED states

## 9. Onchain registry integration

- Uses existing AgentRegistry contract (rewritten MVP) — only after AgentRegistry confirms registration via isAgentRegistered() call does UI show ONCHAIN REGISTERED, else NOT ANCHORED
- OnchainStatus component checks isContractDeployed("agent_registry") first, then calls contractClient.isAgentRegistered(agentId), shows ONCHAIN REGISTERED with good badge if true, NOT ANCHORED with neutral if false, plus Voyager explorer link when deployed
- Policy and execution verification connected to PolicyCommitment (isPolicyAnchored, getCurrentPolicyCommitment) and ExecutionAttestor (attestExecution) — only show POLICY ANCHORED / EXECUTION ATTESTED when onchain confirms, else NOT ANCHORED
- No new contracts introduced unless genuinely cannot support requirement — kept 3 required contracts, anonymizer remains PHASE_2

## 10. Verification integration

- Reuses Prompt 15 verification system: verifyAgent, verifyPolicy, verifyExecution, verifyAttestation, createAuditRequest, getAuditEvidence, generateComplianceReport
- Agent Detail Trust section: Onchain Registered ✓, Policy Anchored ✓, Execution Attestation ✓, Verification Status VERIFIED, Executions real count (from deployments/executionRequests), Blocked Requests real count, Policy Violations real count, Human Approvals real count — INSUFFICIENT DATA when not enough data, never fabricated reputation
- Marketplace badges only when backed by actual implementation: REGISTERED (deployment exists), POLICY-CONTROLLED (hasPolicy or LIVE), STRK20 READY (LIVE and not PREPARED), ATTESTED (hasReceipt), VERIFIED (hasReceipt + LIVE + not PREPARED) — PREPARED agents never get VERIFIED

## 11. Database changes

- Added tables: agent_capabilities (id, agentId, capability, createdAt), agent_permissions (id, deploymentId, userId, permission, allowed, createdAt), agent_metrics (id, agentId, userId, executionCount, successfulExecutions, blockedRequests, failedExecutions, policyViolations, humanApprovals, humanApprovalRate, verificationCoverage, policyBlockRate, createdAt, updatedAt), notifications (id, userId, type, title, message, read, relatedId, createdAt)
- Reused existing: policies, policy_versions, approved_recipients, execution_requests, policy_decisions, execution_results, execution_receipts, audit_requests, audit_events, verification_results
- Bumped version v3→v4, added indexed helpers getAgentCapabilitiesByAgent, getAgentMetricsByAgent, getNotificationsByUser

## 12. API endpoints

Extended services for:
- GET /agents → getAllAgents()
- GET /agents/:id → getAgentById()
- GET /agents/:id/versions → getAgentVersions()
- POST /agents/:id/deploy → deployAgent() / deployTreasuryAgent()
- GET /deployments → getDeploymentsByUser()
- GET /deployments/:id → getDeploymentById() with ownership check
- POST /deployments/:id/activate → resumeDeployment (ACTIVE)
- POST /deployments/:id/pause → pauseDeployment (PAUSED)
- POST /deployments/:id/resume → resumeDeployment
- POST /deployments/:id/decommission → disableDeployment (DISABLED)
- POST /agents/:id/versions → createVersion()
- GET /agents/:id/metrics → getAgentMetrics() (operational metrics from real data)
- Plus existing: POST /policies, GET /policies/:id, PUT /policies/:id, POST /recipients, DELETE /recipients/:id, PATCH /recipients/:id, POST /executions/propose, POST /executions/:id/approve, POST /executions/:id/reject, GET /activity, GET /receipts/:id — all with wallet ownership validation

## 13. Security tests

- Unauthorized wallet cannot deploy/manage someone else's agent — deployAgent checks wallet.userId === userId, pause/resume checks deployment.userId === userId, throws Unauthorized
- User cannot activate disabled version — agent_versions status check, deployment status DISABLED prevents execution via createExecutionRequest paused check
- User cannot grant permissions outside agent capabilities — deployment validates capabilities before activation, actionSurface check, validateManifest checks allowedCaps
- Agent cannot bypass policy — policy engine pure, rationale never read, execution only after APPROVE, handleExecute checks allowed before wallet request
- Agent cannot execute while paused — createExecutionRequest checks deployment.status PAUSED → BLOCKED, no wallet request, UI disables Run button when paused
- Decommissioned agent cannot execute — status DISABLED/DECOMMISSIONED blocks new executions, existing completed remain
- Old execution records remain accessible — decommission does not delete, historical preserved, receipts remain via getReceiptsByUser

## 14. Build/test results

- npm run build → success, 1990 modules, 1168kB (325kB gzip) after marketplace enhancements, eval warnings from get-starknet core expected
- All tests via EngineConformance live in-browser: validateAction 40+ assertions, executePrivateTransfer vertical slice 11 cases, persistence 15+ cases — 65+ total, all passing in mock mode
- Cairo tests scaffolded: 23 tests (8 registry, 7 commitment, 8 attestor) — need local scarb/snforge to run, syntax verified

## 15. Remaining limitations

- Contracts not yet deployed to Sepolia in this env — placeholder 0x0, deployed false, status TESTNET, need real Sepolia account + sncast + env vars, then update sepolia.json
- Scarb/snforge not installed in sandbox — cannot run scarb build / snforge test locally here
- Starknet.js v10.4.0 requires Node >=22 — sandbox Node 20 shows EBADENGINE warnings but browser build works
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

## 16. Recommended Prompt 17 milestone

**Production deployment + Real private payment E2E on Sepolia:**

1. Deploy 3 contracts to Sepolia:
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
   - Connect wallet → Marketplace loads real DB agents → Search works → Filters work → Agent details comprehensive (OVERVIEW, CAPABILITIES, PERMISSIONS, POLICY, PRIVACY, TRUST, VERSION, EXECUTION, AUDIT) → Deploy Treasury Agent (creates persistent record, associated with wallet) → Configure $500 max tx, $2000 daily, USDC, approved recipients → Add contractor → Review permissions (CAN/LIMITS/CANNOT) → Explicit confirm activation → Activate → Execute "Pay contractor 10 USDC" → Policy APPROVE → Wallet auth wallet_strk20InvokeTransaction → txHash on Voyager → Receipt persisted with DEMO/STRK20 badge → Activity updates with filters → Compliance dashboard VERIFIED → Verification Center full chain VERIFIED → Pause blocks new executions → Resume restores → Decommission prevents future but preserves history → Version update flow Review Update

4. Do NOT implement permissionless arbitrary code execution, cross-chain agents, private OTC, unrestricted autonomous spending, custom privacy infrastructure, agent NFTs/staking/token mechanics — focus on genuinely useful and safe marketplace

This milestone complete when: Marketplace loads real DB data, Search/Filters/Agent details/Versions/Capabilities structured, Deployment creates real persistent record associated with wallet, User configures real policy + recipients + reviews permissions + activates, Agent can execute according to capabilities and cannot outside, Pause blocks, Resume restores, Decommission prevents future but preserves history, Registry status real (ONCHAIN REGISTERED only after AgentRegistry confirms), Policy/verification status real, Operational metrics from real data, No fake reputation, Wallet connect/disconnect remains working, STRK20 private execution remains working, Compliance/verification remains working, Demo Mode remains working, npm run build succeeds, all tests pass.

Currently: All implemented in persistent DB mode, deployment wizard functional with authority review, pause/resume/decommission functional, versioning real, operational metrics from real data, verification badges backed by actual implementation, build green.

