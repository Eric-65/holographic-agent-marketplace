# Holographic Agent Documentation — /docs/agents

## Agent Model
Holographic is an agent platform for policy-controlled private finance, not an arbitrary AI code execution marketplace.

Every agent must fit:
```
Agent → Intent → Capability validation → Policy Engine → Human approval if required → Wallet → STRK20 → Execution Receipt → Verification
```

## Agent Manifest
```json
{
  "id": "holographic.treasury",
  "name": "Holographic Treasury Agent",
  "version": "1.0.0",
  "creator": "Holographic Core",
  "category": "TREASURY",
  "capabilities": ["PRIVATE_TRANSFER", "POLICY_ENFORCEMENT"],
  "supportedAssets": ["USDC"],
  "riskLevel": "LOW",
  "policyRequirements": ["MAX_TRANSACTION", "DAILY_LIMIT", "APPROVED_RECIPIENTS"]
}
```

## Capabilities
- PRIVATE_TRANSFER, PRIVATE_DISTRIBUTION, PAYMENT_SCHEDULING, TREASURY_MANAGEMENT, POLICY_ENFORCEMENT, HUMAN_APPROVAL, COMPLIANCE_REPORTING, EXECUTION_ATTESTATION, AUDIT_SUPPORT, PROCUREMENT, ANALYTICS
- Structured, not arbitrary strings, validated via validateCapabilities()
- Every proposed action must correspond to registered capability

## Permissions
- Capability: what agent technically supports
- Permission: what specific deployment allows (USDC, Approved recipients, $500 max)
- Policy: what owner permits (AgentPolicy integer-safe)
- Actual authority = intersection, agent must never infer additional authority

## Policy Integration
- Deterministic policy engine is authoritative: validateAction(action, policy) → {allowed, reasons, requiresHumanApproval}
- Policy per deployment, versioned, immutable once committed, hash via canonicalPolicyHash() using Poseidon
- Policy requirements: MAX_TRANSACTION, DAILY_LIMIT, APPROVED_RECIPIENTS, ALLOWED_ASSETS, HUMAN_APPROVAL, PAUSE_CAPABILITY

## Execution Lifecycle
1. User instruction "Pay approved contractor 10 USDC"
2. Agent reasoning (LLM may propose reason but never decides)
3. Structured intent TreasuryTransferIntent (agentId, action, asset, recipient, amount int minor units, reason, requestedAt, metadata)
4. Capability validation (intent capability in agent capabilities)
5. Deterministic policy engine (APPROVE/REJECT/REQUIRE_USER_CONFIRMATION)
6. Human approval if required (ApprovalDialog)
7. Wallet authorization (Ready / WalletConnect via @starknet-io/get-starknet + starknet.js v10.4.0, Demo Mode fallback)
8. STRK20 private execution (wallet_strk20InvokeTransaction with STRK20_ACTION transfer)
9. Execution result (txHash, block, proofVerified, bucket — no viewing keys/notes/witnesses)
10. Persistent receipt (DbExecutionReceipt with bucket, hashes, DEMO/STRK20 badge)
11. Verification (policy commitment MATCH, execution attestation MATCH → VERIFIED)

## Security Boundaries
- LLM → can propose intent only (reason field, never trusted)
- Policy engine → decides permission (pure deterministic)
- Backend → validates ownership/state (userId checks)
- Wallet → signs (no app-owned keys)
- STRK20 → executes private operation (wallet handles proving/notes/viewing keys)
- Receipt layer → stores non-sensitive metadata only

Agents must NOT: sign, send raw blockchain transactions, modify policies/recipients/permissions, access viewing keys/private keys, execute STRK20 directly. Only Holographic's controlled execution service can continue after policy approval.

## Publishing Process
- States: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, LIVE, SUSPENDED, DEPRECATED
- Flow: Create Agent (createDraftAgent) → Validate Manifest → Submit (submitForReview) → Review (manifest validity, capabilities, policy compatibility, privacy behavior, risk classification, contract dependencies, verification) → Approve (approveAgent, reviewer != creator) → Register (AgentRegistry contract) → Publish (publishAgent) → LIVE
- For MVP: permissioned, only approved creators can publish LIVE, no arbitrary public code uploads
- Creator Dashboard: /creator, /creator/agents (create draft, create version, submit), /creator/submissions (review panel), /creator/metrics (operational metrics)

## Versioning
- Agent versions: semantic version, manifest, capabilities, createdAt, status, verification status, changes — explicit updates, no silent upgrade, every deployment references specific version, every execution references agentId, agentVersion, deploymentId, policyId, policyVersion
- Policy versions: immutable once committed, new version on edit, existing executions reference original

## Verification
- Agent identity via AgentRegistry isAgentRegistered, PolicyCommitment via isPolicyAnchored/getCurrentPolicyCommitment, ExecutionAttestor via attestExecution
- Canonical hashing: same policy same hash, changed policy different hash, different version different commitment
- Verification states: NOT_CHECKED, CHECKING, VERIFIED, MISMATCH, NOT_FOUND, UNAVAILABLE
- Trust signals: ONCHAIN REGISTERED, POLICY-CONTROLLED, STRK20, ATTESTED, VERIFIED — only when backed by actual implementation, PREPARED never VERIFIED

## Risk Model
- LOW: Read-only reasoning / low-value controlled operations
- MEDIUM: Policy-controlled transfers
- HIGH: Large-value or complex financial workflows
- Calculated from capabilities and policy requirements via calculateRisk() — capability risk weights + policy requirements count + asset count + distribution support
- Display Declared Risk + Calculated Risk
