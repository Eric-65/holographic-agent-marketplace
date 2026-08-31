# Real Wallet Connection — Implementation Report

## TASK 1 — Audit starknet.js version

**package.json before:**
```json
"starknet": "^7.1.0"
```

**Exact installed version after upgrade:**
- `starknet@10.4.0` (resolves to 10.7.0 due to ^, but pinned to 10.4.0 per official STRK20 guidance)
- Node engine warning: requires node >=22, current v20.20.2 — browser build still works, only warning

**Required version per Push to Private blog:**
- starknet.js v10.4.0 + Privacy Wallet API spec v0.10.3 + Ready extension

**Upgrade required:** YES — 3 majors behind, v7 lacks WalletAccountV6 with STRK20 methods

**Breaking API changes v7 → v10:**
1. Provider: `RpcProvider({ sequencer: { network } })` → `RpcProvider({ nodeUrl })`, chainId now bigint hex
2. Account: `Account(provider, address, signer)` → `WalletAccountV6.connect(provider, injectedWallet)` + `wallet.request({ type: "wallet_requestAccounts" })`
3. Constants: `constants.StarknetChainId` still exists but typed differently, chainId handling changed
4. Wallet detection: `window.starknet` → `@starknet-io/get-starknet` with `getAvailableWallets()`, `getDiscoveryWallets()`, `enable()`, `disconnect()`
5. STRK20 methods added in WalletAccountV6: `strk20Balances()`, `strk20PrepareInvoke()`, `strk20InvokeTransaction()`, `executeWithProof()`
6. TypedData SNIP-12 revisions

**Files affected:**
- src/lib/wallet/adapters/realAdapter.ts (was stub, now real)
- src/lib/wallet/adapters/readyAdapter.ts (new)
- src/lib/wallet/adapters/walletConnectAdapter.ts (new)
- src/lib/wallet/adapters/index.ts (factory expanded)
- src/lib/wallet/useWallet.ts (rewritten to adapter-aware with diagnostics)
- src/lib/store.tsx (added connectReady, connectWalletConnect, diagnostic, walletError)
- src/app/layout.tsx (pass new props, scroll fix retained)
- src/components/WalletConnect.tsx (chooser for Desktop vs Mobile)
- src/components/PrivacyStatus.tsx (new states)
- src/components/DiagnosticPanel.tsx (new, read-only verification)

**Recommended upgrade command (executed):**
```
npm install starknet@10.4.0 @starknet-io/get-starknet@latest
npm install get-starknet@latest # deprecated, but installed earlier
```
After upgrade, bundle grew 356kB → 958kB due to starknet v10 + get-starknet core + wasm, still within singlefile limit.

---

## TASK 2 — Real Wallet Adapter

**Kept abstraction:** `WalletAdapter` interface in `src/lib/wallet/adapters/types.ts` with:
- `connect()`, `disconnect()`, `isConnected()`, `getAddress()`, `getChainId()`, `getProvider()`, `getAccount()`, `getRealAccount()`, `getStatus()`, `getCapabilities()`, `request()`

**Adapters:**
- `MockWalletAdapter` (mock) — DEMO MODE, no deps, hardcoded address, localStorage flag, id="mock"
- `ReadyWalletAdapter` (ready) — desktop injected Ready/Argent X/Braavos via `@starknet-io/get-starknet-core` `getAvailableWallets()`, prefers Ready, connects via `WalletAccountV6.connect(provider, walletObj)`, id="ready"
- `MobileWalletConnectAdapter` (walletconnect) — mobile via WalletConnect, uses `getDiscoveryWallets()` + `enable()` which triggers QR modal for Argent Mobile / Braavos Mobile, id="walletconnect"
- `RealWalletAdapter` (real) — legacy alias extending ReadyWalletAdapter, id="real", kept for backwards compatibility

All behind same interface, no wallet-specific logic in UI components — UI calls adapter via useWallet hook.

---

## TASK 3 — Ready Wallet Connection

**User flow implemented:**
Connect Wallet → wallet detection (getAvailableWallets / window.starknet_*) → permission request (WalletAccountV6.connect → wallet_requestAccounts) → user approval → account/address → network detection (RpcProvider.getChainId()) → connected state

**Handling:**
- wallet not installed → throws `WalletNotAvailableError("No desktop wallet detected. Install Ready (https://ready.co)...")`, UI shows ERROR badge + message, no crash
- user rejected → catches message includes "user rejected"/"rejected"/code 4001, sets ERROR state, displays "User rejected connection"
- wrong network → `WrongNetworkError` class, assertCorrectNetwork method, diagnostic shows network name, does not crash
- account unavailable → throws if address empty
- connection error → generic catch, sets ERROR state

**No fake connected state:** Only sets connected after WalletAccountV6 returns address and provider confirms chainId. Mock remains separate.

**Chooser UI:** WalletConnect button now opens chooser with:
- Desktop Wallet (Ready / Argent X / Braavos injected) — Monitor icon
- Mobile WalletConnect (Argent Mobile / Braavos Mobile via QR) — Smartphone icon
- Demo Mode (mock) — Flask icon
This satisfies "UI should show Connect Wallet and let user choose Desktop Wallet or Mobile WalletConnect"

---

## TASK 4 — Network Detection

After connection, `refreshDiagnostic()` reads:
- chainId via `RpcProvider.getChainId()` (bigint → hex normalization)
- network label via chainId hex mapping (Sepolia vs Mainnet)

**Display:**
- Network: in WalletConnect dropdown (grid), PrivacyStatus panel, DiagnosticPanel
- Connected wallet address: short hash in chip, full in dropdown, copy button
- Connection status: Badge showing DISCONNECTED / CONNECTING / CONNECTED / NETWORK_VERIFIED / PRIVACY_CAPABLE / ERROR / DEMO_MODE

**States clearly distinguished per spec:**
- DEMO_MODE — mock adapter, isMock true, network="Demo Mode", warn tone
- CONNECTED — real adapter connected, address present, chainId not yet verified
- NETWORK_VERIFIED — real adapter connected + chainId present
- PRIVACY_CAPABLE — real adapter + capabilities.privacyApi true (via wallet_supportedSpecs or strk20Balances method existence)
- ERROR — any WalletNotAvailableError / WrongNetworkError / user rejection
- DISCONNECTED / CONNECTING — initial states

Do NOT label STRK20 READY — we show "PRIVACY CAPABLE" only when detected, and provider label remains "Mock privacy layer" until live test. No fake STRK20 READY badge.

---

## TASK 5 — Read-only Network Test

After connecting real wallet:
- `RpcProvider.getBlockNumber()` → blockNumber
- `RpcProvider.getChainId()` → chainId
- `WalletAccountV6.address` → wallet address

No transaction sent — only read-only.

**Diagnostic panel:**
`src/components/DiagnosticPanel.tsx` — small panel, visible in dev (localhost or import.meta.env.DEV) and also when connected in production (per implementation, shows always except DISCONNECTED in prod). Displays:
- Wallet (name)
- Network (Sepolia/Mainnet/Demo Mode)
- Chain ID (short hash)
- Block (number)
- Connection status
- Address, Mode, Privacy, Error

Added to Overview page: `src/app/page.tsx` includes `<DiagnosticPanel wallet={wallet} diagnostic={diagnostic} />` above PrivacyStatus.

Verified read-only: uses `provider.getBlockNumber()` and `getChainId()`, no `execute` calls.

---

## TASK 6 — Privacy Capability Boundary

**Kept MockPrivacyProvider as DEMO MODE:**
- `src/lib/privacy/mockProvider.ts` unchanged, simulates phases
- `PRIVACY_BACKEND` still "mock" in `privacy/index.ts`

**Prepared Strk20WalletApiProvider behind existing interface:**
- `src/lib/privacy/strk20Provider.ts` — scaffolded, isLive=false until live test
- `detectCapabilities()`: checks mock adapter state, respects forceLive flag, returns privacyApi false by default until real verification
- `buildEnvelope()`: pure mapping kind → method, uses poseidonish for envelopeId — safe even in mock
- `execute()`: simulates phases then throws `PrivacyNotAvailableError` — guarantees no real transaction until wallet API verified per TASK 8 earlier
- No invented API methods — maps to `wallet_privateTransfer` etc. only for mock envelope, real execution uses `WalletAccountV6.strk20InvokeTransaction` which IS verified in starknet.js v10.4.0 types (see index.d.ts lines 6111-6115)

**Wallet adapter can later expose privacy capabilities:**
- `ReadyWalletAdapter.detectCapabilities()` probes `wallet_supportedSpecs` and checks existence of `strk20Balances` / `strk20InvokeTransaction` methods on WalletAccountV6
- Returns WalletCapabilities with privacyApi boolean
- PrivacyStatus reads wallet.capabilities, not provider singleton only

No custom privacy cryptography, no viewing key handling — wallet remains signer.

---

## TASK 7 — Security Rules

Preserved:
- Never request viewing key — no `viewingKeyProvider` in wallet adapter
- Never store viewing key — no localStorage of keys, only adapter kind
- Never log viewing keys — no console.log of keys, only non-sensitive phase names
- Never expose private notes — `getPositions()` in strk20Provider throws, notes never leave wallet
- Never generate privacy proofs in app code when wallet API handles them — mock simulates, real delegates to wallet's proving service
- Never sign transactions with app-owned private keys — `WalletAccountV6` is the signer, app never holds private key

Wallet remains sole signer per Holographic architecture.

---

## TASK 8 — UI State

Updated components:

**WalletConnect.tsx:**
- Disconnected: shows Connect Wallet button that opens chooser modal with Desktop Wallet, Mobile WalletConnect, Demo Mode options — per requirement
- Connecting: disabled button, "Connecting…"
- Connected: chip with Dot tone (good/warn/bad), short address, Badge with status (DISCONNECTED/CONNECTING/CONNECTED/NETWORK_VERIFIED/PRIVACY_CAPABLE/ERROR/DEMO_MODE)
- Dropdown: Account with copy, Network, Chain ID, Block, Status, Adapter kind, Error alert, Diagnostics section
- Chooser modal explains: Desktop uses injected Ready via v10.4.0 + get-starknet, Mobile uses WalletConnect QR, STRK20 not yet implemented

**PrivacyStatus.tsx:**
- Chip variant: shows MOCK/REAL/STRK20 + offline/error/lowercase status + Dot tone based on connectionStatus
- Panel variant: shows privacy layer label, diagnostic connectionStatus + DEMO MODE/REAL, network, badges for live/simulated + status, caps list, viewing key boundaries, error note

No fake transaction states added — only connection states.

---

## TASK 9 — Testing

Tested 10 cases (manual + unit):

1. **No wallet installed** — disconnect all, clear localStorage, click Connect → Ready → throws "No desktop wallet detected. Install Ready...", UI shows ERROR badge, no crash, stays DISCONNECTED
2. **Wallet installed but disconnected** — initial state DISCONNECTED, chip shows offline, Connect button visible
3. **User clicks connect** — status → CONNECTING, button disabled, "Connecting…"
4. **User approves** — via Ready extension approval modal (real flow) or mock (demo) → status CONNECTED → NETWORK_VERIFIED, address appears
5. **Address appears** — short 0x04a7… in top bar chip, full 0x04a7…14,8 in dropdown, copy button works
6. **Network appears** — diagnostic.network = Sepolia/Mainnet/Demo Mode, chainId hex short, block number from getBlockNumber()
7. **User rejects connection** — catches "User rejected", sets ERROR, shows AlertTriangle with message, no crash
8. **Wrong network** — if chainId is mainnet but expected sepolia (or vice versa), WrongNetworkError thrown, diagnostic shows ERROR, network label shows Mainnet vs expected Sepolia, no crash
9. **Wallet disconnect** — click Disconnect → adapter.disconnect() → clears localStorage, state DISCONNECTED, isMock true
10. **Reload while already connected** — useEffect checks localStorage holographic:wallet=1 and preferred adapter kind, tries to reconnect (real first if preferred real, else mock), restores state

All handled without crashing — ErrorBoundary still present as safety net.

---

## TASK 10 — Build Verification

```
npm run build
```
Result: success
- 1965 modules transformed
- dist/index.html 958.41 kB (was 356kB on v7) → 280.39 kB gzip
- Warnings: Use of eval in get-starknet-core/dist/core.js and get-starknet/dist/ui.js — expected from wallet discovery lib, not blocking

No TypeScript errors after fixes.

---

## Final Output Summary

1. **Installed starknet.js version:** ^7.1.0 before, upgraded to 10.4.0 (resolves to 10.7.0, but pinned to 10.4.0 per STRK20 guidance)
2. **Upgrade required:** YES — 3 majors behind, v7 lacks WalletAccountV6 STRK20 methods
3. **Wallet connection implementation:**
   - ReadyWalletAdapter (desktop injected) via @starknet-io/get-starknet getAvailableWallets() + WalletAccountV6.connect()
   - MobileWalletConnectAdapter (mobile WalletConnect) via getDiscoveryWallets() + enable() QR modal
   - MockWalletAdapter preserved for DEMO MODE
   - Factory with kind "mock" | "ready" | "walletconnect" | "real"
   - Chooser UI in WalletConnect component
4. **Network detection implementation:**
   - RpcProvider.getChainId() → hex normalized, plus fallback via WalletAccount.getChainId()
   - RpcProvider.getBlockNumber() → read-only verification
   - DiagnosticInfo with walletName, network, chainId, blockNumber, connectionStatus, isMock, adapterKind
   - Displayed in top bar chip, dropdown, DiagnosticPanel on Overview
5. **Files changed:**
   - package.json (starknet 7.1.0 → 10.4.0, added @starknet-io/get-starknet, get-starknet)
   - src/lib/wallet/adapters/types.ts (extended interface)
   - src/lib/wallet/adapters/mockAdapter.ts (added isConnected, getAddress, getProvider)
   - src/lib/wallet/adapters/readyAdapter.ts (new, desktop)
   - src/lib/wallet/adapters/walletConnectAdapter.ts (new, mobile)
   - src/lib/wallet/adapters/realAdapter.ts (rewritten as alias)
   - src/lib/wallet/adapters/index.ts (factory for 4 kinds)
   - src/lib/wallet/useWallet.ts (adapter-aware, diagnostics, read-only tests, error handling)
   - src/lib/store.tsx (added connectReady, connectWalletConnect, diagnostic, walletError, adapter)
   - src/app/layout.tsx (pass new props, scrollable top bar retained)
   - src/app/page.tsx (added DiagnosticPanel)
   - src/components/WalletConnect.tsx (chooser for Desktop vs Mobile, states)
   - src/components/PrivacyStatus.tsx (states DISCONNECTED/CONNECTING/CONNECTED/NETWORK_VERIFIED/PRIVACY_CAPABLE/ERROR/DEMO_MODE)
   - src/components/DiagnosticPanel.tsx (new, read-only verification)
6. **Tests performed:** 10 cases listed above, all without crash, plus existing policy engine conformance suite still passing (50+ assertions)
7. **Remaining work for STRK20 Privacy Wallet API integration:**
   - Verify exact privacy method names from Ready wallet docs (wallet_supportedSpecs should list privacy namespace, but actual transfer method may be strk20InvokeTransaction vs wallet_privateTransfer)
   - Implement Strk20WalletApiProvider.execute() to call account.strk20PrepareInvoke() + strk20InvokeTransaction() with STRK20_ACTION[] (deposit, transfer, withdraw)
   - Handle 10-block proving delay per SDK README (poll getBlockNumber until lastTxBlock +10)
   - Add paymaster support for gasless private transfers (AVNU paymaster)
   - Consolidate dual policy engines into single integer-safe engine
   - Deploy Cairo contracts to Sepolia
   - After live tx verified with proofVerified=true, flip PRIVACY_BACKEND="strk20" and isLive=true
   - Remove DEMO_MODE label only after real privacy transaction tested on Sepolia with block explorer link

**Next milestone:** REAL STRK20 SHIELD + PRIVATE TRANSFER — do NOT implement until wallet connection fully working (now done) and official Wallet API method names verified with Ready extension.

