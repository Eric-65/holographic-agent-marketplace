/**
 * Verification API — backend/domain functions per TASK 19
 * verifyAgent(agentId)
 * verifyPolicy(policyId, version)
 * verifyExecution(executionId)
 * verifyAttestation(executionId)
 * createAuditRequest(...)
 * getAuditEvidence(...)
 * generateComplianceReport(...)
 */

import { db } from "../db/client";
import { getAgentById } from "./agents";
import { getPolicyById } from "./policies";
import { getExecutionRequestById } from "./executions";
import { createVerificationResult } from "./audits";
import { canonicalPolicyHash } from "../hash/canonical";
import { contractClient } from "../contracts/client";
import { isContractDeployed } from "../contracts/config";
import type { VerificationStatus } from "../db/schema";

export interface VerificationResult {
  status: VerificationStatus;
  agent: VerificationStatus;
  policy: "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE";
  execution: "COMPLETED" | "FAILED" | "NOT_FOUND" | "UNAVAILABLE";
  attestation: "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE";
  details?: Record<string, unknown>;
}

export async function verifyAgent(agentId: string, userId: string): Promise<VerificationStatus> {
  if (!db.isAvailable()) return "UNAVAILABLE";
  try {
    const agent = getAgentById(agentId);
    if (!agent) return "NOT_FOUND";

    if (!isContractDeployed("agent_registry")) {
      // Offchain verification only
      createVerificationResult(userId, "agent", agentId, "VERIFIED", {
        agent: "VERIFIED",
        policy: "UNAVAILABLE",
        execution: "UNAVAILABLE",
        attestation: "UNAVAILABLE",
        reason: "Agent exists in DB, onchain not yet deployed — offchain verified",
      });
      return "VERIFIED";
    }

    const isRegistered = await contractClient.isAgentRegistered(agentId);
    const status: VerificationStatus = isRegistered ? "VERIFIED" : "NOT_FOUND";
    createVerificationResult(userId, "agent", agentId, status, {
      agent: status,
      policy: "UNAVAILABLE",
      execution: "UNAVAILABLE",
      attestation: "UNAVAILABLE",
    });
    return status;
  } catch {
    return "UNAVAILABLE";
  }
}

export async function verifyPolicy(policyId: string, version: number, userId: string): Promise<"MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE"> {
  if (!db.isAvailable()) return "UNAVAILABLE";
  try {
    const policy = getPolicyById(policyId, userId);
    if (!policy) return "NOT_FOUND";

    const canonicalHash = canonicalPolicyHash(policy.doc);
    const storedHash = policy.docHash;

    // Check local hash consistency first
    if (canonicalHash !== storedHash) {
      // This would indicate tampering or inconsistent serialization
      createVerificationResult(userId, "policy", policyId, "MISMATCH", {
        agent: "UNAVAILABLE",
        policy: "MISMATCH",
        execution: "UNAVAILABLE",
        attestation: "UNAVAILABLE",
        commitment: storedHash,
        onchainCommitment: canonicalHash,
        reason: "Local hash mismatch — canonical serialization inconsistent",
      });
      return "MISMATCH";
    }

    if (!isContractDeployed("policy_commitment")) {
      createVerificationResult(userId, "policy", policyId, "VERIFIED", {
        agent: "UNAVAILABLE",
        policy: "MATCH",
        execution: "UNAVAILABLE",
        attestation: "UNAVAILABLE",
        commitment: canonicalHash,
        reason: "Offchain verified, onchain not yet deployed",
      } as any);
      return "MATCH";
    }

    // Check onchain commitment
    try {
      const wallet = db.getActiveWalletByUser(userId);
      if (!wallet) return "UNAVAILABLE";
      const onchain = await contractClient.getCurrentPolicyCommitment(wallet.address, policy.agentId);
      if (!onchain) {
        createVerificationResult(userId, "policy", policyId, "NOT_FOUND", {
          agent: "UNAVAILABLE",
          policy: "NOT_FOUND",
          execution: "UNAVAILABLE",
          attestation: "UNAVAILABLE",
        } as any);
        return "NOT_FOUND";
      }
      // onchain is tuple (policy_hash, version, block, timestamp, revoked)
      const onchainHash = (onchain as any)[0] ?? (onchain as any).policy_hash;
      const onchainVersion = (onchain as any)[1] ?? (onchain as any).version;

      if (onchainHash === canonicalHash && Number(onchainVersion) === version) {
        createVerificationResult(userId, "policy", policyId, "VERIFIED", {
          agent: "UNAVAILABLE",
          policy: "MATCH",
          execution: "UNAVAILABLE",
          attestation: "UNAVAILABLE",
          commitment: canonicalHash,
          onchainCommitment: onchainHash,
        } as any);
        return "MATCH";
      } else {
        createVerificationResult(userId, "policy", policyId, "MISMATCH", {
          agent: "UNAVAILABLE",
          policy: "MISMATCH",
          execution: "UNAVAILABLE",
          attestation: "UNAVAILABLE",
          commitment: canonicalHash,
          onchainCommitment: onchainHash,
          reason: `Version or hash mismatch: local v${version} ${canonicalHash} vs onchain v${onchainVersion} ${onchainHash}`,
        } as any);
        return "MISMATCH";
      }
    } catch {
      return "UNAVAILABLE";
    }
  } catch {
    return "UNAVAILABLE";
  }
}

export async function verifyExecution(executionId: string, userId: string): Promise<VerificationResult> {
  if (!db.isAvailable()) {
    return { status: "UNAVAILABLE", agent: "UNAVAILABLE", policy: "UNAVAILABLE", execution: "UNAVAILABLE", attestation: "UNAVAILABLE" };
  }

  try {
    const request = getExecutionRequestById(executionId, userId);
    if (!request) {
      return { status: "NOT_FOUND", agent: "NOT_FOUND", policy: "NOT_FOUND", execution: "NOT_FOUND", attestation: "NOT_FOUND" };
    }

    const agentStatus = await verifyAgent(request.intent.agentId, userId);
    const policyStatus = await verifyPolicy(request.policyId, 1, userId);

    // Execution status
    let execution: VerificationResult["execution"] = "UNAVAILABLE";
    if (request.status === "COMPLETED" || request.status === "executed") execution = "COMPLETED";
    else if (request.status === "FAILED" || request.status === "failed") execution = "FAILED";
    else if (request.status === "BLOCKED" || request.status === "blocked") execution = "COMPLETED"; // blocked is valid terminal

    // Attestation verification — only non-sensitive
    let attestation: any = "UNAVAILABLE";
    try {
      const receipt = db.getAll<any>("execution_receipts").find((r: any) => r.executionRequestId === executionId);
      if (!receipt) {
        attestation = "NOT_FOUND";
      } else {
        if (!isContractDeployed("execution_attestor")) {
          attestation = "MATCH";
        } else {
          if (receipt.txHash && receipt.txHash !== "NOT AVAILABLE") {
            attestation = "MATCH";
          } else {
            attestation = "NOT_FOUND";
          }
        }
      }
    } catch {
      attestation = "UNAVAILABLE";
    }

    const finalStatus: VerificationStatus =
      agentStatus === "VERIFIED" && policyStatus === "MATCH" && (execution === "COMPLETED" || execution === "FAILED") && (attestation === "MATCH" || attestation === "NOT_FOUND")
        ? "VERIFIED"
        : agentStatus === "MISMATCH" || policyStatus === "MISMATCH" || attestation === "MISMATCH"
          ? "MISMATCH"
          : "NOT_FOUND";

    const result: VerificationResult = {
      status: finalStatus,
      agent: agentStatus,
      policy: policyStatus,
      execution,
      attestation,
      details: {
        executionId,
        agentId: request.intent.agentId,
        policyId: request.policyId,
        intentHash: request.intentHash,
        verdict: request.verdict,
      },
    };

    createVerificationResult(userId, "execution", executionId, finalStatus, {
      agent: agentStatus,
      policy: policyStatus,
      execution,
      attestation,
      reason: `Agent ${agentStatus}, Policy ${policyStatus}, Execution ${execution}, Attestation ${attestation}`,
    } as any);

    return result;
  } catch {
    return { status: "UNAVAILABLE", agent: "UNAVAILABLE", policy: "UNAVAILABLE", execution: "UNAVAILABLE", attestation: "UNAVAILABLE" };
  }
}

export async function verifyAttestation(executionId: string, userId: string): Promise<VerificationStatus> {
  const result = await verifyExecution(executionId, userId);
  return result.attestation === "MATCH" ? "VERIFIED" : result.attestation === "MISMATCH" ? "MISMATCH" : result.attestation === "NOT_FOUND" ? "NOT_FOUND" : "UNAVAILABLE";
}

export function getAuditEvidence(auditRequestId: string, userId: string): { policyEvidence?: any; executionEvidence?: any; disclosureAvailable: boolean } {
  const auditReq = db.getById<any>("audit_requests", auditRequestId);
  if (!auditReq) throw new Error("Audit request not found");
  if (auditReq.userId !== userId) throw new Error("Unauthorized auditor");

  if (auditReq.status !== "AUTHORIZED" && auditReq.status !== "FULFILLED") {
    throw new Error("Audit request not authorized");
  }

  let policyEvidence = null;
  let executionEvidence = null;

  if (auditReq.scope.policyEvidence) {
    const policy = getPolicyById(auditReq.subjectId, userId) ?? db.getById<any>("policies", auditReq.subjectId);
    if (policy) {
      policyEvidence = {
        policyId: policy.id,
        version: policy.version,
        label: policy.label,
        docHash: policy.docHash,
        status: policy.status,
        createdAt: policy.createdAt,
        ruleTrace: policy.doc, // non-sensitive
      };
    }
  }

  if (auditReq.scope.executionEvidence) {
    const request = getExecutionRequestById(auditReq.subjectId, userId) ?? db.getById<any>("execution_requests", auditReq.subjectId);
    if (request) {
      const receipt = db.getAll<any>("execution_receipts").find((r: any) => r.executionRequestId === request.id);
      executionEvidence = {
        executionId: request.id,
        agentId: request.intent.agentId,
        policyId: request.policyId,
        intentHash: request.intentHash,
        policyHash: request.policyHash,
        verdict: request.verdict,
        status: request.status,
        receipt: receipt ? { id: receipt.id, bucket: receipt.bucket, txHash: receipt.txHash, provider: receipt.provider, isDemo: receipt.isDemo } : null,
      };
    }
  }

  // Disclosure boundary — STRK20 already provides viewing-key mechanism
  // Holographic only reports availability, never generates keys
  const disclosureAvailable = (() => {
    try {
      const wallet = db.getActiveWalletByUser(userId);
      if (!wallet) return false;
      // In real, check if wallet supports viewing key disclosure
      // For now, check if adapter is real and privacy capable
      return !wallet.isMock;
    } catch {
      return false;
    }
  })();

  return { policyEvidence, executionEvidence, disclosureAvailable };
}

export function generateComplianceReport(
  userId: string,
  period?: { from: number; to: number },
  agentId?: string,
): {
  organization: string;
  agent: string;
  policyVersion: number;
  period: { from: string; to: string };
  totalExecutions: number;
  approvedExecutions: number;
  blockedExecutions: number;
  humanApprovals: number;
  failedExecutions: number;
  policyCommitment: string;
  attestationReferences: string[];
  verificationStatus: string;
  isIncomplete: boolean;
} {
  const user = db.getById<any>("users", userId);
  if (!user) throw new Error("User not found");

  let requests = db.getAll<any>("execution_requests").filter((r: any) => r.userId === userId);
  if (agentId) requests = requests.filter((r: any) => r.intent.agentId === agentId);
  if (period) requests = requests.filter((r: any) => r.createdAt >= period.from && r.createdAt <= period.to);

  const receipts = db.getAll<any>("execution_receipts").filter((r: any) => r.userId === userId);
  const policies = db.getAll<any>("policies").filter((p: any) => p.userId === userId);

  const totalExecutions = requests.length;
  const approvedExecutions = requests.filter((r: any) => r.verdict?.allowed).length;
  const blockedExecutions = requests.filter((r: any) => !r.verdict?.allowed).length;
  const humanApprovals = requests.filter((r: any) => r.approvedByUser).length;
  const failedExecutions = requests.filter((r: any) => r.status === "FAILED" || r.status === "failed").length;

  const isIncomplete = requests.length === 0;

  return {
    organization: user.address,
    agent: agentId ?? "All agents",
    policyVersion: policies.length > 0 ? Math.max(...policies.map((p: any) => p.version)) : 0,
    period: {
      from: period ? new Date(period.from).toISOString() : "All time",
      to: period ? new Date(period.to).toISOString() : "Now",
    },
    totalExecutions,
    approvedExecutions,
    blockedExecutions,
    humanApprovals,
    failedExecutions,
    policyCommitment: policies[0]?.docHash ?? "NOT AVAILABLE",
    attestationReferences: receipts.map((r: any) => r.id),
    verificationStatus: totalExecutions === 0 ? "NOT VERIFIED" : approvedExecutions === totalExecutions ? "VERIFICATION COMPLETE" : "ATTENTION REQUIRED",
    isIncomplete,
  };
}
