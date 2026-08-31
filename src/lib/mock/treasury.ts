import type { Asset, AssetSymbol, TreasuryPosition } from "../types";

export const ASSETS: Record<AssetSymbol, Asset> = {
  USDC: { symbol: "USDC", name: "USD Coin", decimals: 6, priceUsd: 1 },
  STRK: { symbol: "STRK", name: "Starknet Token", decimals: 18, priceUsd: 0.42 },
  strkBTC: { symbol: "strkBTC", name: "Starknet Bitcoin", decimals: 8, priceUsd: 91400 },
  ETH: { symbol: "ETH", name: "Ether", decimals: 18, priceUsd: 3120 },
};

export const MOCK_POSITIONS: TreasuryPosition[] = [
  { asset: "USDC", publicBalance: 42_180, shieldedBalance: 318_400, noteCount: 27, change24hPct: 0.4, allocatedToAgents: 210_000 },
  { asset: "strkBTC", publicBalance: 0.184, shieldedBalance: 2.416, noteCount: 9, change24hPct: 2.7, allocatedToAgents: 1.2 },
  { asset: "ETH", publicBalance: 3.42, shieldedBalance: 18.9, noteCount: 14, change24hPct: -1.2, allocatedToAgents: 8.0 },
  { asset: "STRK", publicBalance: 84_000, shieldedBalance: 126_500, noteCount: 11, change24hPct: 3.9, allocatedToAgents: 40_000 },
];

export const usdValue = (asset: AssetSymbol, units: number) =>
  units * ASSETS[asset].priceUsd;

export const totals = (positions: TreasuryPosition[]) => {
  let shielded = 0;
  let pub = 0;
  let allocated = 0;
  let notes = 0;
  for (const p of positions) {
    shielded += usdValue(p.asset, p.shieldedBalance);
    pub += usdValue(p.asset, p.publicBalance);
    allocated += usdValue(p.asset, p.allocatedToAgents);
    notes += p.noteCount;
  }
  return { shielded, public: pub, allocated, notes, total: shielded + pub };
};
