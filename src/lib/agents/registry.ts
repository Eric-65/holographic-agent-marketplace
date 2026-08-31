/**
 * Agent Registry service — combines onchain AgentRegistry contract + backend DB
 * Provides agent identity/registry: register, update metadata, deactivate, query, verify owner, track version
 * For MVP, DB is main state, onchain optional anchor
 */

import { db } from "../db/client";
import type { DbAgent, DbAgentVersion } from "../db/schema";
import { getAllAgents, getAgentById, registerAgent as apiRegisterAgent, createVersion } from "../api/agents";
import { contractClient } from "../contracts/client";
import { isContractDeployed } from "../contracts/config";
import { validateAgentManifestFull } from "./validator";
import type { AgentManifest } from "./manifest";

export interface RegistryResult {
  success: boolean;
  agent?: DbAgent;
  error?: string;
  onchainTx?: string | null;
  isOnchainRegistered?: boolean;
}

export const agentRegistryService = {
  async getAll(): Promise<DbAgent[]> {
    return getAllAgents();
  },

  async getById(id: string): Promise<DbAgent | null> {
    return getAgentById(id);
  },

  async getVersions(agentId: string): Promise<DbAgentVersion[]> {
    return db.getAgentVersionsByAgent(agentId);
  },

  async isOnchainRegistered(agentId: string): Promise<boolean> {
    if (!isContractDeployed("agent_registry")) return false;
    try {
      return await contractClient.isAgentRegistered(agentId);
    } catch {
      return false;
    }
  },

  async register(manifest: AgentManifest, creatorWallet: string): Promise<RegistryResult> {
    // Validate manifest
    const validation = validateAgentManifestFull(manifest, creatorWallet);
    if (!validation.valid) {
      return { success: false, error: `AGENT NOT DEPLOYABLE: ${validation.errors.join("; ")}` };
    }

    try {
      // Persist in DB first — main application state
      const agent = apiRegisterAgent(manifest as any, creatorWallet);

      // Optionally anchor onchain if contract deployed
      let onchainTx: string | null = null;
      let isOnchainRegistered = false;
      if (isContractDeployed("agent_registry")) {
        try {
          const metadataHash = `0x${Math.random().toString(16).slice(2, 10)}`; // In real, hash of manifest via poseidon
          onchainTx = await contractClient.registerAgent(agent.id, metadataHash, 1);
          isOnchainRegistered = true;
        } catch (e: any) {
          // If onchain fails, do NOT pretend success for onchain, but DB registration still valid
          // Return with onchainTx null and isOnchainRegistered false
          isOnchainRegistered = false;
        }
      }

      return { success: true, agent, onchainTx, isOnchainRegistered };
    } catch (e: any) {
      return { success: false, error: e.message ?? String(e) };
    }
  },

  async createNewVersion(agentId: string, version: string, changes: string, creatorWallet: string): Promise<{ success: boolean; version?: DbAgentVersion; error?: string }> {
    try {
      const agent = getAgentById(agentId);
      if (!agent) return { success: false, error: "Agent not found" };
      if (agent.creatorWallet.toLowerCase() !== creatorWallet.toLowerCase()) {
        return { success: false, error: "Unauthorized: not creator" };
      }

      const existingVersions = db.getAgentVersionsByAgent(agentId);
      if (existingVersions.some((v: any) => v.version === version)) {
        return { success: false, error: `Duplicate version: version ${version} already exists` };
      }

      const newVersion = createVersion(agentId, version, changes);
      return { success: true, version: newVersion };
    } catch (e: any) {
      return { success: false, error: e.message ?? String(e) };
    }
  },

  async verifyOwner(agentId: string, owner: string): Promise<boolean> {
    const agent = getAgentById(agentId);
    if (!agent) return false;
    if (agent.creatorWallet.toLowerCase() !== owner.toLowerCase()) return false;

    if (!isContractDeployed("agent_registry")) return true; // offchain only

    try {
      // Try onchain verification if contract deployed
      // contractClient.getAgentRegistration would return owner, but we check DB for MVP
      return true;
    } catch {
      return false;
    }
  },
};
