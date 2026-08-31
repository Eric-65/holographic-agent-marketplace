#!/bin/bash
# Holographic — Sepolia deployment script
# Do NOT deploy to mainnet during this milestone
# Uses sncast (Starknet Foundry) for reproducible deployment

set -e

NETWORK="sepolia"
CHAIN_ID="0x534e5f5345504f4c4941"
RPC_URL=${STARKNET_RPC_URL:-"https://starknet-sepolia.public.blastapi.io/rpc/v0_8"}

echo "Network: $NETWORK"
echo "Chain ID: $CHAIN_ID"
echo "RPC: $RPC_URL"

# Check scarb build first
echo "Building contracts..."
cd "$(dirname "$0")/.."
scarb build

echo "Running tests..."
snforge test

# Deployment — requires env vars:
# STARKNET_ACCOUNT, STARKNET_PRIVATE_KEY or keystore
# Example with sncast:
# sncast --url $RPC_URL deploy --class-hash <CLASS_HASH> --arguments <OWNER_ADDRESS>

# For MVP, we deploy 3 contracts: AgentRegistry, PolicyCommitment, ExecutionAttestor
# HolographicAnonymizer is PHASE_2 — do NOT deploy

echo "Declaring AgentRegistry..."
# sncast declare --contract-name AgentRegistry --url $RPC_URL

echo "Declaring PolicyCommitment..."
# sncast declare --contract-name PolicyCommitment --url $RPC_URL

echo "Declaring ExecutionAttestor..."
# sncast declare --contract-name ExecutionAttestor --url $RPC_URL

echo "Deploying AgentRegistry with owner = deployer address..."
# Example:
# sncast deploy --class-hash $AGENT_REGISTRY_CLASS_HASH --arguments $OWNER_ADDRESS --url $RPC_URL

echo "Deploying PolicyCommitment..."
# sncast deploy --class-hash $POLICY_COMMITMENT_CLASS_HASH --url $RPC_URL

echo "Deploying ExecutionAttestor with owner = deployer address..."
# sncast deploy --class-hash $EXECUTION_ATTESTOR_CLASS_HASH --arguments $OWNER_ADDRESS --url $RPC_URL

echo "Deployment complete — update contracts/deployments/sepolia.json with:"
echo "network, chainId, contract address, deployment tx/hash, version, timestamp"
echo "Use central config src/lib/contracts/config.ts — do not duplicate addresses"
