/**
 * Deterministic, float-free amount/asset parsing. This is NOT the AI — it's
 * the safety net every parsed amount goes through regardless of which
 * provider (mock or real) produced the natural-language text, because
 * "10 USDC" must resolve to exactly 10_000_000 minor units whether a
 * regex matched it or a model read it out of a sentence.
 */

// Matches the app's existing simplification (see TreasuryTransferForm.tsx,
// schedules.ts): every asset is treated as 6-decimal for minor-unit
// conversion. Not introducing a new precision model here — inheriting the
// one already used throughout the app.
const MINOR_UNIT_DECIMALS = 6;
const KNOWN_ASSETS = ["USDC", "STRK", "ETH"] as const;
type KnownAsset = (typeof KNOWN_ASSETS)[number];

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
};

export interface ParsedAmount {
  ok: true;
  amountMinor: number;
  asset: KnownAsset;
  displayAmount: string;
}
export interface AmbiguousAmount {
  ok: false;
  reason: string;
}

/** "25.5" (string, already digits+optional single decimal point) → integer minor units. No float multiplication. */
function decimalStringToMinorUnits(numStr: string, decimals: number): number | null {
  if (!/^\d+(\.\d+)?$/.test(numStr)) return null;
  const [whole, frac = ""] = numStr.split(".");
  if (frac.length > decimals) return null; // more precision than the asset supports — reject, don't silently truncate
  const paddedFrac = frac.padEnd(decimals, "0");
  const digits = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

function wordsToNumber(text: string): number | null {
  const words = text.toLowerCase().trim().split(/[\s-]+/);
  let total = 0;
  let matched = false;
  for (const w of words) {
    if (!(w in WORD_NUMBERS)) return null;
    matched = true;
    const v = WORD_NUMBERS[w];
    if (v === 100 || v === 1000) total = (total || 1) * v;
    else total += v;
  }
  return matched ? total : null;
}

function detectAsset(text: string): KnownAsset | null {
  const upper = text.toUpperCase();
  for (const a of KNOWN_ASSETS) {
    if (new RegExp(`\\b${a}\\b`).test(upper)) return a;
  }
  if (/\$|dollars?/i.test(text)) return "USDC"; // this app's existing convention: USD-denominated language maps to USDC
  return null;
}

/**
 * Parses free text like "10 USDC", "ten USDC", "$25", "25 dollars in USDC"
 * into a safe integer minor-unit amount. Returns an ambiguity reason
 * instead of guessing whenever the number or asset can't be determined
 * confidently — per spec, the caller must surface this as a clarification
 * request, never fall back to a default.
 */
export function parseAmount(text: string): ParsedAmount | AmbiguousAmount {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "No amount provided" };
  if (/-\s*\d/.test(trimmed)) {
    return { ok: false, reason: `"${text}" looks like a negative amount — amounts must be positive` };
  }
  if (/\b(infinity|infinite|nan|unlimited|all|everything)\b/i.test(trimmed)) {
    return { ok: false, reason: `"${text}" is not a specific, valid amount` };
  }

  const asset = detectAsset(trimmed);
  if (!asset) {
    return { ok: false, reason: `Could not determine which asset — expected one of ${KNOWN_ASSETS.join(", ")}` };
  }

  // Numeric form: "$25", "25", "25.5 USDC"
  const numericMatch = trimmed.replace(/[$,]/g, "").match(/\d+(\.\d+)?/);
  if (numericMatch) {
    const minor = decimalStringToMinorUnits(numericMatch[0], MINOR_UNIT_DECIMALS);
    if (minor === null || minor <= 0) {
      return { ok: false, reason: `"${numericMatch[0]}" is not a valid ${asset} amount` };
    }
    return { ok: true, amountMinor: minor, asset, displayAmount: `${numericMatch[0]} ${asset}` };
  }

  // Word form: "ten USDC"
  const wordsOnly = trimmed.replace(new RegExp(asset, "i"), "").replace(/dollars?|\$/gi, "").trim();
  const wordValue = wordsToNumber(wordsOnly);
  if (wordValue !== null && wordValue > 0) {
    const minor = decimalStringToMinorUnits(String(wordValue), MINOR_UNIT_DECIMALS);
    if (minor === null) return { ok: false, reason: `Could not convert "${text}" to a safe amount` };
    return { ok: true, amountMinor: minor, asset, displayAmount: `${wordValue} ${asset}` };
  }

  return { ok: false, reason: `Could not determine the amount from "${text}"` };
}
