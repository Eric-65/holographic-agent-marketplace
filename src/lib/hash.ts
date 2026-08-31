import type { Hex } from "./types";

/**
 * Deterministic, dependency-free digest used for demo hashes.
 *
 * PRODUCTION NOTE: replace with `poseidonHashMany` from starknet.js so that
 * digests match what PolicyCommitment.cairo / ExecutionAttestor.cairo compute
 * on-chain. Kept local for now so the mock layer has zero crypto surface.
 */
export function poseidonish(input: unknown): Hex {
  const s = canonical(input);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    a ^= s.charCodeAt(i);
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (Math.imul(b ^ a, 0x85ebca6b) >>> 0) ^ (b >>> 13);
  }
  const c = Math.imul(a ^ b, 0xc2b2ae35) >>> 0;
  const d = Math.imul(b ^ 0x27d4eb2f, 0x165667b1) >>> 0;
  return ("0x" +
    a.toString(16).padStart(8, "0") +
    b.toString(16).padStart(8, "0") +
    c.toString(16).padStart(8, "0") +
    d.toString(16).padStart(8, "0")) as Hex;
}

/** Stable key ordering so the same logical object always hashes identically. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(o[k]))
      .join(",") +
    "}"
  );
}

export const short = (h?: string, head = 6, tail = 4) =>
  !h ? "—" : h.length <= head + tail + 2 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;
