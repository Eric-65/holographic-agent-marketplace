/**
 * Single configuration source for deployed contracts
 * Reads from contracts/deployments/sepolia.json
 * Do not duplicate addresses throughout application
 */

import sepoliaDeployments from "../../../contracts/deployments/sepolia.json";

export interface ContractDeploymentInfo {
  address: string;
  classHash: string;
  deployed: boolean;
  version: string;
  source: string;
  status: "LIVE" | "TESTNET" | "DRAFT" | "PHASE_2";
  deployedAt: string | null;
  deploymentTx: string | null;
}

export interface DeploymentsConfig {
  network: string;
  chainId: string;
  chainName: string;
  rpcUrl: string;
  contracts: {
    agent_registry: ContractDeploymentInfo;
    policy_commitment: ContractDeploymentInfo;
    execution_attestor: ContractDeploymentInfo;
    holographic_anonymizer: ContractDeploymentInfo & { note?: string };
  };
  explorerBase: string;
}

export const deployments = sepoliaDeployments as unknown as DeploymentsConfig;

export const CONTRACTS = {
  AGENT_REGISTRY: deployments.contracts.agent_registry,
  POLICY_COMMITMENT: deployments.contracts.policy_commitment,
  EXECUTION_ATTESTOR: deployments.contracts.execution_attestor,
  ANONYMIZER: deployments.contracts.holographic_anonymizer,
};

export const isContractDeployed = (name: keyof DeploymentsConfig["contracts"]): boolean => {
  return deployments.contracts[name].deployed && deployments.contracts[name].address !== "0x0000000000000000000000000000000000000000000000000000000000000000";
};

export const getExplorerLink = (addressOrTx: string, type: "contract" | "tx" = "contract"): string => {
  if (!addressOrTx || addressOrTx === "0x0000000000000000000000000000000000000000000000000000000000000000") return "";
  const base = deployments.explorerBase;
  if (type === "tx") return `${base}/tx/${addressOrTx}`;
  return `${base}/contract/${addressOrTx}`;
};

export const getOnchainStatus = (contractName: keyof DeploymentsConfig["contracts"]): "ONCHAIN REGISTERED" | "POLICY ANCHORED" | "EXECUTION ATTESTED" | "NOT ANCHORED" | "PHASE_2" => {
  const contract = deployments.contracts[contractName];
  if (contract.status === "PHASE_2") return "PHASE_2";
  if (!contract.deployed) return "NOT ANCHORED";
  if (contractName === "agent_registry") return "ONCHAIN REGISTERED";
  if (contractName === "policy_commitment") return "POLICY ANCHORED";
  if (contractName === "execution_attestor") return "EXECUTION ATTESTED";
  return "NOT ANCHORED";
};
