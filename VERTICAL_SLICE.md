# Holographic — Real Wallet / STRK20 Vertical Slice — No UI Redesign

Status: Implemented in mock mode, scaffolded for real mode, Demo Mode preserved

## Official API verification (TASK 4 requirement)

Verified sources on 2026-08-13:
- https://www.starknet.io/blog/push-to-private/ — states Privacy Wallet API spec v0.10.3, via starknet.js v10.4.0, Ready + Xverse wallets
- https://www.starknet.io/blog/privacy-live-on-starknet/ — describes shielding flows, no typed method names
- https://strk20.starknet.io/build — hub, no method list
- https://github.com/starkware-libs/starknet-privacy — SDK README describes builder API (createPrivateTransfers, discoverNotes, etc.) NOT Wallet API, so not applicable for dapp path
- Wallet API spec file https://github.com/starkware-libs/starknet-specs/wallet-api/wallet_rpc.json — not reachable publicly, but reference via PhilippeR26/Starknet-WalletAccount docs: official types are wallet_requestAccounts, wallet_supportedSpecs, wallet_supportedWalletApi, wallet_addInvokeTransaction, wallet_signTypedData, etc.
- Starknet.js docs https://starknetjs.com/docs/next/API/interfaces/types.RPC.RPCSPEC07.WALLET_API.RpcTypeToMessageMap/ — confirms wallet_supportedSpecs, wallet_requestAccounts

**Conclusion:** General wallet API methods are documented. Privacy-specific methods (wallet_privateTransfer, wallet_shield, etc.) referenced in our earlier mock are plausible but NOT verified in any official typed spec as of audit date. Per TASK 4 "Do not invent undocumented API methods", we must NOT hardcode them as real. So Strk20WalletApiProvider is scaffolded to:
- Probe wallet_supportedSpecs
- Delegate to wallet.request() only after verification
- Throw PrivacyNotAvailableError until method names confirmed via Ready wallet docs

This satisfies "Do not invent STRK20 APIs".

## Architecture preserved

### Existing architecture reused (no redesign)
- React/Vite frontend unchanged visually
- Policy engines: validateAction v2.0.0 (integer-safe) and evaluatePolicy v1.2.0 (float) — both pure, deterministic
- PrivacyProvider interface: id, label, isLive, detectCapabilities(), getPositions(), buildEnvelope(), execute()
- Wallet abstraction: useWallet hook returns WalletState, now backed by adapter
- Intent: ActionIntent (legacy) + TreasuryTransferIntent (new integer-safe)
- Receipt: ExecutionReceiptData with bucket, hashes, no exact amount

### New adapter layers (additive, not replacement)

#### Wallet Adapters
- `src/lib/wallet/adapters/types.ts` — WalletAdapter interface: connect(), disconnect(), getAccount(), getChainId(), getStatus(), getCapabilities(), request()
- `MockWalletAdapter` — DEMO MODE, hardcoded address, localStorage, returns capabilities from MockPrivacyProvider
- `RealWalletAdapter` — scaffold for starknet.js v10.4.0, detects window.starknet_ready / argentX / xverse, dynamic import starknet, checks version, throws WalletNotAvailableError with clear message until upgrade. No inventing.
- Factory `getWalletAdapter()`, `detectPreferredAdapterKind()`

#### Privacy Adapters
- `MockPrivacyProvider` — unchanged, simulates phase timings, returns MOCK_POSITIONS
- `Strk20WalletApiProvider` — rewritten to be safe scaffold:
  - detectCapabilities(): checks mock adapter state, respects localStorage forceLive flag for testing, returns privacyApi false by default until real verification
  - buildEnvelope(): pure mapping kind → method, uses poseidonish for envelopeId
  - execute(): simulates phases then throws PrivacyNotAvailableError — guarantees no real tx until verified per TASK 8

#### Intent Model
- `src/lib/intent/model.ts` — TreasuryTransferIntent with integer-safe amount (minor units), agentId, action, asset, recipient, reason, requestedAt, metadata
- makeTransferIntent(), isValidTransferIntent()
- intentToAgentAction() adapter to existing policy engine

#### Execution Boundary
- `src/lib/execution/types.ts` — PrivateTransferRequest, PrivateTransferResult (non-sensitive only), ExecutionError with codes
- `src/lib/execution/privateTransfer.ts` — executePrivateTransfer(intent, policy, opts):
  1. Wallet connected? → WALLET_DISCONNECTED
  2. Network check → WRONG_NETWORK
  3. Privacy capabilities → PRIVACY_UNAVAILABLE
  4. validateAction → POLICY_REJECTED / REQUIRE_CONFIRMATION
  5. buildEnvelope + execute via PrivacyProvider
  6. Return txHash, block, proofVerified, latency, bucket, hashes only — never viewing keys, notes, exact amounts, witnesses, counterparties

This is the clean interface required by TASK 8: `executePrivateTransfer(intent, approvedPolicy)`

### Demo Mode fallback preserved
- `PRIVACY_BACKEND` remains "mock" in src/lib/privacy/index.ts
- `getMockWalletAdapter()` is default in useWallet
- `MockPrivacyProvider.isLive=false` surfaced in UI via PrivacyStatus chip (MOCK offline)
- All existing flows continue to work without wallet extension

### Policy flow preserved
- Candidate intent → validateAction → APPROVE / REJECT / REQUIRE_USER_CONFIRMATION
- LLM never decides — rationale field never read by validator (pinned by test)
- Engine remains pure: no I/O, no randomness, no floating point (in new model), injected timestamp, fixed order, default deny

### Receipt model preserved
- ExecutionReceiptData still uses bucket not exact amount
- No private data stored
- Proof verification boolean, latency, block number from provider result

## Vertical slice walkthrough (Demo Mode)

1. Connect wallet → MockWalletAdapter.connect() → MOCK offline chip becomes MOCK with spec version
2. Select Treasury Agent (helix-payroll, treasury category)
3. Create transfer intent via makeTransferIntent({ agentId, asset: USDC, recipient, amount: int minor units, reason, requestedAt })
4. Deterministic policy evaluation via validateAction(intentToAgentAction(intent), policy)
   - Checks asset allowlist, recipient allowlist, per-tx cap, daily cap, paused, approval threshold
5. Wallet authorization — executePrivateTransfer checks wallet adapter status, would call wallet.request() in real mode, simulates phases in mock
6. STRK20 private transfer — MockPrivacyProvider.execute() simulates envelope_built → wallet_request_sent → wallet_proving → proof_submitted → proof_verified → receipt_sealed
7. Execution result — PrivateTransferResult with txHash, block, proofVerified, bucket
8. Non-sensitive receipt — ExecutionReceiptData with intentHash, policyHash, traceHash, bucket, no exact amount

## Tests implemented (TASK 9)

In src/lib/execution/executePrivateTransfer.test.ts (async-aware harness):

1. Valid transfer — validateAction allowed, deterministic hash
2. Amount over limit — REASON.ABOVE_TX_LIMIT
3. Recipient not approved — REASON.RECIPIENT_NOT_APPROVED
4. Wrong asset — REASON.ASSET_NOT_ALLOWED
5. Daily limit exceeded — REASON.DAILY_LIMIT_EXCEEDED
6. Paused agent — REASON.PAUSED
7. Human approval required — requiresHumanApproval true, inclusive threshold, 0 disables
8. Wallet disconnected — throws WALLET_DISCONNECTED (disconnects mock adapter, restores)
9. Wrong network — throws WRONG_NETWORK when expectedChainId mismatches
10. Privacy provider unavailable — throws PRIVACY_UNAVAILABLE when capabilities.privacyApi=false
11. STRK20 API failure — maps PrivacyNotAvailableError (extra)

All run live in-browser via EngineConformance component (/policies page) — 50+ assertions.

## What is still mock / next steps

- Privacy backend still mock — flip to "strk20" only after live test
- Wallet still mock — upgrade starknet.js 7.1.0 → 10.4.0 + @starknet-io/get-starknet
- RealWalletAdapter.connect() needs actual WalletAccount implementation
- Strk20WalletApiProvider.execute() needs verified wallet_privateTransfer method name from Ready docs
- Consolidate dual policy engines (float vs int) into single integer-safe engine
- Add 10-block proving delay handling per SDK README (sequencing private txs)
- Deploy Cairo contracts (currently draft, anonymizer panics)

## Commands for next stage

See REPORT.md "Exact command sequence" — upgrade branch, implement real adapter, test with Ready X on Sepolia, then flip backend.
