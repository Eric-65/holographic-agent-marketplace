# Holographic — Audit (TASK 1) — 2026-08-13

## Source tree inspected
- src/lib/privacy/ (provider, mockProvider, strk20Provider, index)
- src/lib/wallet/useWallet.ts
- src/lib/policy/ (model, validateAction, engine, testKit)
- src/lib/store.tsx, types.ts
- components: WalletConnect, PrivacyStatus, ApprovalDialog, ExecutionReceipt
- contracts/src/*.cairo
- package.json: starknet ^7.1.0, React 19, Vite 7

## 1. Exact mock boundaries
| Layer | File | Status | Notes |
|-------|------|--------|-------|
| Wallet | src/lib/wallet/useWallet.ts | **Mock** | Hardcoded DEMO_ADDRESS, no starknet import after last fix, localStorage flag. No WalletAccount, no injected provider detection. |
| PrivacyProvider | src/lib/privacy/mockProvider.ts | **Mock** | Simulates timings, returns poseidonish hashes, returns MOCK_POSITIONS. `detectCapabilities()` returns simulated spec v0.10.3. |
| PrivacyProvider factory | src/lib/privacy/index.ts | Hardcoded `PRIVACY_BACKEND="mock"` | Singleton, no runtime toggle. |
| Strk20Provider | strk20Provider.ts | **Stub** | All methods throw PrivacyNotAvailableError except detectCapabilities which returns all false. |
| Treasury positions | src/lib/mock/treasury.ts | Mock | Static balances |
| Agents | src/lib/mock/agents.ts | Mock | 6 agents, manifestHash arbitrary |
| Intents | src/lib/mock/intents.ts | Mock | Math.random(), float USD amounts, rationale strings — not from LLM, not deterministic. |
| Receipts | src/lib/mock/receipts.ts | Mock | Deterministic PRNG seeded history |
| Policies | src/lib/mock/policies.ts | Mock | poseidonish hash, not real poseidon |
| Contracts | contracts/src/*.cairo | Draft, not deployed | No token transfers, stake() is no-op, anonymizer reverts with panic. |

## 2. Existing wallet assumptions
- Assumes wallet is always available if `localStorage holographic:wallet=1`
- Previously assumed `starknet` package exports `validateAndParseAddress` and `constants.StarknetChainId` (broke on v7→v8)
- No ChainId validation, no network check beyond string includes
- No `get-starknet` / `starknet-react` / WalletConnect
- No account abstraction, no `WalletAccount.request()` flow
- Capabilities entirely derived from PrivacyProvider, not from wallet `wallet_supportedSpecs`

## 3. Existing STRK20 adapter interface
Defined in src/lib/privacy/provider.ts:
```ts
interface PrivacyProvider {
  id, label, isLive
  detectCapabilities(): WalletCapabilities
  getPositions(address): TreasuryPosition[]
  buildEnvelope(intent, policyHash, intentHash): ExecutionEnvelope
  execute(envelope, onPhase): ExecutionResult
}
```
- `ExecutionEnvelope` hardcodes method names `wallet_shield`, `wallet_unshield`, `wallet_privateTransfer`, `wallet_privateSwap`, `wallet_privateMulticall` — these are plausible but NOT verified against official spec v0.10.3 (spec doc not public in repo). Risk of invention.
- Phases are simulated: envelope_built → wallet_request_sent → wallet_proving → proof_submitted → proof_verified → receipt_sealed
- No real viewing key / note handling by design (correct)
- `getPrivacyProvider()` is singleton, not injectable, not wallet-aware

## 4. Existing policy-engine API
Two engines coexist:
- `src/lib/policy/engine.ts` → `evaluatePolicy(intent: ActionIntent, policy: PolicyDocument, state: BindingState, now)` → PolicyVerdict with trace[]. Pure, deterministic, fixed order R01-R12, halting on first fail, uses float USD, includes soft band. Used by ApprovalDialog.
- `src/lib/policy/validateAction.ts` → `validateAction(action: AgentAction, policy: AgentPolicy)` → {allowed, reasons, requiresHumanApproval}. Pure, accumulates all violations, integer minor units, no halting, zero floating point. Used by EngineConformance tests. `VALIDATOR_VERSION=2.0.0`.
- Drift risk: preview vs production could disagree. Should consolidate but both currently pure.

## 5. Existing intent model
| Model | Fields | Integer-safe? |
|-------|--------|---------------|
| ActionIntent (types.ts) | id, agentId, kind, asset, venue, amountUsd (float), maxSlippageBps, counterparty, deadline, rationale (free text), nonce, createdAt | **No** — USD float |
| AgentAction (policy/model.ts) | id, agentId, action, asset, amount (int minor units), recipient, spentToday, timestamp | **Yes** but missing reason, metadata, requestedAt naming |
- No unified TransferIntent matching required spec: agentId, action, asset, recipient, amount, reason, requestedAt, metadata
- `simulateIntent` uses Math.random(), non-deterministic

## 6. Existing receipt model
`ExecutionReceiptData` in types.ts:
- id, agentId, agentName, kind, asset, venue, bucket (coarse), intentHash, policyHash, traceHash, txHash?, block?, proofVerified, attestationSig, status, failedRule?, createdAt, latencyMs?
- Non-sensitive by design: no exact amount, no counterparty stored — correct.
- `attestationSig` is poseidonish hash, not real signature — mock.

## 7. Existing agent execution flow
Current flow in `src/app/agents/[id]/page.tsx` + ApprovalDialog:
1. User clicks "Run agent cycle"
2. `simulateIntent(agent)` → ActionIntent (random)
3. `evaluatePolicy(intent, policy, bindingState)` → verdict
4. If REJECT → create blocked receipt via `onReceipt`
5. If APPROVE/REQUIRE_USER_CONFIRMATION → `getPrivacyProvider().buildEnvelope()` → `execute()` with phase callbacks → record execution + receipt
- LLM never involved — good
- No real wallet authorization step; mock provider simulates it
- No `getAccount()` / `getChainId()` checks before execution
- `recordExecution` only updates dailySpentUsd in memory, not persisted

## 8. Existing contract interfaces
- `AgentRegistry.cairo`: register_agent, publish_version, revoke_version, stake (no-op), quarantine. Stores AgentRecord, AgentVersion, bitmask action_surface. Governed by single governor address.
- `PolicyCommitment.cairo`: commit, revoke, active_commitment, commitment_at_version, verify. Only stores policy_hash, no doc.
- `ExecutionAttestor.cairo`: attest, get_attestation, attestation_count, verify_trace. Stores traceHash, no amount.
- `HolographicAnonymizer.cairo`: PHASE 2, always reverts with panic!("not implemented"). Intended single entrypoint `execute_anonymized` called only by privacy pool.
- All draft, Scarb.toml uses starknet 2.9.2, snforge 0.34.0. No deployment scripts.

## 9. Dependencies conflicting with STRK20 integration requirements
| Installed | Required per blog | Issue |
|-----------|-------------------|-------|
| starknet ^7.1.0 | v10.4.0 per Push to Private | **Major version gap** — 3 major versions behind. v8 removed defaultProvider, changed Account, v10 introduced WalletAccount.request() for Wallet API, TypedData rev changes |
| No @starknet-io/get-starknet / starknet-react | Needed for wallet discovery | Cannot detect Ready X / Xverse injection |
| No @starkware-libs/starknet-privacy-sdk | Optional but useful for direct SDK path | Not required if using Wallet API path, but would be needed for advanced flows |
- vite-plugin-singlefile inlines everything; starknet v10 is larger and uses WebAssembly — may need chunking adjustment

## 10. Places where UI components directly depend on mock behavior
- `WalletConnect.tsx`: imports `chainLabel` from `useWallet`, but no check for real chain mismatch; only displays `walletName` which is mocked.
- `PrivacyStatus.tsx`: imports `getPrivacyProvider()` and `PRIVACY_BACKEND` directly, determines live vs mock via constant, not via wallet capabilities. Couples UI to provider singleton.
- `ApprovalDialog.tsx`: calls `getPrivacyProvider()` inside `run()` — no injection, no wallet pre-checks (disconnected, wrong network, privacyApi false). Phase UI hardcoded to mock phase order.
- `ExecutionReceipt.tsx`: displays `proofVerified` boolean from mock, assumes block number exists.
- `TreasuryCard.tsx` / `treasury/page.tsx`: masks values but uses `MOCK_POSITIONS` directly via store; no distinction between public vs shielded note count reality.
- `AgentCard` uses `metrics` from mock (executions, trust) — fine for scaffold.
- `PolicyEditor` directly hashes policy via poseidonish, not real Poseidon.

**Conclusion**: Mock boundary is clean (PrivacyProvider interface) but wallet layer is still mock-only, envelope method names are unverified, dual policy engines risk drift, intent model not integer-safe in primary flow, UI components import provider singleton directly rather than via context.
