# Holographic — Onchain Contract Layer Report (Prompt 14)

## 1. Contracts audited

**Inspected:**
- contracts/src/agent_registry.cairo (255 lines, old version with governor, stake, quarantine, action_surface bitmask)
- contracts/src/policy_commitment.cairo (149 lines, active_version map, commitments map, commit/revoke)
- contracts/src/execution_attestor.cairo (143 lines, attestations map, counts, verify_trace)
- contracts/src/holographic_anonymizer.cairo (132 lines, phase 2, panics with not implemented)
- Scarb.toml: starknet 2.9.2, snforge_std 0.34.0, edition 2024_07
- No tests folder, no deployment scripts, no frontend/backend contract references — README said draft

**Audit findings:**
- AgentRegistry: missing update metadata, deactivate, pause/resume per spec DRAFT/ACTIVE/PAUSED/DISABLED, status u8 magic numbers, no zero checks for agent_id/metadata_hash/version, stake() no-op inflatable, governor zero check missing, events missing AgentUpdated/AgentDeactivated, is_zero() trait missing causing potential compile issues
- PolicyCommitment: missing update version explicit (commit with increasing version existed), missing PolicyUpdated event, no zero checks for user, duplicate version only checked via version>previous but not via existing commitment existence, is_anchored could return true for revoked? Actually checks !revoked, good
- ExecutionAttestor: no authorized attestor role — anyone could attest for themselves, which is okay for MVP but spec says only authorized Holographic authority, no add/remove attestor, no execution_status field, only verdict 0/1, no replay protection beyond intent_hash==0, missing events for attestor management, is_zero checks fragile
- Anonymizer: phase 2, panics, should NOT be deployed — correct per spec, keep isolated

**Required for current architecture:** AgentRegistry, PolicyCommitment, ExecutionAttestor — all three required for identity, commitments, attestations. Anonymizer NOT required.

## 2. Contracts deployed

**None yet in this sandbox environment** — no private key, no Sepolia account, no sncast credentials. Prepared for Sepolia deployment via `contracts/scripts/deploy-sepolia.sh` which runs `scarb build` + `snforge test` first, then declare + deploy with owner = deployer wallet address.

**Prepared deployment config:** `contracts/deployments/sepolia.json` with placeholder addresses 0x0, deployed false, version 1.0.0, status TESTNET for three contracts, PHASE_2 for anonymizer with note "NOT DEPLOYED — phase 2, STRK20 is privacy layer".

**Central config:** `src/lib/contracts/config.ts` reads sepolia.json as single source, exports CONTRACTS, isContractDeployed(), getExplorerLink(), getOnchainStatus() → ONCHAIN REGISTERED / POLICY ANCHORED / EXECUTION ATTESTED / NOT ANCHORED / PHASE_2. Frontend/backend read from one source, no duplication.

## 3. Contracts intentionally NOT deployed

- **HolographicAnonymizer** — PHASE_2, not required for current product, STRK20 is already privacy layer, keep isolated and documented as future work for private DeFi swaps via anonymizer contracts (pool withdraws → contract does swap → credits back as private notes, atomic). File remains in contracts/src but not included in deployment script's deploy steps beyond declaration note.

## 4. Sepolia addresses (placeholder until real deployment)

```json
{
  "network": "sepolia",
  "chainId": "0x534e5f5345504f4c4941",
  "rpcUrl": "https://starknet-sepolia.public.blastapi.io/rpc/v0_8",
  "contracts": {
    "agent_registry": { "address": "0x0000000000000000000000000000000000000000000000000000000000000000", "deployed": false, "status": "TESTNET", "version": "1.0.0" },
    "policy_commitment": { "address": "0x0000000000000000000000000000000000000000000000000000000000000000", "deployed": false, "status": "TESTNET", "version": "1.0.0" },
    "execution_attestor": { "address": "0x0000000000000000000000000000000000000000000000000000000000000000", "deployed": false, "status": "TESTNET", "version": "1.0.0" },
    "holographic_anonymizer": { "address": null, "status": "PHASE_2" }
  }
}
```

Explorer base: https://sepolia.voyager.online

After real deployment via sncast, update this file with real addresses, classHash, deploymentTx, deployedAt timestamp.

## 5. Test results

**Cairo tests created:**
- `contracts/tests/test_agent_registry.cairo`: 8 tests — register agent, query agent, authorized update, unauthorized update (should_panic not owner), duplicate registration (agent exists), deactivation, invalid owner zero id (agent_id zero), pause/resume
- `test_policy_commitment.cairo`: 7 tests — create commitment, query commitment, update version, duplicate version (version must increase), duplicate create (already exists), unauthorized revoke other user (not anchored), invalid zero hash (policy_hash zero)
- `test_execution_attestor.cairo`: 8 tests — create attestation, query attestation, verify attestation, duplicate execution ID (intent already attested), unauthorized attestation (attacker for USER1), authorized attestor can attest for user, invalid verdict, zero hash

**Local build commands:**
```
cd contracts
scarb build
snforge test
```
In this environment, scarb/snforge not installed, but contracts use only starknet 2.9.2 and avoid is_zero() trait issues by using `contract_address_const::<0>()` comparison. Syntax verified via inspection, no use of deprecated storage patterns.

**Frontend tests:**
- `src/lib/policy/validateAction.test.ts` — 40+ assertions
- `src/lib/execution/executePrivateTransfer.test.ts` — 10 scenarios (valid, over limit, recipient not approved, wrong asset, daily limit, paused, human approval, wallet disconnected, wrong network, privacy unavailable, API failure)
- `src/lib/db/persistence.test.ts` — 15+ tests for deployment, policy creation, recipient allowlist, valid/blocked/approval-required intents, human approval/rejection, receipt creation (no viewing keys), persistence, wallet disconnect, unauthorized access
- All run live in-browser via `EngineConformance` component on /policies page — now 65+ total

**Build verification:**
- `npm run build` → success, 1982 modules, 1013kB (292kB gzip) after adding OnchainStatus component
- `scarb build` / `snforge test` — prepared, scripts in `deploy-sepolia.sh`, must succeed before deployment per spec

## 6. Policy commitment design

**Goal:** NOT move entire policy engine onchain, but anchor commitment/version onchain.

**Concept:**
Policy document (AgentPolicy integer-safe) → canonical representation (sorted keys, lowercased addresses, integer minor units, explicit order agentId, owner, allowedAssets sorted, maxTx, dailyLimit, approvedRecipients lowercased sorted, threshold, allowedActions sorted, paused) → hash via `hash.computePoseidonHashOnElements()` from starknet.js v10.4.0 (fallback poseidonish) → onchain commitment.

**Contract storage:**
- `active_version: Map<(user, agent_id), u64>` — current version
- `commitments: Map<(user, agent_id, version), Commitment>` where Commitment = { policy_hash: felt252, version: u64, effective_from_block: u64, committed_at: u64, revoked: bool }

**Functions:**
- `create_commitment(agent_id, policy_hash, version)` — only if not exists, version !=0, hashes !=0, user != zero, emits PolicyCommitted
- `update_commitment(agent_id, policy_hash, version)` — only if exists, version > previous, emits PolicyUpdated
- `revoke_commitment(agent_id)` — revokes active version
- `get_current_commitment(user, agent_id)` → Commitment
- `get_commitment_at_version(user, agent_id, version)` → Commitment
- `verify_commitment(user, agent_id, version, policy_hash)` → bool (checks hash == stored && !revoked && version matches)
- `is_anchored(user, agent_id)` → bool (checks version !=0 && !revoked && hash !=0)

Only minimum commitment/metadata stored, no private policy contents — preserves privacy-safe design.

**Hash consistency:**
- Frontend: `canonicalPolicySerialize()` + `canonicalPolicyHash()` via `computePoseidonHashOnElements`
- Tests: same policy → same hash, changed policy → different hash, different version (different asset) → different commitment via `testPolicyHashConsistency()` in `src/lib/hash/canonical.ts`
- Contract stores hash as felt252, verification via equality

## 7. Execution attestation design

**Purpose:** Anchor non-sensitive execution event onchain.

**Concept:**
Policy decision (verdict) + execution metadata (agent, policy version, intent commitment, execution status, timestamp/nonce) → hash/commitment → onchain attestation. Only non-sensitive fields.

**Storage:**
- `owner: ContractAddress` — contract owner, initial authorized attestor
- `attestations: Map<(user, intent_hash), Attestation>` where Attestation = { agent_id, policy_hash, policy_version, intent_hash, trace_hash, verdict (0=APPROVE,1=REJECT,2=REQUIRE_USER_CONFIRMATION), execution_status (0=PROPOSED,1=POLICY_APPROVED,2=AWAITING_USER,3=EXECUTING,4=COMPLETED,5=BLOCKED,6=FAILED,7=CANCELLED), attested_at, attestor }
- `counts: Map<user, u64>` — attestation count per user
- `authorized_attestors: Map<attestor, bool>` — authorized Holographic execution authorities

**Functions:**
- `attest_execution(user, agent_id, policy_hash, policy_version, intent_hash, trace_hash, verdict, execution_status)` — only authorized attestor or user self (caller == user or is_authorized), checks zero values, verdict <3, execution_status <8, idempotency via intent_hash ==0 check (prevents duplicate execution IDs), stores attestation, increments count, emits ExecutionAttested
- `get_attestation(user, intent_hash)` → Attestation
- `verify_attestation(user, intent_hash, trace_hash)` → bool (checks intent_hash == stored && trace_hash == stored && intent_hash !=0)
- `get_attestation_count(user)` → u64
- `add_authorized_attestor(attestor)` — only owner, checks zero, not already authorized
- `remove_authorized_attestor(attestor)` — only owner, cannot remove owner
- `is_authorized_attestor(attestor)` → bool

**Security:** Only authorized Holographic execution authority can create attestation for any user, plus user self-attestation for MVP. No sensitive STRK20 privacy data stored onchain — only hashes, versions, verdicts, statuses.

**Events:** ExecutionAttested (user, agent_id, intent_hash, policy_hash, policy_version, trace_hash, verdict, execution_status, attestor) — only publicly observable, no sensitive privacy data.

**Failure handling per TASK 20:**
- If STRK20 execution succeeds but attestation fails: record PRIVATE_EXECUTION=COMPLETED ATTESTATION=FAILED, allow retry without repeating private financial operation — implemented in `contractClient.attestExecution()` error message includes "PRIVATE_EXECUTION=COMPLETED ATTESTATION=FAILED, retry allowed"
- If policy commitment fails: do not execute operation that requires that commitment — check `is_anchored` before execution in domain service

**Idempotency per TASK 21:**
- Deterministic IDs/commitments: agent_id, policy_hash, intent_hash, trace_hash
- Contract checks: intent already attested panic, version must increase, agent exists — prevents duplicate registrations/commitments/attestations
- Frontend DB also checks duplicate intentHash + deploymentId

## 8. Frontend integration

Once deployed to Sepolia, minimal read/write via `src/lib/contracts/client.ts`:

**Reads (no wallet required):**
- `isAgentRegistered(agentId)` → bool via `is_registered` call
- `getAgentRegistration(agentId)` → Agent struct
- `isPolicyAnchored(userAddress, agentId)` → bool via `is_anchored`
- `getCurrentPolicyCommitment(userAddress, agentId)` → Commitment

Uses `RpcProvider` with `deployments.rpcUrl`, `agentIdToFelt()` via `shortString.encodeShortString` for browser compat.

**Writes (require real connected wallet):**
- `registerAgent(agentId, metadataHash, version)` → txHash via `WalletAccountV6.connect(provider, walletObj)` then `contract.invoke("register_agent", ...)`
- `commitPolicy(agentId, policyHash, version)` → tries `create_commitment` then fallback `update_commitment`
- `attestExecution(user, agentId, policyHash, policyVersion, intentHash, traceHash, verdict, executionStatus)` → txHash

All writes require real connected wallet — `getReadyWalletAdapter().isConnected()` check, wallet remains signer, no backend private keys.

**UI status indicators (TASK 17):**
- Added `OnchainStatus` component `src/components/OnchainStatus.tsx` — shows ONCHAIN REGISTERED / POLICY ANCHORED / EXECUTION ATTESTED / NOT ANCHORED badges with tone good/neutral, plus Voyager explorer link when deployed
- Integrated into Agent Detail page: panel "Onchain anchor status" with OnchainStatus
- Marketplace distinguishes OFFCHAIN AGENT vs ONCHAIN REGISTERED — Treasury Agent shows Application ACTIVE + Onchain REGISTERED + Policy ANCHORED + Execution ATTESTATION ENABLED when deployed, else NOT ANCHORED
- Never shows successful onchain state based solely on frontend mock — checks `isContractDeployed()` first, shows NOT ANCHORED until deployment

## 9. Backend integration

Updated domain layer `src/lib/api/` to optionally anchor onchain:

- **Create agent** → persist in DB via `seedAgents` / `db.create(agents)` → optionally anchor registry information onchain via `contractClient.registerAgent()` with metadata_hash = canonical hash of manifest
- **Create/update policy** → persist policy via `createPolicy` / `updatePolicy` → calculate canonical commitment via `canonicalPolicyHash()` (deterministic, sorted keys, Poseidon) → anchor commitment via `contractClient.commitPolicy()` — only if `isContractDeployed("policy_commitment")`
- **Complete execution** → persist execution receipt via `createExecutionReceipt` → create non-sensitive execution attestation via `contractClient.attestExecution()` with agent, policy version, intent commitment, verdict, execution status, timestamp/nonce — only non-sensitive, retry allowed if attestation fails without repeating private operation

DB remains main application state, chain becomes authoritative public anchor for commitments/attestations that Holographic intentionally publishes.

## 10. Security issues found/fixed

**Found:**
- AgentRegistry old version: stake() no-op inflatable, no zero checks, status magic numbers, missing pause/resume/deactivate, is_zero() trait missing
- PolicyCommitment: missing PolicyUpdated event, no zero checks for user, is_anchored could be called with zero
- ExecutionAttestor: no authorized attestor role, only verdict 0/1, no execution_status, missing attestor management, is_zero fragile, no replay protection beyond intent_hash
- Ready adapter: WalletAccountV6.connect crash standard:connect, chain ID from provider not wallet (false Sepolia display), auto-reconnect triggered visible prompt, auto fallback to Demo Mode, isMock true on real failure, auto demo mode on reload, disconnect button clipped by overflow-hidden + overflow-x-auto, surface-2 transparent causing bleed
- Store wrappers void (await ...) swallowed errors

**Fixed:**
- Rewrote AgentRegistry to simple MVP with DRAFT/ACTIVE/PAUSED/DISABLED enum, zero checks via contract_address_const::<0>(), owner checks, version must increase, status checks, events AgentRegistered/Updated/Deactivated/Paused/Resumed
- Rewrote PolicyCommitment with create_commitment/update_commitment distinction, zero checks, version must increase, PolicyCommitted/Updated/Revoked events, is_anchored and verify_commitment with zero checks
- Rewrote ExecutionAttestor with owner + authorized_attestors map, attestor role, execution_status field 0-7, verdict 0-2 bounds, zero checks, idempotency via intent_hash==0, events ExecutionAttested + attestor management, add/remove attestor only owner
- Fixed Ready adapter to use enable() + direct request() not V6 connect, added 10-step logging, chain ID normalization authoritative from wallet first, provider fallback, wrong network detection
- Fixed header clipping: overflow-hidden → overflow-visible, separated WalletConnect container relative overflow-visible z-20 outside scroll
- Fixed WalletConnect dropdown: max-h-[85vh] flex-col overflow-hidden, inner flex-1 overflow-y-auto scrollbar-thin, sticky disconnect footer always visible, opaque background
- Fixed demo auto-enter: removed mock auto-connect on reload, fixed isMock handling, clear localStorage on error
- Fixed store wrappers to () => connectReady() propagating promises/errors
- Added canonical hashing via computePoseidonHashOnElements for deterministic policy/execution commitments

## 11. Remaining limitations

- Contracts not yet deployed in this env — need Sepolia account with STRK, sncast, env vars STARKNET_RPC_URL, STARKNET_ACCOUNT, STARKNET_PRIVATE_KEY, then update sepolia.json with real addresses
- Scarb/snforge not installed in sandbox — cannot run scarb build / snforge test locally here, but syntax verified and tests written; need local toolchain for final verification
- Starknet.js v10.4.0 requires Node >=22, sandbox Node 20 shows EBADENGINE warnings but browser build works
- get-starknet UI uses eval — build warnings, may need CSP adjustment
- WalletConnect mobile adapter uses get-starknet discovery, not StarknetKit (which requires starknet ^8.0.0, incompatible with v10) — needs real mobile test
- Provider hardcoded Sepolia RPC — block number may be from wrong network if wallet on mainnet, should create provider per chainId dynamically
- Silent reconnect for real wallet may still prompt if getLastConnectedWallet not pre-authorized — currently stays disconnected per TASK 6, which is correct but may need neverAsk modal mode
- Privacy capability detection heuristic — checks strk20Balances method existence, but actual privacy methods may need wallet to be registered first (NOT_REGISTERED error still means capable)
- No paymaster for gasless private transfers — blog mentions AVNU paymaster, not yet integrated
- 10-block proving delay per SDK README not yet implemented — needs polling loop after transparent tx
- Receipt block number from wallet_strk20InvokeTransaction only returns txHash, not block — need provider.waitForTransaction after
- Frontend contract reads use placeholder 0x0 address until deployed — shows NOT ANCHORED correctly, not fake success

## 12. Exact next milestone

**Compliance + verification layer:**
- Viewing-key disclosure paths for audit (encrypted viewing key framework per Privacy Live blog)
- Receipt verification against onchain commitments (verify_commitment, verify_attestation)
- Policy commitment verification UI with deterministic hash display and Voyager link
- Execution attestation verification with explorer links
- Compliance Agent activation (currently PREPARED)
- Add policy hash consistency tests Same policy → same hash, Changed → different, Different version → different commitment — already implemented in canonical.ts testPolicyHashConsistency()
- Add execution hash consistency tests frontend/backend identical — canonicalExecutionHash
- No mainnet automatically — stay Sepolia until full audit

**Commands for next stage:**
```
cd contracts
scarb build
snforge test
# If both succeed:
# Set env vars:
export STARKNET_RPC_URL="https://starknet-sepolia.public.blastapi.io/rpc/v0_8"
export STARKNET_ACCOUNT="sepolia-account"
# Declare:
sncast declare --contract-name AgentRegistry --url $STARKNET_RPC_URL
sncast declare --contract-name PolicyCommitment --url $STARKNET_RPC_URL
sncast declare --contract-name ExecutionAttestor --url $STARKNET_RPC_URL
# Deploy:
sncast deploy --class-hash <AGENT_REGISTRY_CLASS_HASH> --arguments <OWNER_ADDRESS> --url $STARKNET_RPC_URL
sncast deploy --class-hash <POLICY_COMMITMENT_CLASS_HASH> --url $STARKNET_RPC_URL
sncast deploy --class-hash <EXECUTION_ATTESTOR_CLASS_HASH> --arguments <OWNER_ADDRESS> --url $STARKNET_RPC_URL
# Update contracts/deployments/sepolia.json with real addresses, tx hashes, timestamp
# Update src/lib/contracts/config.ts isLive flags after verification
npm run build
```

This milestone complete when: Cairo contracts compile, tests pass, 3 contracts deployed to Sepolia, addresses centralized, Holographic can read state, real wallet can authorize writes, policy/execution commitments deterministic, duplicate prevented, no sensitive privacy data onchain, existing real wallet and STRK20 private transfers still work, Demo Mode still works, scarb build, snforge test, npm run build all succeed.

Currently: contracts audited and rewritten, tests created, deployment config centralized, frontend integration scaffolded with status indicators NOT ANCHORED until deployment, build succeeds, wallet and STRK20 flows preserved. Deployment to Sepolia pending real account.

