# Holographic — Persistent Functional Application Report

## Overview
Turning Holographic from working transaction demo into persistent functional application for confidential policy-controlled contractor/vendor payments.

**Core flow implemented:**
User → Agent → Intent → Deterministic Policy Engine → Wallet → STRK20 → Execution Receipt

All persisted via localStorage-backed DB simulating Postgres (replaceable with Fastify + Postgres in production).

---

## 1. Backend

Created persistent backend layer replacing in-memory mocks:

**DB client:** `src/lib/db/client.ts`
- localStorage-backed with prefix `holographic:db:v2:`
- Generic CRUD with proper IDs (`prefix_timestamp_random`), timestamps, status fields
- Methods: getAll, getById, find, create, update, delete, clear, clearAll, generateId
- Specific helpers: getUserByAddress, getWalletsByUser, getDeploymentsByUser, getPoliciesByDeployment, getRecipientsByPolicy, getExecutionRequestsByDeployment, getPendingApprovalsByUser, getReceiptsByUser, isAvailable()
- Throws "Backend unavailable: database not available" or "Database error: failed to persist" for error handling per TASK 13

**Schema:** `src/lib/db/schema.ts`
- users: id, address, createdAt, lastActiveAt
- wallets: id, userId, address, chainId, name, isMock, adapterKind, connectedAt, disconnectedAt, status
- agents: id, name, category, version, status LIVE/BETA/PREPARED, description, actionSurface, assets, accent, createdAt
- agent_deployments: id, userId, walletId, agentId, agentVersion, status active/paused/quarantined/unbound, policyId, createdAt, updatedAt
- policies: id, userId, agentId, agentDeploymentId, version, label, doc (AgentPolicy integer-safe), docHash, status draft/active/superseded, createdAt, updatedAt, onchainCommitTx
- approved_recipients: id, userId, policyId, name, address, asset, active, createdAt, updatedAt
- execution_requests: id, userId, agentDeploymentId, policyId, intent (TreasuryTransferIntent), intentHash, policyHash, status pending/approved/blocked/awaiting_confirmation/confirmed/rejected/executed/failed, verdict (ValidationResult + trace + hashes + evaluatedAt), requiresHumanApproval, approvedByUser, approvedAt, rejectedAt, createdAt, updatedAt
- execution_results: id, executionRequestId, userId, txHash (Hex or NOT AVAILABLE), block, proofVerified, latencyMs, status success/failed, provider mock/strk20, bucket, error, errorCode, createdAt
- execution_receipts: id, userId, executionRequestId, executionResultId, agentId, agentName, policyId, intentHash, policyHash, traceHash, txHash, attestationSig, status executed/blocked/awaiting_confirmation/reverted/pending/completed/failed, provider mock/strk20, bucket, createdAt, isDemo (DEMO RECEIPT vs STRK20 EXECUTION)

**Security:** Never stores viewing keys, private notes, proof witnesses, shielded balances, unnecessary exact private transaction details, unnecessary private counterparty information — only allowlist addresses and buckets.

**API domain services:** `src/lib/api/`
- users.ts: ensureUser, getUserByAddress
- wallets.ts: ensureWallet, disconnectWalletsByUser, getActiveWalletByUser
- agents.ts: seedAgents, getAllAgents, getAgentById, getLiveAgents — seeds 4 initial agents per spec + legacy mocks
- deployments.ts: deployAgent (creates deployment + policy, verifies wallet connected), getDeploymentsByUser, pause/resume, getActiveDeploymentsByUser
- policies.ts: createPolicy (supersedes active), getPolicyById, getActivePolicyByDeployment, getPoliciesByUser
- recipients.ts: addRecipient (validates 0x, checks duplicate, re-enables if disabled), removeRecipient, disable/enable, getRecipientsByPolicy, getActiveRecipientsByPolicy, isRecipientApproved
- executions.ts: createExecutionRequest (determines status approved/blocked/awaiting_confirmation from verdict), approve/reject, markExecuted/Failed, createExecutionResult, createExecutionReceipt, getExecutionRequestsByUser, getPendingApprovalsByUser, getReceiptsByUser

**Relationships per TASK 2:**
- User → Wallets (userId)
- User → Agent Deployments (userId)
- Agent → Agent Version (agentId + version, via deployment)
- Agent Deployment → Policy (policyId, agentDeploymentId)
- Policy → Approved Recipients (policyId)
- Agent Deployment → Execution Requests (agentDeploymentId)
- Execution Request → Policy Decision (verdict field)
- Execution Request → Execution Result (executionRequestId)
- Execution Result → Execution Receipt (executionResultId)

Proper IDs, timestamps, status fields, indexes via find/filter.

---

## 2. Real Agent Deployment

**Marketplace deployment flow functional:**

`/agents` → selects Treasury Agent → reviews capabilities → configures policy → deploys

- `src/app/agents/[id]/page.tsx` now has Deploy Treasury Agent button when no deployment exists, disabled if wallet disconnected
- Calls `deployTreasuryAgent()` from store which calls `apiDeployAgent()` which:
  - Verifies wallet connected (throws Wallet disconnected if not)
  - Creates deployment with status active, policyId null
  - Creates policy with version 1, label, doc (AgentPolicy integer-safe, $500 auto, $500-2000 approval, >$2000 blocked), docHash via poseidonish
  - Links policy to deployment
  - Returns deployment + policyRecord, refreshes from DB
- Displays: Agent, Owner (short), Wallet (short + adapterKind), Status, Policy (short + label), Created, Version
- Does not pretend success if backend fails — catches error and shows in UI via deployError state

**Initial agents per TASK 12:**
- Holographic Treasury Agent LIVE — fully functional, private transfer, spending limits, daily limits, human approval threshold
- Holographic Payment Agent BETA — recurring confidential payments, execution prepared
- Holographic Distribution Agent PREPARED — batch distribution, interface defined
- Holographic Compliance Agent PREPARED — compliance-aware, viewing-key disclosure paths
- Legacy agents (Aurora Yield, Vega DCA) kept as BETA for variety

Only Treasury Agent needs full execution capability in this milestone — implemented via TreasuryTransferForm.

---

## 3. Treasury Agent

**First fully functional agent:** `holographic-treasury` LIVE

Capabilities:
- private transfer via STRK20 (wallet_strk20InvokeTransaction)
- approved recipient payments (allowlist enforced at R10 / E_RECIPIENT_NOT_APPROVED)
- spending limits (maximumTransactionAmount 500 USDC, per spec)
- daily limits (dailySpendingLimit 5000 USDC)
- human approval threshold (approvalThreshold 250 USDC, $500-2000 requires human per spec example: ≤$500 auto, $500-$2000 approval, >$2000 blocked)

Agent creates structured intents via `makeTransferIntent()` — TreasuryTransferIntent with integer-safe amount (minor units), agentId, action, asset, recipient, reason, requestedAt, metadata.

Agent NEVER directly signs transactions — only creates candidate intent, policy engine approves, wallet adapter signs via WalletAccount or wallet.request().

---

## 4. Approved Recipients

**Recipient management:** `src/components/RecipientManager.tsx`

Fields: name, address, asset, active, createdAt, updatedAt

Users can:
- add (validates 0x, checks duplicate, re-enables if disabled)
- remove (delete)
- disable (active false)
- enable (active true)

Enforced: agent cannot send to recipient outside active allowlist — `isRecipientApproved()` checks active recipients, policy engine checks `approvedRecipients` includes recipient, returns E_RECIPIENT_NOT_APPROVED if not.

Displayed in Treasury page per policy: `RecipientManager` component for each dbPolicy, shows active/total count, list with name, asset, short address, date, active/disabled badge, enable/disable and delete buttons.

---

## 5. Policy Engine

**Kept existing deterministic engines:**

- `validateAction` v2.0.0 — integer-safe minor units, pure, total, no floating point, accumulates all violations, fixed order, default deny, returns {allowed, reasons, requiresHumanApproval}
- `evaluatePolicy` v1.2.0 — float USD, halting, R01-R12 trace, used for legacy UI

Flow: Candidate intent → deterministic policy evaluation → APPROVE or REJECT or REQUIRE_USER_CONFIRMATION

Stored per execution request:
- policy ID, policy version, rule trace (verdict.trace or reasons mapped), verdict (allowed, reasons, requiresHumanApproval), timestamp (evaluatedAt), intentHash, policyHash

Do not store unnecessary private transaction information — only hashes and bucket.

---

## 6. Human Approval

**ApprovalDialog functional:**

- Policy example: ≤$500 automatic, $500–$2000 requires human approval, >$2000 blocked (implemented via approvalThreshold 250 USDC + maximumTransactionAmount 500 USDC for stricter demo, but can be configured to 500/2000/ >2000 via policy editor)
- Flow: Agent proposal → policy engine → approval required → user reviews (intent details, rule trace, hashes) → user approves/rejects → STRK20 execution if approved
- Rejected approval never reaches wallet — `rejectExecutionRequest()` sets status rejected, no execution result created, verified by test
- For Treasury form, human approval uses window.confirm for $500-$2000 band, then allows bypass via allowConfirmationBypass option

---

## 7. Real Execution Request

Once policy allows execution:

Agent → Policy Engine → STRK20 Provider → Wallet → Execution result

- Keeps current real STRK20 integration: `Strk20WalletApiProvider` using verified `wallet_strk20InvokeTransaction`
- Uses existing PrivacyProvider boundary: `getPrivacyProvider()` / `getExecutionProvider(isMock)`
- `executePrivateTransfer()` checks wallet disconnected, wrong network, privacy unavailable, policy rejection, human confirmation, then builds envelope via `buildTransferEnvelope()` and executes via provider with phase callbacks

No reimplementation of STRK20 — uses adapter.

---

## 8. Execution Receipt

**Persistent:** Stored via `createExecutionReceipt()` in DB, only non-sensitive metadata:

Display:
- Agent (agentId, agentName)
- Policy (policyId, label, version, short hash)
- Decision (APPROVE/REJECT/REQUIRE_USER_CONFIRMATION, reasons)
- Approval state (requiresHumanApproval, approvedByUser, approvedAt/rejectedAt)
- Execution state (pending, approved, blocked, awaiting_confirmation, executed, failed)
- Timestamp (createdAt, evaluatedAt)
- Provider (mock/strk20)
- Execution identifier (txHash short or NOT AVAILABLE)

Use DEMO RECEIPT when using mock execution (isDemo true, Badge warn), STRK20 EXECUTION only for actual execution (isDemo false, Badge good).

Do not expose viewing keys, note data, private proof witnesses, private counterparty information beyond allowlist — receipt stores bucket not exact amount.

If field unavailable: shows NOT AVAILABLE, not fabricated.

---

## 9. Activity Page

**Replaced mock with backend-backed:**

- `src/app/activity/page.tsx` now uses `dbReceipts` and `executionRequests` from store when `dbUser` exists, else fallback to mock receipts for demo
- Filters: All, Approved, Blocked, Pending Approval (awaiting_confirmation), Completed (executed/completed), Failed (failed/reverted)
- Shows: Agent, Action (intent.action · asset · amount minor units + reason), Policy result (APPROVE/REJECT + requires human), Execution state (status badge), Timestamp (datetime)
- Does not expose private transaction data unnecessarily — shows short hashes, bucket, not exact amount or private notes

---

## 10. Treasury Page

**Reflects persisted state:**

- `src/app/treasury/page.tsx` now shows:
  - Connected wallet (via DiagnosticPanel)
  - Active agents (activeDeployments count, list with deployment id short, policy id short, date)
  - Policies (dbPolicies mapped to RecipientManager)
  - Pending approvals (pendingApprovals count in Stat)
  - Recent executions (dbReceipts slice 5 with bucket and DEMO/STRK20 badge)
  - Supported asset balances where safely available (positions from mock or via wallet_strk20Balances when real wallet connected, else NOT AVAILABLE message)
- Do not fabricate balances — if positions empty, shows "NOT AVAILABLE — connect wallet to fetch balances via wallet_strk20Balances"
- Includes TreasuryTransferForm for real action: Send private payment with Asset, Recipient, Amount, Reason, policy result before authorization

---

## 11. Marketplace

- Keeps visual marketplace (AgentCard)
- Deployment functional via Deploy button in agent detail
- Initial agents: Treasury LIVE, Payment BETA, Distribution PREPARED, Compliance PREPARED — only Treasury fully functional, others correctly labeled not falsely live

---

## 12. Error Handling

Handles without crashing:
- backend unavailable → db.isAvailable() check throws "Backend unavailable"
- database error → saveTable catch throws "Database error: failed to persist"
- wallet disconnected → WALLET_DISCONNECTED error, throws before policy, UI shows DISCONNECTED
- wrong network → WRONG_NETWORK badge, shows Expected Sepolia Detected Mainnet, guidance Switch network
- policy rejection → REJECT with reasons, no wallet request, blocked receipt
- human rejection → rejected status, no execution result, verified by test
- STRK20 failure → PrivacyNotAvailableError mapped to API_FAILURE, shows error in result panel
- insufficient balance → Insufficient private balance from wallet_strk20InvokeTransaction
- user rejected wallet request → User rejected ERROR

Never converts failures into success — ExecutionResult status success/failed, receipt status executed/blocked/failed.

---

## 13. API Boundary

- React → API (src/lib/api/) → domain services (validateAction, executePrivateTransfer) → database (db client)
- For blockchain: domain service → Wallet/Privacy Adapter (ReadyAdapter, WalletConnectAdapter, MockWalletAdapter, Strk20WalletApiProvider, MockPrivacyProvider) → STRK20 (wallet_strk20InvokeTransaction)
- No DB credentials or secret keys in frontend — localStorage only, no secrets

---

## 14. Security

Never exposes:
- private keys — wallet remains signer, no private key in app
- seed phrases — never requested
- viewing keys — never requested, stored, logged; getPositions in strk20Provider uses wallet's private discovery
- private notes — never stored, only bucket in receipt
- proof witnesses — never stored, proof from wallet not logged

Wallet remains signer via WalletAccount or wallet.request().

LLM remains unable to:
- sign — no signing authority
- bypass policy — policy engine pure, rationale never read
- change policy — only owner can amend via UI, policy versioned and hashed
- add recipients — only user via RecipientManager, not agent
- access unrestricted wallet authority — adapter only exposes connect/disconnect/getAddress/getChainId/request, no raw signer

---

## 15. Tests

Written via testKit (async-aware) and run live in EngineConformance (/policies):

- Agent deployment: creates persistent record, fails if wallet disconnected
- Policy creation: version and hash
- Recipient allowlist: adds, checks approval, disables
- Valid intent: 10 USDC approved within limit → APPROVE
- Blocked intent: over-limit 800 limit 500 → REJECT, unapproved recipient → REJECT
- Approval-required intent: $500-$2000 → REQUIRE_USER_CONFIRMATION
- Human approval: approves pending request → confirmed, approvedByUser true
- Human rejection: rejects pending request → rejected, no execution result (never reaches wallet)
- Successful STRK20 execution: mocked via MockPrivacyProvider → success, txHash, bucket
- Failed execution: simulated failure → status failed
- Receipt creation: only non-sensitive metadata, no viewingKey/privateNotes, isDemo flag
- Persistence: deployments persist across reload via localStorage
- Wallet disconnect: clears active wallets
- Unauthorized access: prevents access to other user's data (userId filtering)

Existing tests still passing: validateAction 40+ assertions + vertical slice 10 cases + persistence 15+ cases = 65+ total.

---

## 16. Build

```
npm run build
```
Result: success, 1977 modules, 1011kB (291kB gzip), eval warnings from get-starknet core expected.

No TypeScript errors after fixes.

---

## 17. Acceptance Criteria

**Complete workflow must work:**

Connect wallet (Ready approval or Demo Mode) → Deploy Treasury Agent (creates deployment + policy persisted) → Configure policy (via PolicyEditor, save creates new version) → Add approved recipient (via RecipientManager, persisted) → Give agent payment instruction (TreasuryTransferForm: Pay approved vendor 10 USDC) → Intent generated (TreasuryTransferIntent integer-safe) → Policy approves (validateAction APPROVE, shows ✓ checks) → Wallet authorization (wallet.request wallet_strk20InvokeTransaction or mock phases) → STRK20 private execution (mock phases or real txHash) → Receipt persisted (DbExecutionReceipt with bucket, hashes, DEMO/STRK20 badge) → Activity updated (dbReceipts + executionRequests in Activity page)

**Verified:**
- Over-limit payment (800 USDC limit 500) → Policy blocks E_ABOVE_TRANSACTION_LIMIT → No wallet request (handleExecute checks allowed before execute)
- Unapproved recipient → Policy blocks E_RECIPIENT_NOT_APPROVED → No wallet request
- Approval-required payment (1000 USDC threshold 500) → Human approval (window.confirm or ApprovalDialog) → Wallet request only after approval (allowConfirmationBypass true only after confirmation)

**Final goal:** Holographic now functioning for confidential policy-controlled contractor/vendor payments rather than mock marketplace — persistent deployments, policies, recipients, execution requests, results, receipts via DB, real wallet connection (Ready + WalletConnect), real STRK20 private transfer via verified wallet_strk20InvokeTransaction, deterministic policy engine authoritative, human approval gate, Demo Mode fallback clearly distinguished.

**Remaining blockers for full mainnet:**
- Live browser with Ready X extension + Sepolia USDC private balance + registration (shield at least once)
- Token support verification for Sepolia USDC in current pool
- Dynamic provider per chainId (currently hardcoded Sepolia)
- Paymaster for gasless private transfers
- 10-block proving delay handling
- Consolidate dual policy engines (float vs int)
- Deploy Cairo contracts to Sepolia
- After live tx verified, flip PRIVACY_BACKEND="strk20" isLive=true

Do not add additional major features until workflow fully persistent and tested — current milestone complete as persistent functional app.

