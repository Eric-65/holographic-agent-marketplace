// Holographic — Cairo contract surface.
//
// Deliberately thin. We add identity, policy commitment and attestation.
// We do NOT add privacy infrastructure: the STRK20 privacy pool and its
// verifier are core Starknet infrastructure and we compose with them.

pub mod agent_registry;
pub mod policy_commitment;
pub mod execution_attestor;
pub mod holographic_anonymizer;
