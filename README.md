# Holographic

A policy-controlled marketplace for private financial agents on Starknet.

> **Agents propose. A deterministic policy engine decides. The user's wallet executes.**
> Holographic does not implement privacy infrastructure — it composes with STRK20.

**Principle:** `Agents propose. A deterministic policy engine decides. The user's wallet executes.`

---

## Current status (after Prompt 14)

| Layer | Status | Notes |
|-------|--------|-------|
| Frontend | Functional | React 19 + Vite 7 + Tailwind 4, dark/light, holographic glassmorphism, persistent backend |
| Wallet | Real | Ready desktop injected + Mobile WalletConnect via @starknet-io/get-starknet 4.0.8 + starknet.js 10.4.0, Demo Mode fallback, disconnect works for all |
| Policy engine | Implemented | Two engines: validateAction v2.0.0 integer-safe accumulating, evaluatePolicy v1.2.0 float halting, both pure deterministic, default deny, rule traces |
| Privacy layer | Real + Mock | MockPrivacyProvider DEMO MODE + Strk20WalletApiProvider real via verified wallet_strk20InvokeTransaction / wallet_strk20Balances / wallet_strk20PrepareInvoke |
| Backend / Persistence | Real (localStorage) | Users, wallets, agents, agent_versions, agent_deployments, policies, policy_versions, approved_recipients, execution_requests, policy_decisions, execution_results, execution_receipts — no viewing keys, notes, witnesses, shielded balances |
| Treasury Agent | LIVE | Fully functional private transfer with spending limits, daily limits, human approval threshold, recipient allowlist |
| Cairo contracts | TESTNET (scaffolded, not yet deployed in this env) | AgentRegistry, PolicyCommitment, ExecutionAttestor — audited, tests, ready for Sepolia. Anonymizer PHASE_2 not deployed |

---

## Route table

```
/                  Overview      — treasury summary, deployments, receipts, diagnostics
/agents            Marketplace   — registry browse, LIVE/BETA/PREPARED badges, deploy functional
/agents/[id]       Agent detail  — spec, metrics, policy editor, deployment status, pause/resume, workflow visualization, run cycle
/treasury          Treasury      — balances (NOT AVAILABLE when wallet disconnected, DEMO DATA when mock), active deployments, pending approvals, recent executions, Send private payment form, recipient management
/activity          Activity      — backend-backed ledger with filters ALL/APPROVED/BLOCKED/PENDING APPROVAL/COMPLETED/FAILED, execution requests + receipts, DEMO vs STRK20 badges
/policies          Policies      — document versions, rule catalog, engine conformance live tests, onchain commitment status
/settings          Settings      — account, privacy boundary, engine parity, safety controls, contract addresses
```

---

## Reusable components

| Component | Responsibility |
|-----------|---------------|
| `AgentCard` | Registry tile: identity, trust, action surface, metrics, LIVE/BETA/PREPARED |
| `AgentStatus` | Runtime state badge — chip / inline / block variants, plus deployment status |
| `PolicyEditor` | Canonical policy document editor with live doc hash, integer-safe |
| `TreasuryCard` | Per-asset public/shielded split, note count, allocation |
| `ActivitySummary` | Aggregate receipt stats + volume chart (counts only) |
| `ExecutionReceipt` | Non-sensitive receipt, row or card, expandable hashes, DEMO vs STRK20 |
| `WalletConnect` | Connect with chooser Desktop Wallet / Mobile WalletConnect / Demo Mode, connected dropdown with Wallet name, address, Network, Chain ID, Adapter, Status, Copy, Disconnect wallet (real + demo), dev diagnostic panel |
| `PrivacyStatus` | Privacy boundary states DISCONNECTED/CONNECTING/CONNECTED/NETWORK_VERIFIED/PRIVACY_CAPABLE/ERROR/DEMO_MODE/WRONG_NETWORK |
| `ApprovalDialog` | Human approval gate, rule trace, policy decision, wallet authorization only after approval |
| `RecipientManager` | Approved recipients ADD/EDIT/DISABLE/REMOVE, allowlist enforcement |
| `DiagnosticPanel` | Debug — Wallet/Network/Chain ID/Block/Connection/Adapter/RPC provider available/unavailable |
| `AgentWorkflow` | Visual workflow: Agent proposal ↓ Policy engine ↓ Approval if required ↓ Wallet ↓ STRK20 ↓ Receipt |
| `TreasuryTransferForm` | Send private payment with Asset/Recipient/Amount/Reason, policy check before wallet auth, execution result with DEMO vs STRK20 |

---

## Architecture

```
React frontend
  → API/service layer (src/lib/api/)
  → database (src/lib/db/client.ts localStorage, production: Postgres via Fastify)
  → domain services (validateAction, executePrivateTransfer)

Blockchain execution separate:
domain service → Wallet Adapter (Ready / WalletConnect / Mock) → STRK20 Privacy Provider (wallet_strk20InvokeTransaction) → Starknet Sepolia

Holographic contracts (onchain anchor, not privacy):
- AgentRegistry — agent identity/registry
- PolicyCommitment — policy version anchoring
- ExecutionAttestor — non-sensitive execution attestation
STRK20 — privacy infrastructure (pool, viewing keys, notes, proofs)
```

### Privacy-safe data handling
Never stores: viewing keys, private keys, seed phrases, private notes, proof witnesses, unnecessary shielded balances, unnecessary private counterparty info. Stores only minimum for policy management, agent management, execution state, audit metadata, non-sensitive receipts.

---

## Cairo Contracts

### Purpose
Holographic contracts provide identity, commitments, and attestations. STRK20 remains privacy layer. Do NOT make Holographic contracts responsible for privacy pools, viewing keys, private notes, proof generation, shielded balance storage, private transfer cryptography.

### Contracts

| Contract | File | Purpose | Status | Network | Address | Version |
|----------|------|---------|--------|---------|---------|---------|
| AgentRegistry | contracts/src/agent_registry.cairo | Register agent, update metadata where authorized, deactivate, pause/resume, query, verify owner, track version. Data: agent_id, owner, version, metadata_hash, status DRAFT/ACTIVE/PAUSED/DISABLED, created_at, updated_at. Events: AgentRegistered, AgentUpdated, AgentDeactivated, AgentPaused, AgentResumed | TESTNET | Sepolia | NOT YET DEPLOYED (0x0 placeholder) | 1.0.0 |
| PolicyCommitment | contracts/src/policy_commitment.cairo | Anchor policy commitment/version onchain. Policy doc → canonical → hash → onchain. Create, update version, query current, verify ownership. Only stores policy_hash, version, block, timestamp, revoked. Events: PolicyCommitted, PolicyUpdated, PolicyRevoked | TESTNET | Sepolia | NOT YET DEPLOYED | 1.0.0 |
| ExecutionAttestor | contracts/src/execution_attestor.cairo | Anchor non-sensitive execution event. Policy decision + execution metadata → hash → attestation. Only non-sensitive fields: agent_id, policy_hash, policy_version, intent_hash, trace_hash, verdict, execution_status. Events: ExecutionAttested, AuthorizedAttestorAdded/Removed. Only authorized attestor or user self can attest. Idempotency via intent_hash. | TESTNET | Sepolia | NOT YET DEPLOYED | 1.0.0 |
| HolographicAnonymizer | contracts/src/holographic_anonymizer.cairo | Anonymizer contract for atomic DeFi legs (unshield → swap → reshield). Phase 2, NOT DEPLOYED, STRK20 is privacy layer, keep isolated. | PHASE_2 | — | null | 0.1.0 |

### Security review
Checked: access control (owner checks, publisher checks), ownership (owner != zero, caller != zero), authorization (only owner/publisher/authorized attestor), replay protection (version must increase), duplicate IDs (agent exists check, intent already attested), duplicate policy versions (version must increase), duplicate execution IDs (intent_hash ==0 check), integer overflow/underflow (u64 version, u8 verdict/status with bounds checks), timestamp assumptions (get_block_timestamp), event correctness (keys + non-sensitive fields), unauthorized updates (not owner panic), contract initialization (owner zero check), upgradeability (none, simple immutable for MVP), zero/invalid values (agent_id zero, metadata_hash zero, version zero, policy_hash zero, intent_hash zero, trace_hash zero), malicious calldata (verdict <3, execution_status <8).

### Tests
- `contracts/tests/test_agent_registry.cairo`: register, query, authorized update, unauthorized update, duplicate registration, deactivation, invalid owner zero id, pause/resume
- `test_policy_commitment.cairo`: create, query, update version, duplicate version, duplicate create, unauthorized revoke, invalid zero hash
- `test_execution_attestor.cairo`: create attestation, query, verify, duplicate execution ID, unauthorized attestation, authorized attestor can attest for user, invalid verdict, zero hash

Run:
```
cd contracts
scarb build
snforge test
```
Both must succeed before deployment.

### Testnet deployment (Sepolia, NOT mainnet)
- Network: sepolia, Chain ID: 0x534e5f5345504f4c4941, RPC: https://starknet-sepolia.public.blastapi.io/rpc/v0_8
- Reproducible via `contracts/scripts/deploy-sepolia.sh` using sncast
- Requires env vars: STARKNET_RPC_URL, STARKNET_ACCOUNT, STARKNET_PRIVATE_KEY (or keystore)
- Steps: scarb build → snforge test → declare AgentRegistry, PolicyCommitment, ExecutionAttestor → deploy with owner = deployer wallet address → record network, chainId, address, deployment tx/hash, version, timestamp in `contracts/deployments/sepolia.json`
- Do NOT deploy HolographicAnonymizer (PHASE_2)

### Contract address configuration
Single source: `contracts/deployments/sepolia.json`
Frontend/backend read via `src/lib/contracts/config.ts`:
- `CONTRACTS.AGENT_REGISTRY`, `POLICY_COMMITMENT`, `EXECUTION_ATTESTOR`, `ANONYMIZER`
- `isContractDeployed()`, `getExplorerLink()`, `getOnchainStatus()` → ONCHAIN REGISTERED / POLICY ANCHORED / EXECUTION ATTESTED / NOT ANCHORED / PHASE_2
- Do not duplicate addresses

### Frontend integration
- Read: `isAgentRegistered()`, `getAgentRegistration()`, `isPolicyAnchored()`, `getCurrentPolicyCommitment()` via `contractClient.ts` using RpcProvider
- Write: `registerAgent()`, `commitPolicy()`, `attestExecution()` — all require real connected wallet (Ready adapter isConnected), wallet remains signer via WalletAccountV6.connect(provider, walletObj)
- Status indicators in UI: ONCHAIN REGISTERED, POLICY ANCHORED, EXECUTION ATTESTED, NOT ANCHORED, never based solely on mock, plus Voyager links when deployed

### Backend integration
- Create agent → persist in DB → optionally anchor registry info onchain via `contractClient.registerAgent()` with metadata_hash = poseidon hash of manifest
- Create/update policy → persist policy → calculate canonical commitment via `canonicalPolicyHash()` (poseidonHashMany with sorted keys, deterministic) → anchor via `commitPolicy()`
- Complete execution → persist receipt → create non-sensitive attestation via `attestExecution()` with agent, policy version, intent commitment, verdict, execution status, timestamp/nonce — only non-sensitive
- DB remains main application state, chain becomes authoritative public anchor for commitments/attestations

### Policy hash consistency
- Canonical serialization: sorted keys, no floating point, integer minor units, explicit order agentId, owner (lowercase), allowedAssets sorted, maxTx, dailyLimit, approvedRecipients lowercased sorted, threshold, allowedActions sorted, paused
- Hash via `hash.computePoseidonHashOnElements()` from starknet.js v10.4.0 (fallback to poseidonish for backward compat)
- Tests: same policy → same hash, changed policy → different hash, different version (different asset) → different commitment — via `testPolicyHashConsistency()` in `src/lib/hash/canonical.ts`

### Execution hash consistency
- Canonical execution commitment: agent, policy version, intent commitment, verdict, execution status, timestamp/nonce — only non-sensitive deterministic metadata
- Hash via `computePoseidonHashOnElements`, frontend/backend identical via same function

### Events (only publicly observable, no sensitive privacy data)
- AgentRegistered (agent_id, owner, metadata_hash, version)
- AgentUpdated (agent_id, metadata_hash, version)
- AgentDeactivated (agent_id)
- AgentPaused, AgentResumed
- PolicyCommitted (user, agent_id, policy_hash, version, effective_from_block)
- PolicyUpdated (user, agent_id, policy_hash, version, effective_from_block)
- PolicyRevoked (user, agent_id, version)
- ExecutionAttested (user, agent_id, intent_hash, policy_hash, policy_version, trace_hash, verdict, execution_status, attestor)

### Failure handling
- If STRK20 execution succeeds but attestation fails: record PRIVATE_EXECUTION=COMPLETED ATTESTATION=FAILED, allow retry of attestation without repeating private financial operation
- If policy commitment fails: do not execute operation that requires that commitment

### Idempotency
- Deterministic IDs/commitments: agent_id, policy_hash, intent_hash, trace_hash
- `db.create(execution_requests)` checks duplicate intentHash + deploymentId, returns existing
- Contract checks: agent exists, intent already attested, version must increase — prevents duplicate registrations/commitments/attestations

### Environment variables
- RPC: STARKNET_RPC_URL, VITE_STARKNET_RPC_URL (frontend, no secrets)
- Deployment: CONTRACTS_SEPOLIA_JSON path, DEPLOYER_ADDRESS
- Backend: DATABASE_URL (not in frontend)
- Never place private keys, seed phrases, wallet credentials in committed .env, never in frontend env vars

---

## Wallet Connection

- Real adapters: Ready desktop injected (Monitor) + Mobile WalletConnect (Smartphone) via @starknet-io/get-starknet 4.0.8 + starknet.js 10.4.0
- Mock adapter: Demo Mode (Flask)
- Flow: Connect Wallet → chooser Desktop Wallet / Mobile WalletConnect / Demo Mode → wallet detection (getAvailableWallets) → permission request (enable() → wallet_requestAccounts) → user approval → address → network detection (wallet_requestChainId authoritative first, provider fallback) → connected state
- States: DISCONNECTED, CONNECTING, CONNECTED, NETWORK_VERIFIED, PRIVACY_CAPABLE, WRONG_NETWORK, ERROR, DEMO_MODE
- Diagnostic panel (dev): Wallet, Network, Chain ID, Block, Connection status, Adapter (ready/mock/walletconnect), RPC provider available/unavailable, Error class/message/code, detection state (hasWindowStarknet, hasReady, availableCount, availableIds), logs (10 steps)
- Disconnect: real Disconnect wallet and Demo disconnect demo wallet both reset state to DISCONNECTED, address null, adapter mock, error null, clear localStorage
- Auto-reconnect: silent only via getLastConnectedWallet + connectSilent, never triggers visible prompt on reload per spec, no auto fallback to Demo Mode

---

## STRK20 Integration

Verified methods from starknet.js v10.4.0:
- wallet_supportedSpecs, wallet_requestChainId, wallet_requestAccounts
- wallet_strk20Balances { tokens: [] } → all shielded balances
- wallet_strk20PrepareInvoke { actions, simulate } → call + proof (empty when simulate true for fee estimation)
- wallet_strk20InvokeTransaction { actions } → { transaction_hash } — submits private transfer atomically, wallet shows approval UI, handles ZK proof generation (SNIP-36)

STRK20_ACTION: deposit, withdraw, transfer (token, amount FELT hex or OPEN, recipient), invoke (contract, calldata with placeholders ${openNoteIds[N]}, ${poolAddress})

First real flow: PRIVATE TRANSFER only, one asset USDC Sepolia 0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343

Security: never stores viewing keys, notes, witnesses, shielded balances, private counterparties beyond allowlist; wallet remains signer.

---

## Testing

- `npm run build` — must succeed
- `scarb build` — Cairo contracts compile
- `snforge test` — Cairo tests pass (agent registry, policy commitment, execution attestor)
- Frontend tests via EngineConformance live in-browser (/policies): validateAction, executePrivateTransfer vertical slice, persistence — 65+ assertions
- Manual acceptance: Connect wallet → Deploy Treasury Agent → Configure $500 max tx, $2000 daily, USDC, approved recipients → Add contractor → Pay 10 USDC → Policy APPROVE → Wallet auth → STRK20 execution → Receipt persisted → Activity updated → Over-limit 800 → REJECT no wallet → Disable contractor → REJECT → Pause agent → REJECT → Resume → works

---

## Deployment Documentation

See contracts/deployments/sepolia.json (single source), src/lib/contracts/config.ts, src/lib/contracts/client.ts, contracts/scripts/deploy-sepolia.sh

Status:
- LIVE: none yet (would be mainnet)
- TESTNET: AgentRegistry, PolicyCommitment, ExecutionAttestor — scaffolded, audited, tests, ready for Sepolia deployment via sncast, currently placeholder address 0x0, deployed false
- DRAFT: none (all three are TESTNET ready)
- PHASE_2: HolographicAnonymizer — NOT DEPLOYED, isolated, documented as future work for private DeFi swaps via anonymizer contracts

---

## Next Milestone

Compliance + verification layer:
- Viewing-key disclosure paths for audit
- Receipt verification against onchain commitments
- Policy commitment verification UI with deterministic hash display
- Execution attestation verification with explorer links
- Compliance Agent activation
- No mainnet automatically — stay Sepolia until full audit

