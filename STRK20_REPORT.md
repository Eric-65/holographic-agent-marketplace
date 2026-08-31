# STRK20 Private Transfer — Real Integration Report

## 1. Exact STRK20 API methods used (verified from installed starknet.js v10.4.0)

From `node_modules/@starknet-io/starknet-types-0103/dist/types/wallet-api/methods.d.ts` and `node_modules/starknet/dist/index.d.ts`:

**General wallet API (official):**
- `wallet_requestAccounts` — request active accounts, triggers user approval
- `wallet_requestChainId` — request current chain ID
- `wallet_supportedSpecs` — list of supported RPC spec versions (e.g., "0.10.3")
- `wallet_supportedWalletApi` — list of wallet API versions

**STRK20 Privacy Wallet API (spec v0.10.3) — verified real methods:**
- `wallet_strk20Balances` — params: { tokens: Address[] }, result: STRK20_BALANCE_ENTRY[] (token, balance). Empty tokens returns all shielded balances.
- `wallet_strk20PrepareInvoke` — params: { actions: STRK20_ACTION[], simulate?: boolean }, result: STRK20_CALL_AND_PROOF { call: Call, proof: STRK20_PROOF { data, output, proof_facts } }. Simulate=true returns empty proof for fee estimation.
- `wallet_strk20InvokeTransaction` — params: { actions: STRK20_ACTION[] }, result: { transaction_hash: PADDED_TXN_HASH }. Submits one or more STRK20 actions atomically, shows wallet approval UI, handles ZK proof generation internally (may take long).

**STRK20_ACTION verified:**
```ts
type STRK20_ACTION = 
  | { type: 'deposit', token: ADDRESS, amount: FELT }
  | { type: 'withdraw', token: ADDRESS, amount: FELT, recipient: ADDRESS }
  | { type: 'transfer', token: ADDRESS, amount: FELT | 'OPEN', recipient: ADDRESS }
  | { type: 'invoke', contract: ADDRESS, calldata: STRK20_CALLDATA_ITEM[] }
```

We use `transfer` for private transfer: token = USDC address, amount = FELT hex from integer minor units, recipient = approved vendor address.

**Wrapper methods in WalletAccountV6 (starknet.js v10.4.0):**
- `account.strk20Balances(tokens)`
- `account.strk20PrepareInvoke(actions, simulate)`
- `account.strk20InvokeTransaction(actions)` → { transaction_hash }

We use direct `wallet.request({ type: "wallet_strk20InvokeTransaction", params: { actions } })` to avoid WalletAccountV6.connect incompatibility (standard:connect error), which is the documented underlying RPC call.

No invented methods like `wallet_privateTransfer`, `wallet_shield` are used in real path — those remain only in legacy mock envelope for backward compatibility.

## 2. Files changed for this milestone

- **src/lib/privacy/provider.ts** — extended ExecutionEnvelope method union to include verified `wallet_strk20InvokeTransaction`, `wallet_strk20PrepareInvoke`, `wallet_strk20Balances`, added optional `strk20Actions` field, added `buildTransferEnvelope` and `executePrivateTransfer` optional methods
- **src/lib/privacy/strk20Provider.ts** — REAL implementation using verified methods: detectCapabilities via `wallet_supportedSpecs` + `wallet_strk20Balances` probe, getPositions via `wallet_strk20Balances([])`, buildEnvelope and buildTransferEnvelope mapping to STRK20 transfer action with FELT hex amount, execute via `wallet_strk20InvokeTransaction` with phase callbacks and error mapping
- **src/lib/privacy/index.ts** — backend selection now "auto" by default, checks localStorage adapter kind, returns strk20 provider when real wallet connected, mock otherwise; added `getExecutionProvider(isMock)` to clearly distinguish DEMO vs STRK20 execution
- **src/lib/intent/model.ts** — already existed, integer-safe TreasuryTransferIntent with agentId, action, asset, recipient, amount (minor units), reason, requestedAt, metadata
- **src/lib/execution/privateTransfer.ts** — clean boundary `executePrivateTransfer(intent, policy, opts)` implementing Intent → Policy Decision → Privacy Provider → Wallet authorization → STRK20 operation → Result, with checks for wallet disconnected, wrong network, privacy unavailable, policy rejection, human confirmation, wallet rejected, API failure
- **src/components/TreasuryTransferForm.tsx** — NEW, real action for Treasury UI: fields Asset, Recipient, Amount, Reason, shows policy result before authorization (✓ Allowed asset, ✓ Approved recipient, ✓ Within limit, ✓ Daily limit, ✓ Not paused), then [Authorize private transfer] button, then ExecutionReceipt with only non-sensitive metadata
- **src/app/treasury/page.tsx** — added TreasuryTransferForm component, no redesign
- **src/components/WalletConnect.tsx** — fixed clipping (header overflow-visible, separate non-scrolling container), added sticky disconnect footer with max-h-[85vh] overflow-y-auto, dev diagnostic panel with error class/message/code/adapter/wallet/chain/network/detection/logs
- **src/lib/wallet/adapters/readyAdapter.ts** — fixed to avoid WalletAccountV6.connect crash, uses direct enable() + request() flow, added 10-step logging, chain ID normalization (bigint/hex/SN_SEPOLIA/SN_MAIN), wrong network detection, connectSilent()
- **src/lib/wallet/adapters/walletConnectAdapter.ts** — same fixes for mobile
- **src/lib/wallet/useWallet.ts** — fixed auto-demo bug (no auto-connect mock on reload), fixed isMock handling, added errorDetails with class/code, detectionState, logs, no auto fallback to Demo on real failure per TASK 10, silent reconnect only
- **src/lib/store.tsx** — simplified wrappers to `() => connectReady()` to propagate errors, added errorDetails, connectReady, connectWalletConnect
- **src/app/layout.tsx** — header overflow-hidden → overflow-visible, separated scrollable status area (PrivacyStatus + theme) from non-scrolling WalletConnect container (relative overflow-visible z-20)
- **src/components/PrivacyStatus.tsx** — handles new states DISCONNECTED/CONNECTING/CONNECTED/NETWORK_VERIFIED/PRIVACY_CAPABLE/ERROR/DEMO_MODE/WRONG_NETWORK
- **src/components/DiagnosticPanel.tsx** — shows Connection, Adapter, Wallet, Chain, Network, RPC available/unavailable, Block

## 3. Mock provider behavior

- `MockPrivacyProvider` — id="mock", isLive=false
- `detectCapabilities()` returns simulated spec 0.10.3 with all true
- `getPositions()` returns static MOCK_POSITIONS
- `buildEnvelope()` creates envelopeId via poseidonish, method = wallet_privateTransfer (legacy) or wallet_strk20InvokeTransaction for new, expires 30s
- `execute()` simulates phases: envelope_built (220ms) → wallet_request_sent (380ms) → wallet_proving (900ms) → proof_submitted (420ms) → proof_verified (560ms) → receipt_sealed (260ms), returns fake txHash via poseidonish, block 1_284_400 + random, proofVerified true, latencyMs
- `executePrivateTransfer` in real provider delegates to MockPrivacyProvider when mock adapter is connected — ensures Demo Mode continues working even when STRK20 unavailable

Clearly distinguished as DEMO EXECUTION in UI via Badge warn tone.

## 4. Real provider behavior

- `Strk20WalletApiProvider` — id="strk20", label="STRK20 Privacy Wallet API — wallet_strk20InvokeTransaction", isLive=false until live tx verified
- `detectCapabilities()`:
  - Gets wallet object from Ready adapter (_walletObj)
  - Calls `wallet.request({ type: "wallet_supportedSpecs" })` → checks for 0.10 / privacy
  - Tries `wallet_strk20Balances([])` — if NOT_REGISTERED error, still means privacy capable (user not registered yet)
  - Returns privacyApi true if spec includes 0.10 or strk20 method exists
- `getPositions()`:
  - Calls `wallet_strk20Balances({ tokens: [] })` → returns all shielded balances
  - Maps to TreasuryPosition with shieldedBalance (wallet-reported, not stored), publicBalance 0, noteCount 0
  - Returns [] if NOT_REGISTERED (user must shield first)
  - Throws PrivacyNotAvailableError otherwise
- `buildTransferEnvelope()`:
  - Token address from TOKEN_ADDRESSES map (USDC Sepolia official 0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343)
  - Amount: "0x" + BigInt(intent.amount).toString(16) — integer minor units → FELT hex, no floating point
  - Action: { type: 'transfer', token, amount, recipient }
  - Returns envelope with method wallet_strk20InvokeTransaction, strk20Actions, expiresAt
- `execute()`:
  - Checks wallet connected and request method exists
  - Phase callbacks: envelope_built → wallet_request_sent → wallet_proving → proof_submitted → proof_verified → receipt_sealed
  - Calls `wallet.request({ type: "wallet_strk20InvokeTransaction", params: { actions } })` — triggers wallet approval UI, may take long (SNIP-36 proof)
  - Returns txHash from result.transaction_hash, proofVerified true, latencyMs
  - Error mapping: user refused → User rejected, insufficient → Insufficient private balance, NOT_REGISTERED → Not registered, PRIVACY_LEAK → Privacy leak, else API failure
  - Never stores viewing keys, notes, witnesses, exact amounts beyond envelope lifetime

## 5. Policy → STRK20 execution path

```
User input (Treasury UI)
→ TreasuryTransferIntent (agentId, action: transfer, asset: USDC, recipient, amount: int minor units, reason, requestedAt, metadata)
→ intentToAgentAction() → AgentAction (id, agentId, action, asset, amount, recipient, spentToday=0, timestamp)
→ validateAction(action, policy) → { allowed, reasons, requiresHumanApproval }
  Policy used: basePolicy with allowedAssets [USDC,STRK,ETH], maximumTransactionAmount 500*USDC (for CASE B), dailySpendingLimit 5000*USDC, approvedRecipients [vendor, self, screenshot address], approvalThreshold 250*USDC, allowedActions [payment,transfer,swap], paused false
→ If REJECT: do not call wallet, show reasons, create blocked receipt
→ If REQUIRE_USER_CONFIRMATION: show confirm dialog (window.confirm in Treasury form, ApprovalDialog in agent flow)
→ If APPROVE: buildTransferEnvelope → executePrivateTransfer → getPrivacyProvider().execute() → wallet authorization → STRK20 operation
→ Result: ExecutionResult { txHash, block, proofVerified, latencyMs }
→ Receipt: ExecutionReceiptData with bucket (coarse, not exact amount), intentHash, policyHash, traceHash, txHash, status executed, timestamp, no viewing keys/notes/witnesses
```

Test cases per spec:
- CASE A: 10 USDC approved recipient within 500 limit → APPROVE ✓
- CASE B: 800 USDC limit 500 → REJECT E_ABOVE_TRANSACTION_LIMIT
- CASE C: recipient not approved → REJECT E_RECIPIENT_NOT_APPROVED
- CASE D: 300 USDC threshold 250 → REQUIRE_USER_CONFIRMATION

All via validateAction, LLM never decides — rationale field never read.

## 6. Wallet authorization behavior

- Uses real connected wallet via Ready adapter's _walletObj (from enable())
- `wallet.request({ type: "wallet_strk20InvokeTransaction", params: { actions } })` shows wallet approval UI (Ready X)
- Waits for user response
- Handles user rejected, insufficient balance, wrong network, unsupported asset, privacy capability unavailable, API unavailable, transaction failure, successful execution
- Does NOT convert failures into fake success — throws ExecutionError with code

## 7. Error handling

| Error | Code | Handling |
|-------|------|----------|
| Wallet disconnected | WALLET_DISCONNECTED | Check adapter.getInternalState().status, throw before policy check |
| Wrong network | WRONG_NETWORK | Compare diagnostic.chainId vs expected 0x534e5f5345504f4c4941, show WRONG NETWORK Expected Sepolia Detected Mainnet, guidance Switch network |
| Privacy unavailable | PRIVACY_UNAVAILABLE | Check capabilities.privacyApi, throw if false, UI shows ERROR |
| Policy rejected | POLICY_REJECTED | validateAction allowed false, reasons include E_* codes, do not call wallet |
| Human confirmation | REQUIRE_CONFIRMATION | requiresHumanApproval true, show confirm dialog, only proceed if confirmed |
| Wallet rejected | WALLET_REJECTED | Catch "user refused"/"rejected", throw |
| Insufficient balance | PRIVACY_UNAVAILABLE (mapped) | Catch "insufficient" message from wallet_strk20InvokeTransaction |
| Not registered | PRIVACY_UNAVAILABLE | Catch "not_registered", message "user must shield first" |
| API failure | API_FAILURE | Generic catch, surface exact message in dev diagnostic |

Dev diagnostic panel shows: Error class, Error message, Error code, Wallet adapter (ready/mock/walletconnect), Wallet name, Chain ID, Network, Browser detection state (hasWindowStarknet, hasReady, availableCount, availableIds, discoveryCount), logs (last 6 steps).

## 8. Whether real private transfer was successfully tested

**Not yet in sandbox environment** — no Ready extension installed, no Sepolia USDC private balance, no funded account. Real provider's `execute()` would require:
- Ready X extension installed and connected to Sepolia
- Account funded with STRK for gas and USDC
- User registered in privacy pool (shielded at least once)
- Private USDC balance available for transfer

In current environment, attempting real transfer via `executePrivateTransfer` with real adapter disconnected throws WALLET_DISCONNECTED, with mock adapter returns DEMO EXECUTION success (simulated txHash).

**Demo Mode transfer WORKS:** Valid transfer 10 USDC → APPROVE → mock phases → txHash 0x... → receipt generated with bucket 1k–5k, proofVerified true (simulated).

**Real STRK20 transfer NOT yet exercised locally** — per instruction, STOP at integration boundary and explain missing prerequisite instead of fabricating.

Missing prerequisite:
- Live browser with Ready X extension
- Sepolia network with privacy pool deployed (mainnet pool exists, Sepolia pool address not configured in provider — need pool contract address for discovery? Wallet API handles pool internally, but token must be supported)
- Funded account with private USDC

## 9. Transaction/execution identifier

- Demo: `0x` + poseidonish hash, e.g., `0x07...` sliced, block `1_284_400 + random`, latency ~2-3s simulated
- Real: Would be `transaction_hash` from `wallet_strk20InvokeTransaction` result, e.g., `0x...` from Starknet, block undefined until fetched via provider.waitForTransaction, proofVerified true

Currently in Demo Mode, execution ID is available and displayed as short hash in receipt, but clearly labeled DEMO EXECUTION, not STRK20.

## 10. Remaining blockers for real STRK20

1. **Live wallet environment** — need browser with Ready X extension, Sepolia network, funded account
2. **Token support** — verify USDC Sepolia address 0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343 is supported by current STRK20 pool on Sepolia (mainnet supports, Sepolia may need config)
3. **Registration** — user must have shielded at least once to have private balance; wallet_strk20Balances returns NOT_REGISTERED if not
4. **Provider chain consistency** — currently uses hardcoded Blast Sepolia RPC for read-only, but should dynamically create provider matching wallet chainId (Sepolia vs Mainnet) to avoid block number mismatch
5. **Silent reconnect for real wallet** — implemented connectSilent but needs testing with Ready's pre-authorized wallets (getAuthorizedWallets)
6. **Paymaster for gasless** — blog mentions AVNU paymaster for gasless private flows; real transfer may need paymaster integration if user has no public STRK for gas
7. **10-block proving delay** — SDK README describes sequencing constraint: need to wait ~10 blocks after transparent tx before private tx; not yet implemented in execution pipeline (needs polling loop)
8. **Receipt block number** — wallet_strk20InvokeTransaction returns only txHash, not block; need to fetch block via provider.waitForTransaction after tx
9. **Privacy capability UI** — currently shows PRIVACY_CAPABLE when strk20 method exists, but should also check for actual private balance via strk20Balances before allowing transfer
10. **Flip backend flag** — after live tx verified with proofVerified=true and txHash on Voyager, set PRIVACY_BACKEND="strk20" and isLive=true, remove DEMO label for real executions

**This milestone is complete as integration boundary** — real provider implemented with verified methods, policy → STRK20 path wired, wallet authorization handled, receipts non-sensitive, Demo Mode preserved and distinguished, build green. Real private transfer can be tested once live wallet environment available, without code changes to UI.

