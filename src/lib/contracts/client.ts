/**
 * Frontend contract integration — minimal read/write via real connected wallet
 * Uses starknet.js v10.4.0 WalletAccount
 * All writes require real connected wallet, no backend private keys
 */

import { RpcProvider, Contract, shortString, type Abi } from "starknet";
import { deployments, isContractDeployed } from "./config";
import type { Hex } from "../types";
import { getReadyWalletAdapter } from "../wallet/adapters";

// ABIs — minimal for MVP
const AGENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "register_agent",
    inputs: [
      { name: "agent_id", type: "core::felt252" },
      { name: "metadata_hash", type: "core::felt252" },
      { name: "version", type: "core::integer::u64" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "get_agent",
    inputs: [{ name: "agent_id", type: "core::felt252" }],
    outputs: [{ type: "(core::starknet::contract_address::ContractAddress, core::integer::u64, core::felt252, holographic::agent_registry::AgentRegistry::AgentStatus, core::integer::u64, core::integer::u64)" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "is_registered",
    inputs: [{ name: "agent_id", type: "core::felt252" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
] as const;

const POLICY_COMMITMENT_ABI = [
  {
    type: "function",
    name: "create_commitment",
    inputs: [
      { name: "agent_id", type: "core::felt252" },
      { name: "policy_hash", type: "core::felt252" },
      { name: "version", type: "core::integer::u64" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "get_current_commitment",
    inputs: [
      { name: "user", type: "core::starknet::contract_address::ContractAddress" },
      { name: "agent_id", type: "core::felt252" },
    ],
    outputs: [{ type: "(core::felt252, core::integer::u64, core::integer::u64, core::integer::u64, core::bool)" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "is_anchored",
    inputs: [
      { name: "user", type: "core::starknet::contract_address::ContractAddress" },
      { name: "agent_id", type: "core::felt252" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
] as const;

const EXECUTION_ATTESTOR_ABI = [
  {
    type: "function",
    name: "attest_execution",
    inputs: [
      { name: "user", type: "core::starknet::contract_address::ContractAddress" },
      { name: "agent_id", type: "core::felt252" },
      { name: "policy_hash", type: "core::felt252" },
      { name: "policy_version", type: "core::integer::u64" },
      { name: "intent_hash", type: "core::felt252" },
      { name: "trace_hash", type: "core::felt252" },
      { name: "verdict", type: "core::integer::u8" },
      { name: "execution_status", type: "core::integer::u8" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "get_attestation",
    inputs: [
      { name: "user", type: "core::starknet::contract_address::ContractAddress" },
      { name: "intent_hash", type: "core::felt252" },
    ],
    outputs: [{ type: "(core::felt252, core::felt252, core::integer::u64, core::felt252, core::felt252, core::integer::u8, core::integer::u8, core::integer::u64, core::starknet::contract_address::ContractAddress)" }],
    state_mutability: "view",
  },
] as const;

function getProvider(): RpcProvider {
  return new RpcProvider({ nodeUrl: deployments.rpcUrl });
}

function getContract(address: string, abi: any): Contract | null {
  if (address.startsWith("0x000000")) return null;
  try {
    const provider = getProvider();
    return new Contract({ abi, address, providerOrAccount: provider });
  } catch {
    return null;
  }
}

function agentIdToFelt(agentId: string): Hex {
  try {
    return shortString.encodeShortString(agentId) as Hex;
  } catch {
    let hex = "0x";
    for (let i = 0; i < Math.min(agentId.length, 31); i++) {
      hex += agentId.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex as Hex;
  }
}

export const contractClient = {
  async isAgentRegistered(agentId: string): Promise<boolean> {
    const addr = deployments.contracts.agent_registry.address;
    if (!isContractDeployed("agent_registry")) return false;
    try {
      const contract = getContract(addr, AGENT_REGISTRY_ABI);
      if (!contract) return false;
      const agentIdFelt = agentIdToFelt(agentId);
      const result = await contract.call("is_registered", [agentIdFelt]);
      return Boolean(result);
    } catch {
      return false;
    }
  },

  async getAgentRegistration(agentId: string): Promise<any | null> {
    const addr = deployments.contracts.agent_registry.address;
    if (!isContractDeployed("agent_registry")) return null;
    try {
      const contract = getContract(addr, AGENT_REGISTRY_ABI);
      if (!contract) return null;
      const agentIdFelt = agentIdToFelt(agentId);
      const result = await contract.call("get_agent", [agentIdFelt]);
      return result;
    } catch {
      return null;
    }
  },

  async isPolicyAnchored(userAddress: string, agentId: string): Promise<boolean> {
    const addr = deployments.contracts.policy_commitment.address;
    if (!isContractDeployed("policy_commitment")) return false;
    try {
      const contract = getContract(addr, POLICY_COMMITMENT_ABI);
      if (!contract) return false;
      const agentIdFelt = agentIdToFelt(agentId);
      const result = await contract.call("is_anchored", [userAddress, agentIdFelt]);
      return Boolean(result);
    } catch {
      return false;
    }
  },

  async getCurrentPolicyCommitment(userAddress: string, agentId: string): Promise<any | null> {
    const addr = deployments.contracts.policy_commitment.address;
    if (!isContractDeployed("policy_commitment")) return null;
    try {
      const contract = getContract(addr, POLICY_COMMITMENT_ABI);
      if (!contract) return null;
      const agentIdFelt = agentIdToFelt(agentId);
      const result = await contract.call("get_current_commitment", [userAddress, agentIdFelt]);
      return result;
    } catch {
      return null;
    }
  },

  async registerAgent(agentId: string, metadataHash: string, version: number): Promise<string | null> {
    const readyAdapter = getReadyWalletAdapter();
    if (!readyAdapter.isConnected()) throw new Error("Wallet not connected — cannot register agent");
    const addr = deployments.contracts.agent_registry.address;
    if (!isContractDeployed("agent_registry")) throw new Error("Agent Registry not deployed to Sepolia yet");
    try {
      const provider = getProvider();
      const { WalletAccountV6 } = await import("starknet");
      const walletObj = (readyAdapter as any)._walletObj;
      const walletAccount = await (WalletAccountV6 as any).connect(provider, walletObj);
      const contract = new Contract({ abi: AGENT_REGISTRY_ABI as Abi, address: addr, providerOrAccount: walletAccount });
      const agentIdFelt = agentIdToFelt(agentId);
      const tx = await contract.invoke("register_agent", [agentIdFelt, metadataHash, version]);
      return (tx as any).transaction_hash ?? null;
    } catch (e: any) {
      throw new Error(`Failed to register agent onchain: ${e.message ?? String(e)}`);
    }
  },

  async commitPolicy(agentId: string, policyHash: string, version: number): Promise<string | null> {
    const readyAdapter = getReadyWalletAdapter();
    if (!readyAdapter.isConnected()) throw new Error("Wallet not connected");
    const addr = deployments.contracts.policy_commitment.address;
    if (!isContractDeployed("policy_commitment")) throw new Error("Policy Commitment not deployed");
    try {
      const provider = getProvider();
      const { WalletAccountV6 } = await import("starknet");
      const walletObj = (readyAdapter as any)._walletObj;
      const walletAccount = await (WalletAccountV6 as any).connect(provider, walletObj);
      const contract = new Contract({ abi: POLICY_COMMITMENT_ABI as Abi, address: addr, providerOrAccount: walletAccount });
      const agentIdFelt = agentIdToFelt(agentId);
      try {
        const tx = await contract.invoke("create_commitment", [agentIdFelt, policyHash, version]);
        return (tx as any).transaction_hash ?? null;
      } catch {
        const tx = await contract.invoke("update_commitment", [agentIdFelt, policyHash, version]);
        return (tx as any).transaction_hash ?? null;
      }
    } catch (e: any) {
      throw new Error(`Failed to commit policy onchain: ${e.message ?? String(e)}`);
    }
  },

  async attestExecution(
    userAddress: string,
    agentId: string,
    policyHash: string,
    policyVersion: number,
    intentHash: string,
    traceHash: string,
    verdict: number,
    executionStatus: number,
  ): Promise<string | null> {
    const readyAdapter = getReadyWalletAdapter();
    if (!readyAdapter.isConnected()) throw new Error("Wallet not connected");
    const addr = deployments.contracts.execution_attestor.address;
    if (!isContractDeployed("execution_attestor")) throw new Error("Execution Attestor not deployed");
    try {
      const provider = getProvider();
      const { WalletAccountV6 } = await import("starknet");
      const walletObj = (readyAdapter as any)._walletObj;
      const walletAccount = await (WalletAccountV6 as any).connect(provider, walletObj);
      const contract = new Contract({ abi: EXECUTION_ATTESTOR_ABI as Abi, address: addr, providerOrAccount: walletAccount });
      const agentIdFelt = agentIdToFelt(agentId);
      const tx = await contract.invoke("attest_execution", [
        userAddress,
        agentIdFelt,
        policyHash,
        policyVersion,
        intentHash,
        traceHash,
        verdict,
        executionStatus,
      ]);
      return (tx as any).transaction_hash ?? null;
    } catch (e: any) {
      throw new Error(`Failed to attest execution onchain: ${e.message ?? String(e)} — PRIVATE_EXECUTION=COMPLETED ATTESTATION=FAILED, retry allowed`);
    }
  },
};
