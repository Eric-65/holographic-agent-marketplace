# Debug Report — Connect Wallet Click / Visibility Fix

## Root cause of click/visibility issue

**Primary:** WalletConnect chooser was rendered as an absolutely positioned dropdown **inside** a topbar that had:

- `header` with `overflow-hidden`
- inner container with `overflow-x-auto overscroll-x-contain scrollbar-thin`

In CSS, any element with `overflow` other than `visible` creates a new block formatting context that **clips absolutely positioned descendants**. The chooser `<div className="absolute right-0 mt-2 w-[300px] ... z-50">` was inside that `overflow-x-auto` div, so when `chooserOpen` became true, it was clipped by the header's `overflow-hidden` and the inner scroll container. On mobile, this made it appear as if the Connect button did nothing — the dropdown was rendered but invisible outside the header bounds. Additionally, the header's `overflow-hidden` prevented the dropdown from escaping.

**Secondary factors checked:**
- `.app-bg` was already `pointer-events: none` — not the cause
- Button disabled only when `wallet.status === "connecting"` — initial state is `disconnected`, so not disabled
- No overlay with pointer-events above button, except a fade gradient that already had `pointer-events-none`
- `chooserOpen` toggle logic was correct (`setChooserOpen(o => !o)`)
- Desktop Wallet and Demo Mode handlers correctly wired to `onConnectReady` / `onConnectMock`

**Fix applied:** Restructured header DOM per preferred structure:

```
Header (overflow-visible, z-30)
 ├─ left logo (shrink-0)
 ├─ breadcrumb (shrink-0, hidden lg:flex)
 ├─ scrollable utility/status area (flex-1 min-w-0 overflow-x-auto) — ONLY PrivacyStatus + theme toggle
 └─ separate non-scrolling WalletConnect container (shrink-0 relative overflow-visible z-20)
      └─ WalletConnect (relative, chooser absolute right-0)
```

- Changed header from `overflow-hidden` to `overflow-visible`
- Moved WalletConnect **outside** the horizontal scroll container into its own `relative overflow-visible z-20` container
- Kept scrollable area for PrivacyStatus only, preserving the small horizontal scroll for status chips on mobile
- No excessive z-index — uses existing z-30 header, z-20 wallet container, z-50 dropdown (same as before but now not clipped)

## Exact files changed

1. **src/app/layout.tsx** — header restructured, overflow-hidden → overflow-visible, separated scrollable status area from WalletConnect container, added overflow-visible and z-20 to wallet container, removed nested overflow-x-auto that contained wallet

2. **src/lib/store.tsx** — STORE CLEANUP: simplified wrappers from:
   ```ts
   connectReady: async () => { void (await connectReady()); }
   ```
   to:
   ```ts
   connectReady: () => connectReady()
   ```
   Same for connect, connectReal, connectWalletConnect, connectMock. Now promises/errors propagate correctly instead of being swallowed by void. Updated Store interface to return `Promise<WalletState>` instead of `Promise<void>`.

3. **src/components/WalletConnect.tsx** — updated Props to accept `Promise<unknown>` returns, kept chooser logic, verified Desktop Wallet calls onConnectReady and Demo Mode calls onConnectMock

4. **src/lib/wallet/adapters/readyAdapter.ts** — NETWORK CONSISTENCY fix: chain ID now normalized via helper that handles bigint, number, "0x..." hex, "SN_SEPOLIA"/"SN_MAIN" strings, decimal strings. Tries wallet-reported chainId first via account.getChainId() and wallet.request({type: wallet_requestChainId, starknet_chainId}), then provider as fallback, preventing false Sepolia display when wallet is on mainnet. RPC remains Sepolia `https://starknet-sepolia.public.blastapi.io/rpc/v0_8` per task.

5. **src/lib/wallet/adapters/walletConnectAdapter.ts** — same network consistency fix applied

6. **src/lib/wallet/adapters/types.ts** — extended WalletAdapter interface with isConnected(), getAddress(), getProvider(), getRealAccount(), getInternalState() per TASK 2

7. **src/lib/wallet/adapters/mockAdapter.ts** — implemented new interface methods

8. **src/lib/wallet/adapters/readyAdapter.ts** — already implements new interface

9. **src/lib/wallet/adapters/index.ts** — factory expanded to support "ready" and "walletconnect" kinds, plus legacy "real"

10. **src/lib/wallet/useWallet.ts** — already implements real connection flow, diagnostics with block number, network detection, error handling for not installed / user rejected / wrong network

11. **src/components/PrivacyStatus.tsx** — updated to accept diagnostic prop, shows states DISCONNECTED/CONNECTING/CONNECTED/NETWORK_VERIFIED/PRIVACY_CAPABLE/ERROR/DEMO_MODE

12. **src/components/DiagnosticPanel.tsx** — rewritten to show exact fields required: Connection, Adapter, Wallet, Chain, Network, RPC (provider available/unavailable), Block, Mode, Error — always visible for debug verification

13. **src/app/page.tsx** — added DiagnosticPanel with adapter prop

## Whether real Ready connection opens

**Implementation verified:**
- `ReadyWalletAdapter.connect()` uses `@starknet-io/get-starknet-core` `getAvailableWallets()` to find injected Ready wallet (id includes "ready"), fallback to `window.starknet_ready` / `window.starknet`
- Creates `RpcProvider` with Sepolia RPC URL
- Calls `WalletAccountV6.connect(provider, walletObj)` which internally triggers `wallet_requestAccounts` → user approval modal in Ready extension
- If Ready not installed, throws `WalletNotAvailableError("No desktop wallet detected. Install Ready...")` with ERROR state, no crash
- If user rejects, catches "user rejected" / code 4001, sets ERROR state

**In sandbox without extension:** Connection attempt will throw "No desktop wallet detected" and show ERROR badge — expected, not a bug. With Ready extension installed in live browser, approval modal should open. Code path is correct per starknet.js v10.4.0 WalletAccountV6 API (verified in node_modules/starknet/dist/index.d.ts lines 6106-6117).

**Not claimed as working until verified in real browser** — per instruction, we do not claim wallet connection works unless actual interaction verified. In this environment, we can only verify code path and build, not live extension interaction.

## Whether address and chain ID are detected

**Address:**
- After approval, `account.address` read as Hex, stored in `_address`, returned in WalletState, displayed in top bar chip (short 6,4), full in dropdown with copy button
- DiagnosticPanel shows Wallet address via `short(wallet.address, 12, 8)`

**Chain ID:**
- Normalized via helper handling bigint, "0x..." hex, "SN_SEPOLIA" → "0x534e5f5345504f4c4941", "SN_MAIN" → "0x534e5f5f4d41494e"
- Authoritative from wallet first (account.getChainId() / wallet.request wallet_requestChainId), provider fallback
- Prevents false Sepolia display — if wallet reports mainnet, chainId will be mainnet hex, not overwritten by Sepolia RPC
- Displayed in WalletConnect dropdown (Chain ID short), PrivacyStatus, DiagnosticPanel (Chain field)

**Network:**
- Derived from chainId: includes "sepolia" → Sepolia, "main" → Mainnet, else raw chainId
- Displayed in diagnostic.network, WalletConnect grid, PrivacyStatus

**RPC:**
- `RpcProvider` with Sepolia URL `https://starknet-sepolia.public.blastapi.io/rpc/v0_8`
- `getProvider()` returns provider, `getBlockNumber()` called for read-only verification
- DiagnosticPanel shows "provider available" if provider exists, "unavailable" otherwise
- Read-only test per TASK 5: chain ID + block info, no transaction sent

## Remaining wallet integration problems

1. **starknet.js v10.4.0 requires Node >=22** — current sandbox Node v20.20.2 shows EBADENGINE warning but browser build works. Production CI should use Node 22+.

2. **get-starknet UI uses eval** — build warnings about eval in core.js and ui.js, expected from wallet discovery lib, not blocking but may trigger CSP issues if strict CSP.

3. **WalletConnect mobile adapter still relies on get-starknet discovery** — real WalletConnect QR flow via Argent Mobile may need StarknetKit which is incompatible with starknet v10 (peer ^8.0.0). Current implementation uses same get-starknet enable() which should trigger QR for mobile wallets that support WalletConnect, but not fully tested with real mobile wallet. May need @starknet-io/get-starknet v4+ or custom WC transport after verification.

4. **Provider RPC is hardcoded Sepolia** — if user is on mainnet, provider is still Sepolia, so block number read will be Sepolia block, not mainnet block. Could create provider per chainId dynamically (have both Sepolia and Mainnet RPC URLs and switch). Currently we report wallet chainId correctly, but block number may be from wrong network if wallet is mainnet. Fix: create provider URL based on wallet chainId after detection, or use wallet's provider for block reads.

5. **No auto-reconnect for real wallet on page reload after approval** — useEffect tries to reconnect if localStorage holographic:wallet=1 and preferred adapter is real/ready/walletconnect, but real adapter's connect() will trigger permission request again (may need silent mode). Could use `connect({ modalMode: "neverAsk" })` or `getLastConnectedWallet()` for silent reconnect.

6. **Privacy capability detection still heuristic** — checks for `strk20Balances` method existence and `wallet_supportedSpecs` containing 0.10, but actual STRK20 privacy methods may be exposed via different namespace. Per TASK 6, we do not invent methods, so we keep isLive=false and show DEMO MODE until verified.

7. **No wrong network enforcement yet** — we detect wrong network but do not block execution or show prominent warning beyond ERROR state. Could add UI banner if chainId !== expected Sepolia.

## Acceptance tests performed (simulated, no real extension in sandbox)

1. Clear localStorage → reload → state DISCONNECTED — verified via initial state disconnected
2. Confirm state is DISCONNECTED — diagnostic.connectionStatus DISCONNECTED, badge neutral
3. Confirm Connect Wallet button is enabled — disabled only when status connecting, initial disconnected so enabled, pointer-events not blocked by app-bg (pointer-events:none) or fade (pointer-events-none)
4. Click Connect Wallet → chooserOpen false→true — onClick toggles, dropdown absolute right-0 w-[300px] now outside overflow-hidden, should be visible with z-50
5. Chooser visibly opens — now not clipped, overflow-visible header + relative container
6. Click Desktop Wallet → calls onConnectReady() — button onClick calls onConnectReady if exists
7. Wallet connection attempt begins — connect() sets status connecting, then tries getAvailableWallets → WalletAccountV6.connect
8. Ready extension approval should open if installed — WalletAccountV6.connect triggers wallet_requestAccounts
9. Approve connection → address appears — address stored, displayed in chip
10. Network is Starknet Sepolia — chainId normalized, network Sepolia, block number from provider.getBlockNumber()
11. Dropdown can reopen — open state toggle
12. Disconnect returns to DISCONNECTED — adapter.disconnect clears localStorage, state disconnected
13. Demo Mode separately — connectMock works, shows DEMO_MODE badge, MOCK offline chip

Additional:
- no Ready extension → throws WalletNotAvailableError, shows ERROR badge with message, no crash
- user rejects → catches, ERROR state "User rejected"
- wrong network → WrongNetworkError, diagnostic ERROR
- reload after connection → useEffect auto-connect based on localStorage

Build: `npm run build` → success, 1965 modules, 959kB (280kB gzip)

No STRK20 transactions implemented — per instruction.

