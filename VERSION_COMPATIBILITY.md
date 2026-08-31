# Version Compatibility — Starknet.js vs STRK20 Wallet API

## Installed vs Required
| Package | Installed | Required per Push to Private blog | Delta |
|---------|-----------|-----------------------------------|-------|
| starknet | ^7.1.0 | v10.4.0 | **3 majors behind** |
| @starknet-io/get-starknet | not installed | required for wallet discovery | missing |
| @starkware-libs/starknet-privacy-sdk | not installed | optional (direct SDK path) | optional |

## Why upgrade required
Official builder guidance:
- Privacy Wallet API spec v0.10.3
- Application-layer route via starknet.js **v10.4.0**
- Ready extension + Xverse wallet as current start path
- Wallet exposes methods via WalletAccount.request({ type: "wallet_*" })

Installed v7 does NOT have:
- WalletAccount.request() typed for privacy methods
- wallet_supportedSpecs / wallet_supports discovery (v10 feature)
- Correct TypedData / SNIP-12 revisions used by privacy wallets
- RpcProvider vs SequencerProvider changes (v10 removed defaultProvider)

## Breaking changes v7 → v10
1. **Provider**
   - v7: `new RpcProvider({ sequencer: { network } })`
   - v10: `new RpcProvider({ nodeUrl })` + explicit chainId handling

2. **Account / WalletAccount**
   - v7: `Account` constructor (provider, address, signer)
   - v10: `WalletAccount.connect(provider, injectedWallet)` + `wallet.request()` for all wallet_* methods

3. **Constants**
   - v7: `constants.StarknetChainId.SN_SEPOLIA` exists
   - v10: moved, chainId is now bigint hex string, constants still present but typed differently

4. **TypedData / Signatures**
   - SNIP-12 revisions, `typedData` package split, breaking for any custom signing

5. **get-starknet**
   - v2 API removed, replaced by `starknetkit` / `get-starknet` v3 / `WalletAccount` discovery via `window.starknet`

## Files affected by upgrade
- src/lib/wallet/adapters/realAdapter.ts — must implement real WalletAccount flow
- src/lib/wallet/useWallet.ts — must handle injected discovery, not hardcoded address
- src/lib/privacy/strk20Provider.ts — must call wallet.request with verified method names
- src/lib/execution/privateTransfer.ts — must pass chainId as bigint, handle paymaster gasless
- vite.config.ts — starknet v10 uses wasm, may need to exclude from singlefile or add `optimizeDeps`

## Expected migration work (estimated 1-2 days)
1. `npm install starknet@10.4.0 @starknet-io/get-starknet@latest`
2. Replace Mock wallet adapter's hardcoded address with real discovery:
   ```ts
   import { connect } from "get-starknet"
   const { wallet } = await connect()
   const account = await WalletAccount.connect(provider, wallet)
   const chainId = await account.getChainId()
   ```
3. Probe capabilities:
   ```ts
   const specs = await account.request({ type: "wallet_supportedSpecs" })
   // specs = ["starknet", "privacy@0.10.3"] ?
   const supports = await account.request({ type: "wallet_supportsPrivacy" }) // hypothetical
   ```
   **DO NOT INVENT METHOD NAMES** — verify against Ready wallet docs before coding.

4. For private transfer, per blog, app asks wallet to shield/transfer/unshield/swap:
   ```ts
   // Placeholder — must be verified against wallet docs
   await account.request({
     type: "wallet_privateTransfer",
     params: { token, to, amount } // amount may be omitted — wallet selects notes
   })
   ```

5. Update chain label logic to handle bigint chainId

6. Test with Ready X extension on Sepolia (needs devnet with privacy pool deployed or testnet)

7. After live test, set `PRIVACY_BACKEND="strk20"` and `Strk20WalletApiProvider.isLive=true`

## Risk if not upgraded
- Cannot test real transaction
- Mock remains only safe path per TASK 8 requirement ("Do not perform a real private transaction until compatibility confirmed")
- No viewing key isolation guarantee can be tested without real wallet

## Recommendation
- Keep mock as default (current)
- Prepare real adapter scaffold (done)
- Upgrade starknet.js to 10.4.0 in a separate PR with wallet extension E2E test on Sepolia
- Do not upgrade automatically in this PR — per TASK 2 instruction
