# Holographic Motion System — Milestone Report

A unified Framer Motion system built on top of the existing `framer-motion` dependency (already in `package.json`, previously unused anywhere in the codebase). The goal throughout: motion that communicates control → decision → execution → verification, never decoration for its own sake, and never a stand-in for real state.

## 1. Prior-milestone audit result

Before touching anything, the codebase was audited against a checklist of systems (organization model, RBAC, vendor management, invoice workflow, reconciliation, accounting export, and others) that the incoming spec assumed were already complete. They were not — verified directly against source, not from memory:

- **Not implemented at all**: organization model, RBAC, invoice workflow, reconciliation, accounting export.
- **Partially implemented**: vendor management (an approved-recipient allowlist stands in for a real vendor entity), Payment Agent (exists as a marketplace listing; most logic runs through the shared Treasury pipeline), mobile UX (targeted fixes only, never exhaustively verified).
- **Fully implemented and verified this session**: Treasury Agent, policy engine, budget engine (including multi-budget), wallet authorization, STRK20 execution, execution receipts, attestation, verification, notifications, security controls (automation pause, emergency triggers, new-recipient review), tests (100/103, re-run headlessly), build.

This milestone did not attempt to build the missing systems — only to audit and report them, per the spec's own instruction, then proceed with the actual animation objective on top of what exists.

## 2. Motion architecture

- `src/lib/motion/tokens.ts` — the single source for every duration, easing curve, and spring config used anywhere (`fast`/`normal`/`slow`/`ambient`, plus named spring presets for values/parallax/gentle entrances). Nothing hardcodes a duration outside this file.
- `src/lib/motion/variants.ts` — the shared variant library (`fadeUp`, `pageReveal`, `scaleReveal`, `modalBackdrop`/`modalPanel`, `cardHover`, `toastVariants`, `drawer`, `tabContent`, `traceRow`/`traceContainer`), each with a reduced-motion counterpart where movement matters.
- `src/lib/motion/transitions.ts` — standalone `transition={...}` presets for motion elements not using a full variant.
- `src/lib/motion/useReducedMotion.ts` — thin wrapper over Framer Motion's own reactive `useReducedMotion`, imported by every primitive so reduced-motion policy lives in one place.

## 3. Components created

`src/components/motion/`: `MotionReveal` (+ `MotionRevealGroup`), `MotionCard` (hover elevation + optional glass-reflection sheen), `MotionModal` (shared backdrop+panel shell for every dialog), `MotionCountUp`, `MotionScoreRing`, `MotionParallax`, `MotionStatus` (the 11-state pipeline indicator: IDLE/THINKING/PROPOSING/CHECKING/APPROVED/AWAITING_APPROVAL/EXECUTING/COMPLETED/BLOCKED/FAILED/PAUSED), `MotionOrb`, `MotionPresence` (+ `PresenceItem`), `MotionSkeleton`.

**`MotionOrb` note**: the spec says "enhance the existing Holographic Agent Orb" — there was no such component anywhere in the codebase (verified by search). This is a new component built to the spec, not an enhancement of prior work; flagged here rather than silently presented as a pre-existing feature.

## 4. Page animations

Overview and Treasury pages: `MotionRevealGroup`/`MotionReveal` on every stat grid and major section (mount reveal for above-the-fold content, `whileInView` for content further down), plus a light pointer-parallax decorative glow on the Overview header (`MotionParallax`, disabled on touch/reduced-motion, max 10px travel). Agent marketplace cards use `whileInView` scale-reveal so a long grid doesn't animate all at once.

## 5. Agent animations

`AgentCard` now uses `MotionCard` for hover elevation (`y: -4`, `scale: 1.01`, transform-only) plus an opt-in glass-reflection sheen. `MotionStatus`/`MotionOrb` drive the 11-state pipeline indicator used in `ApprovalDialog`, `ExecutionRequestCard`, the Verification page, and the Workflows page — continuous states (THINKING/CHECKING/AWAITING_APPROVAL/EXECUTING) loop gently; terminal states (APPROVED/COMPLETED/BLOCKED/FAILED) play once and rest.

## 6. Policy animations

`ApprovalDialog`'s deterministic rule trace now reveals row-by-row via `staggerChildren` (`traceContainer`/`traceRow`, remounted per new `intent.id` so every fresh proposal gets its own reveal). The verdict is computed synchronously *before* any animation starts — the reveal is a presentation of an already-final decision, never a delay gating the actual `evaluatePolicy` call or the Execute button's availability.

## 7. Wallet animations

`WalletConnect`'s existing connected/connecting/error/wrong-network states already carried a CSS pulse (`Dot` + `pulse-dot`); every button across the app (including the wallet connect/disconnect buttons) now gets `whileHover`/`whileTap` feedback for free via the shared `Button` primitive. This is the one area I'd call the least transformed by this milestone — see §17.

## 8. STRK20 animations

`ApprovalDialog`'s execution-phase list (`envelope_built → wallet_request_sent → wallet_proving → proof_submitted → proof_verified → receipt_sealed`) now animates each icon's completion (brief scale pop) and shows a pulsing ring on the currently-active phase — driven entirely by the real `phase` state set inside `provider.execute`'s callback. Nothing here uses a timer; "Completed" never renders before the real result does.

## 9. Count-up implementation

`MotionCountUp` (`useMotionValue` + `useSpring` + `.on("change")`) applied to: Overview's shielded/public value and active-agent count, Treasury's total value/shielded/active-agents/pending-approvals/active-schedules/active-workflows/recent-executions, and the treasury-split shielded percentage. Accepts a `format` function so currency values animate through the same `usd()` formatter used everywhere else — no new number formatting logic, no floating-point money math introduced (the animation interpolates already-computed totals for display only; the underlying values are untouched).

## 10. Score-ring implementation

`MotionScoreRing` (`useMotionValue` + `useSpring` + `useTransform` on `strokeDashoffset`) applied to Treasury's budget-utilization ring, computed from real persisted `budget_usage` data via the existing `usedInCurrentPeriod`. Accepts a `demo` flag (renders a "DEMO DATA" tag) for any future use against illustrative rather than live metrics — not currently needed since every ring wired up uses real data.

## 11. Hero parallax implementation

`MotionParallax` (`useMotionValue` + `useSpring` + `useTransform`, pointer position tracked via `useMotionValue` — never React state) applied as a small decorative glow behind the Overview page header. There is no dedicated marketing/hero page in this app (it's a dashboard shown regardless of wallet connection) — the "hero" treatment was applied to the closest equivalent, the Overview page's top section, kept deliberately subtle (10px range) so the actual content never moves.

## 12. Reduced-motion implementation

Two layers, kept in sync: `useReducedMotion()` (JS, wraps Framer Motion's reactive media-query hook) used by every motion primitive to swap in a movement-free variant or skip animation outright; and a global `@media (prefers-reduced-motion: reduce)` block in `index.css` that disables every CSS-driven continuous animation (`.pulse-dot`, `.holo-orb-ambient`, `.skeleton-shimmer`) in one place. Functionality is identical either way — only movement changes.

## 13. Performance findings

- Pointer parallax uses `useMotionValue`/`useSpring`, never `setState` — zero React re-renders per pointer move.
- Continuous ambient effects (orb drift, skeleton shimmer) are CSS `background-position`/`opacity` keyframes, not Framer Motion loops — cheap, GPU-composited, and already covered by the reduced-motion CSS block.
- No layout-animating properties used anywhere (`y`/`scale`/`opacity`/`rotate` only) except `layoutId` on the two nav active-indicators, which Framer Motion handles via FLIP transforms, not actual layout thrash.
- Production bundle grew from ~1.34 MB to ~1.51 MB (gzip 363 KB → 413 KB) — the cost of Framer Motion's runtime actually being used for the first time. Acceptable for this project's existing single-file-bundle approach; flagged in case bundle size becomes a concern later.

## 14. Mobile testing

Not verified on real devices or a browser at any viewport — no browser-automation tool is available in this environment (same limitation disclosed in the prior treasury-automation milestone). What was done instead: every new animation is transform/opacity-only (no width/height animation that could reflow layout), `MotionParallax` disables itself on `pointer: coarse` devices via `matchMedia`, and the existing global `overflow-x: hidden` guard remains untouched. This is a real gap against the spec's explicit breakpoint-testing request, not a substitute for it.

## 15. Test results

Full existing suite re-run headlessly after every wiring change (not just at the end): **100/103 passing**, identical to before this milestone. The 3 failures are the same pre-existing, unrelated status-casing bugs documented in earlier milestone reports (`src/lib/api/deployments.ts`, `src/lib/api/executions.ts`) — untouched by this work. No new automated tests were added specifically for animation behavior (Framer Motion's runtime isn't something the project's lightweight assertion-based test harness can meaningfully exercise) — instead, every animated component's *underlying data flow* was verified via the existing suite and a full rebuild after each change, confirming the animation layer never mutates application state (§34's requirement).

## 16. Build results

`npm run build` succeeds. `npx tsc --noEmit` — zero errors, strict TypeScript configuration unchanged (no `any`-casting or config weakening introduced to make the motion types fit).

## 17. Remaining animation limitations

- **Wallet connection states** got the least dedicated treatment — the existing CSS pulse dot was left as-is rather than rebuilt with `MotionStatus`, since the wallet chooser/dropdown UI has a very different shape (popover, not a pipeline card) and forcing it into the same component would have cost more than it added. A future pass could give `WalletConnect` its own small `MotionStatus`-driven indicator.
- **Loading skeletons** (`MotionSkeleton`) were built but are not applied anywhere yet — this app's data comes from synchronous localStorage reads, so there's no real async loading gap to cover today. Ready for the first genuinely-async data source.
- **Tab transitions** (`tabContent` variant) exist in the shared variant library but no in-page tabbed content-swap UI was found to attach it to (`TreasuryTabs` is route-level navigation, not a content swap).
- Mobile breakpoint verification (§14) is the most significant open item.

## 18. Recommended next milestone

Close the two gaps this milestone's own audit surfaced as real and load-bearing: (1) a genuine mobile QA pass with actual browser/device testing — carried forward from the prior report, still unresolved; (2) pick one real piece of the audited-as-missing functionality (vendor management is the most natural next step, since it already has a partial stand-in via the approved-recipient allowlist) rather than layering further presentation work on a data model that's still thin in places.
