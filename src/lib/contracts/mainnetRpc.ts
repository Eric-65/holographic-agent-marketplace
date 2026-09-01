/**
 * Starknet MAINNET access — separate from the Sepolia deployment config in
 * `config.ts`. Nothing in this app talks to mainnet yet; this is the single
 * place that future STRK20-pool-touching code (mainnet pool
 * 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a) should
 * read the RPC URL from, so the key stays out of every other file and out of
 * git (see .env.example — copy it to .env.local and fill in a real Alchemy key).
 */

export const MAINNET_CHAIN_ID = "SN_MAIN";

export const STRK20_POOL_MAINNET_ADDRESS = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

export function getMainnetRpcUrl(): string | null {
  const url = import.meta.env.VITE_STARKNET_MAINNET_RPC_URL;
  if (!url || url.includes("YOUR_ALCHEMY_KEY_HERE")) return null;
  return url;
}

export function requireMainnetRpcUrl(): string {
  const url = getMainnetRpcUrl();
  if (!url) {
    throw new Error(
      "VITE_STARKNET_MAINNET_RPC_URL is not set. Copy .env.example to .env.local and fill in a free Alchemy key from https://www.alchemy.com.",
    );
  }
  return url;
}
