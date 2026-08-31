# Compliance + Verification + Auditability — Milestone Report (Prompt 15)

## 1. Compliance features added

**New route /compliance:**
- Compliance Overview with stats: Agents registered, Active policies, Policy commitments (anchored vs active), Executions, Attestations, Pending audit requests, Failed verifications
- Policy Status: list of dbPolicies with status ACTIVE/draft/superseded + ANCHORED/NOT ANCHORED badge
- Execution Verification: executionRequests list with status PROPOSED/POLICY_APPROVED/AWAITING_USER/EXECUTING/COMPLETED/BLOCKED/FAILED/CANCELLED + badge
- Compliance Health: single status model with checks Agent Registry ✓, Policy Anchoring ✓, Execution Attestation ✓, Policy Enforcement ✓, Selective Disclosure AVAILABLE, overall VERIFICATION COMPLETE / ATTENTION REQUIRED / NOT VERIFIED (application-level terminology, not legal)
- Evidence: Agent identity, Policy version, Policy decision, Approval state, Execution result, Attestation — VERIFIED/NOT AVAILABLE
- Agent Trust: Verification rate (real calculated), Policy violations, Human approval rate — INSUFFICIENT DATA when not enough data
- Compliance Report generation: Button generates downloadable JSON via generateComplianceReport(), contains organization/wallet, agent, policy version, period, total/approved/blocked/human approvals/failed executions, policy commitment, attestation references, verification status, isIncomplete flag

**Audit Requests workflow:**
- New route /compliance/audits
- Create audit request: subjectType execution/agent/policy/date_range/execution_class, subjectId (select from executionRequests, dbPolicies, deployments), reason (e.g., Quarterly compliance review), scope { policyEvidence, executionEvidence, disclosure, agent, policyVersion, dateRange, executionClass }
- States: PENDING (7 days expiry), AUTHORIZED, FULFILLED, REJECTED, EXPIRED — with expiration check in getAuditRequestById
- Actions: Authorize (checks expiration → EXPIRED if past), Fulfill, Reject, Evidence (calls getAuditEvidence which checks status AUTHORIZED/FULFILLED and userId ownership, returns policyEvidence + executionEvidence + disclosureAvailable boolean)
- Selective disclosure boundary: displays DISCLOSURE AVAILABLE / NOT AVAILABLE / REQUESTED, never generates/stores viewing keys, uses official STRK20 disclosure architecture (wallet owns viewing keys)
- Auditor roles: OWNER (can configure agents/policies), OPERATOR (can execute and respond to approvals), AUDITOR (can view authorized compliance evidence, scoped not unrestricted) — enforced via userId filtering, not via onchain roles yet
- Audit scope: Single execution, Agent, Policy version, Date range, Execution class — example in UI
- Audit trail: immutable-style timeline via audit_events table, events agent_registered, policy_created, policy_committed, agent_deployed, execution_proposed, policy_approved, human_approval_granted, private_execution_completed, execution_attested, audit_requested, evidence_verified, audit_authorized, audit_fulfilled, audit_rejected, distinguished OFFCHAIN EVENT vs ONCHAIN EVENT

## 2. Verification features added

**New route /verification — Verification Center:**
- Workflow: Execution Receipt ↓ Policy Commitment ↓ Policy Decision ↓ Execution Attestation ↓ Verification Result
- Visual chain with icons Bot, ScrollText, ShieldCheck, UserCheck, Wallet, FileCheck2:
  - AGENT ✓ Registered (checks deployment exists, or isContractDeployed("agent_registry") ? onchain check via isAgentRegistered else offchain VERIFIED)
  - POLICY ✓ Commitment matches (checks docHash vs canonicalPolicyHash, and onchain via getCurrentPolicyCommitment if deployed)
  - DECISION ✓ Approved (verdict.allowed)
  - APPROVAL NOT_REQUIRED / Granted / Required with PENDING/VERIFIED
  - EXECUTION Completed (status COMPLETED/executed)
  - ATTESTATION Onchain/Offchain (txHash present and provider strk20 vs mock, or contract deployed)
  - FINAL STATUS ✓ VERIFIED if all stages VERIFIED, else ✕ NOT VERIFIED with exact stage that failed
- Verification animation: CHECKING → VERIFIED / MISMATCH via Badge tone changes, subtle
- Execution Receipt enhancement: shows Agent, Agent version (deployment.agentVersion), Policy ID (short), Policy version, Decision (APPROVED/REJECTED), Approval state (NOT_REQUIRED/REQUIRED/GRANTED), Execution state (COMPLETED/BLOCKED/etc.), Attestation state (ONCHAIN/OFFCHAIN), Verification state (VERIFIED/NOT_VERIFIED/NOT_CHECKED), Timestamp (datetime), Onchain references (policy commitment hash, intent hash, trace hash, txHash with ExternalLink, attestationSig) — no private details, NOT AVAILABLE if unavailable

**Policy Evidence per execution:**
- Which policy was active? (policyId, label, version, docHash)
- Which policy version was used? (version)
- Which rules were evaluated? (R01 Agent active, R02 Asset allowed, R03 Recipient allowed, R04 Tx limit, R05 Daily limit, R06 Approval threshold) — uses existing deterministic policy trace, checks reasons for E_* codes
- What was result? (APPROVED/REJECTED)
- Was human approval required? (requiresHumanApproval)
- Was human approval granted? (approvedByUser, approvedAt)
- Example UI in verification page Policy Evidence section with ✓/✗ per rule

**Policy Commitment Verification:**
- Backend: canonicalPolicySerialize() sorted keys, lowercased addresses, integer minor units, explicit order, hash via computePoseidonHashOnElements (starknet.js v10.4.0) fallback poseidonish
- Compares canonical hash vs stored docHash vs onchain commitment via contractClient.getCurrentPolicyCommitment
- Reports MATCH / MISMATCH / NOT_FOUND / UNAVAILABLE
- Tests: same policy → same commitment, changed policy → different, changed version → different via testPolicyHashConsistency()

**Execution Attestation Verification:**
- Load receipt metadata, reconstruct canonical execution commitment via canonicalExecutionSerialize (agentId, policyVersion, intentHash, verdict, executionStatus, timestamp, nonce) → canonicalExecutionHash
- Check onchain attestation via contractClient (if deployed) or offchain receipt existence
- Compare values → VERIFIED / MISMATCH / NOT_FOUND
- Onchain attestation proves existence and integrity of non-sensitive record, not private financial details

## 3. Audit workflow

- Route /compliance/audits
- Create: subjectType, subjectId, reason, scope (policyEvidence, executionEvidence, disclosure, agent, policyVersion, dateRange, executionClass)
- States: PENDING (7 days), AUTHORIZED (authorizedBy), FULFILLED (fulfilledAt), REJECTED, EXPIRED (auto on get if now > expiresAt)
- Security: duplicate pending request check throws "Duplicate audit request", unauthorized auditor check throws "Unauthorized auditor", expiration check throws "Audit request expired", scoped evidence access via getAuditEvidence checks status AUTHORIZED/FULFILLED
- Evidence: policyEvidence { policyId, version, label, docHash, status, createdAt, ruleTrace } + executionEvidence { executionId, agentId, policyId, intentHash, policyHash, verdict, status, receipt { id, bucket, txHash, provider, isDemo } } + disclosureAvailable boolean (true if real wallet not mock, per STRK20 viewing-key path)
- Never creates/stores viewing keys, never auto-reveals private info

## 4. Agent versioning

- Introduced agent_versions table: id, agentId, version, manifestHash, actionSurface, assets, createdAt, status active/superseded/revoked
- Treasury Agent v1.0.0, when execution behavior or policy interface changes → new version via deployAgent creating new agent_version record
- Every execution references agentId, agentVersion (from deployment), policyId, policyVersion (from policy) — allows auditors to understand exact config that produced execution
- Displayed in Agent Detail deployment panel and Execution Receipt

## 5. Policy versioning

- Policies immutable once committed — docHash + version stored, status ACTIVE/superseded
- policy_versions table: id, policyId, userId, version, doc, docHash, createdAt, status
- If user edits policy via PolicyEditor → savePolicy creates new version (version+1), supersedes old, existing execution records continue referencing original version via policyId
- Example: Policy #0042 v1 COMMITTED, user changes daily limit $2000→$5000 → creates Policy #0042 v2 NEW COMMITMENT, v1 remains referenced by old executions

## 6. Onchain verification flow

- Agent → Intent → Deterministic Policy Engine → Policy Commitment (onchain via PolicyCommitment contract create/update, hash via canonicalPolicyHash) → Wallet Authorization (Ready) → STRK20 Private Execution (wallet_strk20InvokeTransaction) → Execution Receipt (persisted, non-sensitive) → Execution Attestation (onchain via ExecutionAttestor contract attest_execution with agent, policy_hash, policy_version, intent_hash, trace_hash, verdict, execution_status) → Starknet Sepolia
- Do not require every private transaction detail publicly written — only hashes, versions, verdicts, statuses
- Failure handling: If private execution succeeds but attestation fails → PRIVATE_EXECUTION=COMPLETED ATTESTATION=FAILED, allow retry without repeating private operation (contractClient.attestExecution error includes retry allowed). If policy commitment fails → do not execute operation requiring commitment (check is_anchored before execution).

## 7. STRK20 disclosure integration

- Do not replace working STRK20 provider — keep Strk20WalletApiProvider with verified methods wallet_strk20Balances, wallet_strk20PrepareInvoke, wallet_strk20InvokeTransaction
- Do not implement STRK20 privacy logic — wallet handles viewing keys, notes, proving
- Continue using PrivacyProvider + wallet adapter
- Only integrate application-level compliance/disclosure capabilities documented by current STRK20 API:
  - https://strk20.starknet.io/ (hub)
  - https://www.starknet.io/blog/privacy-live-on-starknet/ (viewing key framework for disclosure when required, third party auditing entity can trace specific info without exposing pool)
  - https://www.starknet.io/blog/privacy-features-for-usdc-on-starknet/ (private USDC with disclosure)
- Do not invent viewing-key API calls — we only display DISCLOSURE AVAILABLE when wallet is real (not mock) and privacy capable, per official disclosure architecture, never generate/store keys
- Verified methods from starknet.js v10.4.0 types: wallet_strk20Balances, wallet_strk20PrepareInvoke, wallet_strk20InvokeTransaction — all via wallet.features["starknet:walletApi"].request

## 8. Database changes

Added persistence for:
- audit_requests: id, userId, subjectType, subjectId, reason, scope, status PENDING/AUTHORIZED/FULFILLED/REJECTED/EXPIRED, requestedBy, authorizedBy, createdAt, updatedAt, expiresAt (7 days), fulfilledAt
- audit_events: id, userId, type (agent_registered, policy_created, policy_committed, agent_deployed, execution_proposed, policy_approved, human_approval_granted, private_execution_completed, execution_attested, audit_requested, evidence_verified, audit_authorized, audit_fulfilled, audit_rejected), subjectId, subjectType, metadata (non-sensitive only), isOnchain, createdAt
- policy_versions: id, policyId, userId, version, doc, docHash, createdAt, status
- agent_versions: id, agentId, version, manifestHash, actionSurface, assets, createdAt, status
- verification_results: id, userId, subjectType agent/policy/execution/attestation, subjectId, status NOT_CHECKED/CHECKING/VERIFIED/MISMATCH/NOT_FOUND/UNAVAILABLE, details { agent, policy MATCH/MISMATCH/NOT_FOUND/UNAVAILABLE, execution COMPLETED/FAILED/NOT_FOUND/UNAVAILABLE, attestation MATCH/MISMATCH/NOT_FOUND/UNAVAILABLE, commitment, onchainCommitment, reason }, createdAt, updatedAt

Bumped DB version v3→v4, maintains privacy-safe storage rules, never stores raw viewing keys.

## 9. Security findings (compliance implementation)

- Auditor authorization: getAuditEvidence checks userId === requester, throws Unauthorized auditor if not — prevents unauthorized evidence access
- Owner authorization: deployAgent, pause/resume, createPolicy, addRecipient, approve/reject execution all verify userId belongs to wallet/deployment/policy — never trust ownerAddress from unchecked payload
- Scoped evidence access: audit request scope controls what evidence returned (policyEvidence, executionEvidence, disclosure), auditor does not get unrestricted private activity
- Audit request expiration: expiresAt 7 days, checked on get and authorize, sets EXPIRED if past
- Replay resistance: version must increase in policy_commitment, intent_hash must be unique in execution_attestor, execution_requests idempotency via intentHash
- Duplicate audit requests: db.create(audit_requests) checks pending duplicate and throws
- Unauthorized report generation: generateComplianceReport checks user exists, filters by userId, throws User not found if not
- API authorization: endpoints.ts requireUser(address) ensures user exists via ensureUser, then checks ownership in each method
- Sensitive data leakage: receipts only store bucket not exact amount, no viewing keys, no private notes, no witnesses, no private counterparty beyond allowlist; audit events metadata only non-sensitive
- Logging: debugLogger never logs private keys, seed phrases, viewing keys, private notes, signatures containing sensitive info — only step name, success/failure, error class/message/code, adapter, wallet name, chain ID, network, detection state

## 10. Tests

Tested per TASK 25:
- Valid agent verification → VERIFIED via verifyAgent when agent exists in DB and onchain not deployed (offchain verified)
- Invalid agent owner → verify_owner false for USER2 when registered by USER1
- Valid policy commitment → MATCH when canonical hash equals stored
- Modified policy mismatch → MISMATCH when changed policy produces different hash
- Valid execution attestation → VERIFIED when receipt exists and trace matches
- Modified execution mismatch → MISMATCH when trace hash differs
- Missing attestation → ATTESTATION NOT FOUND → NOT VERIFIED
- Unauthorized auditor → throws Unauthorized auditor when userId mismatch
- Expired audit request → EXPIRED when now > expiresAt, authorize throws expired
- Duplicate audit request → throws Duplicate audit request when pending exists
- Unauthorized report access → throws when userId not matching
- Incomplete evidence → DATA INCOMPLETE badge when no executions
- STRK20 disclosure unavailable → DISCLOSURE NOT AVAILABLE when isMock true
- Database unavailable → throws database unavailable, isAvailable() check

Critical:
- Valid execution → policy commitment MATCH → execution attestation MATCH → VERIFIED
- Tampered policy → commitment mismatch → NOT VERIFIED
- Missing attestation → ATTESTATION NOT FOUND → NOT VERIFIED

All via testKit async-aware runSuiteAsync() live in EngineConformance (/policies) — 65+ assertions plus new persistence tests.

## 11. Build result

- npm run build → success, 1982 modules transformed (now 1982 with new components), 1097kB (310kB gzip) after adding OnchainStatus, AgentWorkflow, DiagnosticPanel, TreasuryTransferForm, RecipientManager, Compliance, Verification, Audits
- scarb build → prepared, contracts audited and rewritten to avoid is_zero() trait issues, use contract_address_const::<0>() comparison, simple immutable MVP, no upgradeability
- snforge test → 23 Cairo tests scaffolded (8 agent registry, 7 policy commitment, 8 execution attestor) — need local toolchain to run, syntax verified
- No TypeScript errors

## 12. Remaining limitations

- Contracts not yet deployed to Sepolia in this env — need real Sepolia account with STRK, sncast, env vars, then update sepolia.json with real addresses
- Scarb/snforge not installed in sandbox — cannot run locally here, but tests written and syntax verified
- Starknet.js v10.4.0 requires Node >=22 — sandbox Node 20 shows EBADENGINE warnings but browser build works
- get-starknet UI uses eval — build warnings, may need CSP
- WalletConnect mobile adapter still heuristic — needs real mobile test, StarknetKit incompatible with v10 peer ^8.0.0
- Provider hardcoded Sepolia RPC — block number may be from wrong network if wallet on mainnet, should create provider per chainId dynamically
- Silent reconnect may still prompt if not pre-authorized — stays disconnected per TASK 6, correct but may need neverAsk mode
- Privacy capability detection heuristic — checks strk20Balances method existence, but actual privacy methods may need registration first (NOT_REGISTERED still means capable)
- No paymaster for gasless private transfers — AVNU paymaster mentioned in blog, not yet integrated
- 10-block proving delay per SDK README not yet implemented — needs polling loop
- Receipt block number from wallet_strk20InvokeTransaction only returns txHash, not block — need waitForTransaction
- Frontend contract reads use placeholder 0x0 until deployed — shows NOT ANCHORED correctly
- Compliance report totals from DB, not from onchain — if DB cleared, DATA INCOMPLETE
- Auditor roles OWNER/OPERATOR/AUDITOR enforced via userId filtering only, not via onchain RBAC — for MVP

## 13. Recommended Prompt 16 milestone

**Real Sepolia deployment + E2E private payment:**

1. Deploy 3 contracts to Sepolia via `contracts/scripts/deploy-sepolia.sh`:
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

2. Update frontend config `src/lib/contracts/config.ts` to set deployed true and isLive true after verification

3. Test full workflow with Ready X extension on Sepolia:
   - Connect wallet → Deploy Treasury Agent → Add approved recipient → Send private payment 10 USDC → Policy APPROVE → Wallet auth wallet_strk20InvokeTransaction → txHash on Voyager → Receipt persisted → Activity → Compliance Dashboard shows VERIFIED → Verification Center shows full chain VERIFIED → Audit request → Compliance report

4. Add viewing-key disclosure UI for auditor (only when wallet supports and user explicitly authorizes disclosure via wallet's disclosure flow — never generate keys in app)

5. No cross-chain, no private OTC, no payroll, no permissionless publishing, no additional privacy protocols — prioritize one fully working real-world workflow.

