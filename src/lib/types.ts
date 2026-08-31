/**
 * Holographic — core domain types.
 *
 * These types are the contract between the four planes of the system:
 *   agent plane → policy plane → execution plane → attestation plane
 *
 * Nothing in this file may ever carry private material (viewing keys, notes,
 * proof witnesses). Exact private amounts are permitted in-memory on the client
 * only; anything persisted uses `NotionalBucket`.
 */

export type Hex = `0x${string}`;

/* ------------------------------------------------------------------ assets */

export type AssetSymbol = "USDC" | "STRK" | "strkBTC" | "ETH";

export interface Asset {
  symbol: AssetSymbol;
  name: string;
  decimals: number;
  /** USD reference price, indicative only — never used for settlement. */
  priceUsd: number;
}

export type Venue = "AVNU" | "Ekubo" | "Vesu" | "Troves" | "STRK20 Pool";

/* ------------------------------------------------------------------ agents */

export type ActionKind =
  | "private_swap"
  | "private_transfer"
  | "shield"
  | "unshield"
  | "reshield"
  | "borrow"
  | "repay";

export type AgentCategory =
  | "Yield"
  | "Accumulation"
  | "Treasury"
  | "Risk"
  | "Payments"
  | "Credit";

export type AgentRuntimeState =
  | "active"
  | "idle"
  | "paused"
  | "quarantined"
  | "unbound";

export interface AgentMetrics {
  /** 0–100, derived from receipts, never self-reported. */
  trustScore: number;
  executions: number;
  /** Percentage of intents rejected by the policy engine. */
  rejectRate: number;
  /** Percentage of executed intents that reverted on-chain. */
  revertRate: number;
  /** p50 intent → receipt latency, milliseconds. */
  latencyP50Ms: number;
  /** Realised slippage vs. predicted, basis points. */
  slippageDriftBps: number;
}

export interface Agent {
  id: string;
  name: string;
  publisher: string;
  publisherAddress: Hex;
  category: AgentCategory;
  version: string;
  /** poseidon(manifest) — committed to AgentRegistry.cairo */
  manifestHash: Hex;
  summary: string;
  description: string;
  /** The complete set of action kinds this agent may ever propose. */
  actionSurface: ActionKind[];
  assets: AssetSymbol[];
  venues: Venue[];
  metrics: AgentMetrics;
  priceLabel: string;
  auditedBy?: string;
  stakeStrk: number;
  accent: string;
  runtime: AgentRuntimeState;
}

/* ---------------------------------------------------------------- policies */

export interface PolicyDocument {
  version: number;
  agentId: string;
  allowedActions: ActionKind[];
  assetScope: AssetSymbol[];
  venueAllowlist: Venue[];
  /** Ceiling for a single action, USD notional. */
  perActionCapUsd: number;
  /** Rolling 24h ceiling, USD notional. */
  dailyCapUsd: number;
  /** Minimum seconds between two executed actions. */
  cooldownSeconds: number;
  /** Maximum tolerated slippage, basis points. */
  maxSlippageBps: number;
  /** Above this notional the verdict becomes REQUIRE_USER_CONFIRMATION. 0 = off. */
  confirmAboveUsd: number;
  /** Recipients an agent may never pay. */
  counterpartyDenyList: string[];
  requireDisclosureReceipt: boolean;
  /** Hard stop for this binding. */
  killSwitch: boolean;
}

export interface PolicyRecord {
  id: string;
  agentId: string;
  label: string;
  doc: PolicyDocument;
  docHash: Hex;
  createdAt: number;
  /** Tx hash of the PolicyCommitment.cairo commit, when promoted on-chain. */
  onchainCommitTx?: Hex;
  status: "draft" | "active" | "superseded";
}

/* ----------------------------------------------------------------- intents */

export interface ActionIntent {
  id: string;
  agentId: string;
  kind: ActionKind;
  asset: AssetSymbol;
  venue: Venue;
  /** Client-side only. Never persisted; receipts store a bucket. */
  amountUsd: number;
  maxSlippageBps: number;
  counterparty?: string;
  deadline: number;
  rationale: string;
  nonce: number;
  createdAt: number;
}

/* ---------------------------------------------------------------- verdicts */

export type RuleId =
  | "R01" | "R02" | "R03" | "R04" | "R05" | "R06"
  | "R07" | "R08" | "R09" | "R10" | "R11" | "R12";

export type RuleOutcome = "pass" | "fail" | "confirm" | "skipped";

export interface RuleResult {
  id: RuleId;
  label: string;
  description: string;
  outcome: RuleOutcome;
  observed: string;
  bound: string;
}

export type VerdictOutcome = "APPROVE" | "REJECT" | "REQUIRE_USER_CONFIRMATION";

export interface PolicyVerdict {
  outcome: VerdictOutcome;
  failedRule?: RuleId;
  reason?: string;
  trace: RuleResult[];
  traceHash: Hex;
  policyHash: Hex;
  intentHash: Hex;
  engineVersion: string;
  evaluatedAt: number;
}

/** Rolling counters the engine reads. Injected — the engine performs no I/O. */
export interface BindingState {
  dailySpentUsd: number;
  lastActionAt: number;
  paused: boolean;
}

/* ---------------------------------------------------------------- receipts */

export type NotionalBucket =
  | "<1k" | "1k–5k" | "5k–10k" | "10k–25k" | "25k–100k" | ">100k";

export type ReceiptStatus =
  | "executed"
  | "blocked"
  | "awaiting_confirmation"
  | "reverted"
  | "pending";

export interface ExecutionReceiptData {
  id: string;
  agentId: string;
  agentName: string;
  kind: ActionKind;
  asset: AssetSymbol;
  venue: Venue;
  /** Coarse band. The exact amount is never stored server-side. */
  bucket: NotionalBucket;
  intentHash: Hex;
  policyHash: Hex;
  traceHash: Hex;
  txHash?: Hex;
  block?: number;
  proofVerified: boolean;
  attestationSig: Hex;
  status: ReceiptStatus;
  failedRule?: RuleId;
  createdAt: number;
  /** Milliseconds from intent emission to sealed receipt. */
  latencyMs?: number;
}

/* ---------------------------------------------------------------- treasury */

export interface TreasuryPosition {
  asset: AssetSymbol;
  /** Human-readable units. */
  publicBalance: number;
  shieldedBalance: number;
  /** Number of notes backing the shielded balance (wallet-reported). */
  noteCount: number;
  change24hPct: number;
  allocatedToAgents: number;
}

/* ------------------------------------------------------------------ wallet */

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletCapabilities {
  /** True when the connected wallet exposes the STRK20 Privacy Wallet API. */
  privacyApi: boolean;
  specVersion: string | null;
  shield: boolean;
  privateTransfer: boolean;
  privateSwap: boolean;
  multicall: boolean;
}

export interface WalletState {
  status: WalletStatus;
  address: Hex | null;
  chainId: string | null;
  walletName: string | null;
  capabilities: WalletCapabilities;
}
