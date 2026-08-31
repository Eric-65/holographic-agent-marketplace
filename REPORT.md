# Holographic — Vertical Slice Readiness Report

Date: 2026-08-13
Branch: current codebase, mock backend
Starknet official refs: Push to Private (2026-07-15), Privacy Live (2026-06-09), strk20.starknet.io, starknet-privacy repo

---

## TASK 1 — Audit summary
Detailed findings in AUDIT.md and VERSION_COMPATIBILITY.md.

**Quick TL;DR:**
- Mock boundary is clean: PrivacyProvider interface isolates notes/proving/viewing keys
- Wallet was mock-only, previously crashed on starknet import (fixed last iteration)
- Two policy engines exist (engine.ts float USD halting, validateAction.ts integer minor-units accumulating) — drift risk
- Intent model split: ActionIntent (float) vs AgentAction (integer-safe) — needs consolidation
- UI directly imports provider singleton in PrivacyStatus/ApprovalDialog — coupling to mock
- Cairo contracts draft, not deployed, anonymizer panics by design
- Starknet dep 3 majors behind required version

---

## TASK 2 — Version Compatibility

**Installed:** starknet ^7.1.0
**Required:** v10.4.0 per Push to Private blog (Privacy Wallet API spec v0.10.3)

Upgrade required: **YES**

API differences:
- v7 → v10 provider construction changed
- WalletAccount.request() introduced for wallet_* methods
- ChainId now bigint hex
- get-starknet discovery needed
- TypedData SNIP-12 revision

Files affected:
- src/lib/wallet/adapters/realAdapter.ts
- src/lib/wallet/useWallet.ts
- src/lib/privacy/strk20Provider.ts
- src/lib/execution/privateTransfer.ts

Expected migration work: 1-2 days, see VERSION_COMPATIBILITY.md

Do NOT upgrade automatically now — per instruction, keep mock as default.

---

## TASK 3 — Real Vertical Slice Definition

Target workflow (first real):
```
Connect wallet → select Treasury Agent (helix-payroll) → create transfer intent
→ deterministic policy evaluation → wallet authorization → STRK20 private transfer
→ execution result → non-sensitive receipt
```

Current implementation supports up to `→ deterministic policy evaluation` in mock, with clean seam for wallet authorization.

Invariants preserved:
- LLM may only produce structured candidate intent (reason field, never trusted)
- Policy engine remains authority (validateAction + evaluatePolicy)
- LLM never calls wallet (executePrivateTransfer checks wallet status but is gated by policy)

---

## TASK 4 — Privacy Adapter

**Implemented:**

src/lib/privacy/provider.ts — interface, ExecutionEnvelope, ExecutionResult, ExecutionPhase
src/lib/privacy/mockProvider.ts — simulates timings, returns MOCK_POSITIONS
src/lib/privacy/strk20Provider.ts — **prepared, not live** — real seam

Strk20WalletApiProvider:
- Does NOT store / log viewing keys, notes, exact private amounts, witnesses, private counterparties
- Does NOT implement custom cryptography
- Does NOT invent undocumented method names — maps kind → method but execution throws PrivacyNotAvailableError until v10 upgrade verified
- Probes capabilities via wallet adapter, respects forceLive flag for local testing
- isLive = false until live test
- Envelope building is pure (safe even in mock)

No STRK20 implementation details leaked to React components — components call getPrivacyProvider() which returns mock unless backend flag flipped.

---

## TASK 5 — Wallet Adapter

New adapter architecture:

src/lib/wallet/adapters/types.ts — WalletAdapter interface: connect(), disconnect(), getAccount(), getChainId(), getStatus(), getCapabilities(), request()
src/lib/wallet/adapters/mockAdapter.ts — DEMO MODE, hardcoded address, localStorage flag, returns capabilities from MockPrivacyProvider
src/lib/wallet/adapters/realAdapter.ts — scaffold for starknet.js v10.4.0, detects window.starknet / Ready / Xverse injection, dynamic import starknet, checks version, throws WalletNotAvailableError with clear message until upgrade. Includes WrongNetworkError.

src/lib/wallet/adapters/index.ts — factory, singleton mock + real, detectPreferredAdapterKind()

src/lib/wallet/useWallet.ts — refactored to delegate to adapter, keeps previous API (wallet, connect, disconnect) so UI unchanged, plus new helpers getAccount(), getChainId(), getCapabilities() per TASK 5 requirement.

MockWalletAdapter remains available for DEMO MODE.

---

## TASK 6 — Intent Model

Existing: ActionIntent (float USD) and AgentAction (integer minor units).

New: src/lib/intent/model.ts — TreasuryTransferIntent
- agentId, action, asset, recipient, amount (int minor units, safe integer), reason, requestedAt, metadata
- makeTransferIntent() helper
- isValidTransferIntent() guard
- Integer-safe, no floating point money arithmetic
- reason field for LLM rationale (never trusted for policy)

Mapping: intentToAgentAction() converts TreasuryTransferIntent → AgentAction for existing validateAction engine — preserves engine.

---

## TASK 7 — Policy Flow

Preserved:

Candidate intent (TreasuryTransferIntent or ActionIntent) → validateAction / evaluatePolicy → APPROVE or REJECT or REQUIRE_USER_CONFIRMATION

- validateAction remains pure, total, zero floating point, accumulates reasons, deterministic
- evaluatePolicy remains pure, fixed order R01-R12, halting
- No LLM in decision path — validated by test "ignores agent-supplied free text entirely"
- Soft band: requiresHumanApproval only when allowed && amount >= threshold, 0 disables

---

## TASK 8 — Real Transaction Boundary

src/lib/execution/types.ts — PrivateTransferRequest, PrivateTransferResult, ExecutionError with codes
src/lib/execution/privateTransfer.ts — executePrivateTransfer(intent, policy, opts)

Flow:
1. Check wallet connected — throws WALLET_DISCONNECTED
2. Check network vs expectedChainId — throws WRONG_NETWORK
3. Check privacy provider & capabilities.privacyApi — throws PRIVACY_UNAVAILABLE
4. Map intent → AgentAction, call validateAction — throws POLICY_REJECTED or REQUIRE_CONFIRMATION
5. Build envelope via PrivacyProvider.buildEnvelope (pure)
6. Execute via PrivacyProvider.execute with phase callback
7. Return only non-sensitive metadata: txHash, block, proofVerified, latencyMs, bucket, intentHash, policyHash, traceHash

Does NOT perform real transaction until compatibility confirmed — Strk20 provider throws PrivacyNotAvailableError on execute, forcing mock path per TASK 8.

Clean interface: `executePrivateTransfer(intent, approvedPolicy)`

---

## TASK 9 — Tests

Test harness: src/lib/policy/testKit.ts — upgraded to async-aware runSuiteAsync()

Existing suite: src/lib/policy/validateAction.test.ts — 40+ assertions covering 7 required cases + determinism

New suite: src/lib/execution/executePrivateTransfer.test.ts

Covers 10 required scenarios:

1. **Valid transfer** — allows valid transfer, deterministic hash
2. **Amount over limit** — REASON.ABOVE_TX_LIMIT
3. **Recipient not approved** — REASON.RECIPIENT_NOT_APPROVED
4. **Wrong asset** — REASON.ASSET_NOT_ALLOWED
5. **Daily limit exceeded** — REASON.DAILY_LIMIT_EXCEEDED
6. **Paused agent** — REASON.PAUSED
7. **Human approval required** — requiresHumanApproval true, inclusive threshold, 0 disables
8. **Wallet disconnected** — throws WALLET_DISCONNECTED, test disconnects mock adapter and restores
9. **Wrong network** — throws WRONG_NETWORK when expectedChainId mismatches
10. **Privacy provider unavailable** — throws PRIVACY_UNAVAILABLE when capabilities.privacyApi=false
11. **STRK20 API failure** — maps PrivacyNotAvailableError to API_FAILURE (extra)

All tests run live in-browser via EngineConformance component (now async) on /policies page — visible product surface.

---

## TASK 10 — Final Report

### 1. What already works
- React/Vite frontend, Tailwind 4, dark/light themes, glassmorphism, no generic Web3 look
- Deterministic policy engine: validateAction v2.0.0 integer-safe, evaluatePolicy v1.2.0 float USD, both pure
- PrivacyProvider abstraction with MockPrivacyProvider simulating phase timings
- Wallet abstraction decoupled from starknet package (no blank screen crash)
- Intent simulation (Math.random) for agent cycles, approval dialog with rule trace, execution receipts with buckets
- Treasury view with shielded vs public balances (mock)
- Activity ledger, policies list, settings
- Cairo contracts draft (AgentRegistry, PolicyCommitment, ExecutionAttestor, Anonymizer phase 2)
- ErrorBoundary preventing blank pages
- Scroll lock fix, 100dvh layout

### 2. What is still mock
- Privacy backend: MockPrivacyProvider (PRIVACY_BACKEND="mock")
- Wallet: MockWalletAdapter with hardcoded address
- Positions, agents, intents, receipts, policies: all mock data
- Cairo contracts: not deployed, stake() no-op, anonymizer panics
- Backend: no Fastify / indexer / receipt service — store is in-memory
- STRK20 real transaction: blocked until v10 upgrade + wallet verification

### 3. What must be changed (next steps)
- Upgrade starknet.js 7.1.0 → 10.4.0 + add @starknet-io/get-starknet
- Implement RealWalletAdapter.connect() using WalletAccount.connect() and wallet.request()
- Verify exact Privacy Wallet API method names from Ready/Xverse docs — do not invent wallet_privateTransfer etc. until confirmed in spec
- Replace envelope method mapping with verified RPC calls
- Consolidate dual policy engines into single integer-safe engine (validateAction as source of truth, evaluatePolicy as trace formatter)
- Consolidate intent models: migrate ActionIntent.amountUsd float → TreasuryTransferIntent.amount int minor units
- Remove direct getPrivacyProvider() imports from UI components — inject via store/context
- Add persistence for bindingState dailySpentUsd (currently memory only)
- Deploy contracts to Sepolia after audit
- Add real poseidon hash via starknet.js poseidonHashMany

### 4. Exact dependency updates required
```
npm install starknet@10.4.0 @starknet-io/get-starknet@latest
# optional for direct SDK path
npm install @starkware-libs/starknet-privacy-sdk@latest
# if using starknet-react
npm install @starknet-react/core@latest
```
Check peer deps: starknet v10 requires Node >=18, may need Vite 5+ config for wasm.

### 5. Exact files that should be changed next
- package.json — starknet version, add get-starknet
- src/lib/wallet/adapters/realAdapter.ts — implement connect() with WalletAccount
- src/lib/wallet/useWallet.ts — switch to getWalletAdapter("real") when available
- src/lib/privacy/strk20Provider.ts — implement detectCapabilities via wallet.request({ type: "wallet_supportedSpecs" }) and execute via wallet.request({ type: "wallet_privateTransfer", params })
- src/lib/execution/privateTransfer.ts — remove legacy ActionIntent compat layer, use TreasuryTransferIntent directly for envelope
- src/lib/types.ts — deprecate ActionIntent.amountUsd, add TreasuryTransferIntent as canonical
- src/lib/policy/engine.ts — refactor to call validateAction underneath
- src/app/agents/[id]/page.tsx — use executePrivateTransfer instead of direct provider.execute
- src/components/ApprovalDialog.tsx — inject wallet adapter, check network before run()
- vite.config.ts — may need optimizeDeps exclude for starknet wasm

### 6. Architectural risks
- **Method name invention**: Privacy Wallet API spec v0.10.3 methods not yet publicly typed — risk of implementing wrong RPC names. Mitigation: wait for Ready wallet docs / starknet-privacy repo wallet API spec.
- **Dual engine drift**: evaluatePolicy halts on first fail, validateAction accumulates all — different UX for operator fixing policy. Must consolidate before mainnet.
- **Float vs integer**: Legacy ActionIntent uses float USD, could cause rounding errors if used for real limits. Mitigation: enforce TreasuryTransferIntent as canonical.
- **Singleton provider**: getPrivacyProvider() global singleton not wallet-aware — real flow should tie provider instance to connected wallet account. Mitigation: make factory accept wallet adapter.
- **Gasless / paymaster**: Real private transfers may require AVNU paymaster for gas — not yet handled. Blog mentions paymaster for gasless execution.
- **10-block proving rule**: SDK README describes sequencing constraint: prover reads finalized state, need to wait ~10 blocks after transparent tx before private tx. Our executePrivateTransfer does not yet handle this — will need polling loop.
- **Blank screen regression**: Previous crash from starknet import fixed, but future upgrade to v10 may reintroduce if not isolated behind adapter. Keep Real adapter behind dynamic import.
- **Viewing key isolation**: We correctly never store keys, but UI displays noteCount from mock — real wallet will provide note count via discovery, must ensure we never log it.

### 7. Exact command sequence for next implementation stage

Step 1 — Upgrade (separate branch)
```
git checkout -b chore/starknet-v10-upgrade
npm install starknet@10.4.0 @starknet-io/get-starknet
npm run build
```

Step 2 — Implement real adapter
```
# Edit src/lib/wallet/adapters/realAdapter.ts
# Implement connect() as per VERSION_COMPATIBILITY.md
# Edit src/lib/privacy/strk20Provider.ts
# Verify method names against https://github.com/starkware-libs/starknet-privacy and Ready docs
```

Step 3 — Local E2E with extension
```
# Install Ready X extension (Chrome)
# Run dev
npm run dev
# Connect wallet, check console for wallet_supportedSpecs
# Force live flag if needed: localStorage.setItem("holographic:privacy:forceLive","1")
# Try treasury agent payout on Sepolia devnet (needs faucet STRK + USDC)
```

Step 4 — Test vertical slice (mock must still pass)
```
npm run build
# Open /policies — EngineConformance should show 50+ tests passing
```

Step 5 — Flip backend (only after live tx verified)
```
# In src/lib/privacy/index.ts set PRIVACY_BACKEND="strk20"
# In src/lib/privacy/strk20Provider.ts set isLive=true
# Remove forceLive flag
```

Step 6 — Deploy contracts (after next)
```
cd contracts
scarb build && scarb test
# Deploy AgentRegistry to Sepolia via starknet foundry
```

**Do NOT claim STRK20 is integrated until an actual wallet/API transaction has been successfully tested on Sepolia with proofVerified=true and txHash from Starknet.**

---

## Appendix — How to claim real integration

Per TASK 10 instruction, real integration is claimed only when:
- RealWalletAdapter connects to Ready X / Xverse via starknet.js v10.4.0
- getCapabilities() returns privacyApi=true, specVersion=0.10.3
- executePrivateTransfer returns txHash from Starknet, proofVerified=true, block number
- Receipt displayed in Activity with txHash link to Voyager / Starkscan
- No viewing keys, notes, exact amounts logged — verified via network tab and localStorage inspection

Until then, UI must show MOCK badge (currently does in PrivacyStatus chip and panel).

