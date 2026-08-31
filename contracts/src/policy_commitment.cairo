// SPDX-License-Identifier: Apache-2.0
// PolicyCommitment — anchors policy commitment/version onchain
// Does NOT move policy engine onchain, does NOT store private policy contents
// Only stores minimum commitment/metadata: policy_hash, version, block, timestamp, revoked

use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct Commitment {
    pub policy_hash: felt252,
    pub version: u64,
    pub effective_from_block: u64,
    pub committed_at: u64,
    pub revoked: bool,
}

#[starknet::interface]
pub trait IPolicyCommitment<TContractState> {
    fn create_commitment(ref self: TContractState, agent_id: felt252, policy_hash: felt252, version: u64);
    fn update_commitment(ref self: TContractState, agent_id: felt252, policy_hash: felt252, version: u64);
    fn revoke_commitment(ref self: TContractState, agent_id: felt252);
    fn get_current_commitment(self: @TContractState, user: ContractAddress, agent_id: felt252) -> Commitment;
    fn get_commitment_at_version(self: @TContractState, user: ContractAddress, agent_id: felt252, version: u64) -> Commitment;
    fn verify_commitment(self: @TContractState, user: ContractAddress, agent_id: felt252, version: u64, policy_hash: felt252) -> bool;
    fn is_anchored(self: @TContractState, user: ContractAddress, agent_id: felt252) -> bool;
}

#[starknet::contract]
pub mod PolicyCommitment {
    use starknet::{ContractAddress, get_caller_address, get_block_number, get_block_timestamp};
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{Commitment, IPolicyCommitment};

    #[storage]
    struct Storage {
        active_version: Map<(ContractAddress, felt252), u64>,
        commitments: Map<(ContractAddress, felt252, u64), Commitment>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PolicyCommitted: PolicyCommitted,
        PolicyUpdated: PolicyUpdated,
        PolicyRevoked: PolicyRevoked,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PolicyCommitted {
        #[key]
        pub user: ContractAddress,
        #[key]
        pub agent_id: felt252,
        pub policy_hash: felt252,
        pub version: u64,
        pub effective_from_block: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PolicyUpdated {
        #[key]
        pub user: ContractAddress,
        #[key]
        pub agent_id: felt252,
        pub policy_hash: felt252,
        pub version: u64,
        pub effective_from_block: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PolicyRevoked {
        #[key]
        pub user: ContractAddress,
        #[key]
        pub agent_id: felt252,
        pub version: u64,
    }

    #[abi(embed_v0)]
    impl PolicyCommitmentImpl of IPolicyCommitment<ContractState> {
        fn create_commitment(ref self: ContractState, agent_id: felt252, policy_hash: felt252, version: u64) {
            assert(agent_id != 0, 'agent_id zero');
            assert(policy_hash != 0, 'policy_hash zero');
            assert(version != 0, 'version zero');

            let user = get_caller_address();
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');

            let existing_version = self.active_version.entry((user, agent_id)).read();
            assert(existing_version == 0, 'already exists, use update');

            let block = get_block_number();
            let commitment = Commitment {
                policy_hash,
                version,
                effective_from_block: block,
                committed_at: get_block_timestamp(),
                revoked: false,
            };

            self.commitments.entry((user, agent_id, version)).write(commitment);
            self.active_version.entry((user, agent_id)).write(version);
            self.emit(PolicyCommitted { user, agent_id, policy_hash, version, effective_from_block: block });
        }

        fn update_commitment(ref self: ContractState, agent_id: felt252, policy_hash: felt252, version: u64) {
            assert(agent_id != 0, 'agent_id zero');
            assert(policy_hash != 0, 'policy_hash zero');
            assert(version != 0, 'version zero');

            let user = get_caller_address();
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');

            let previous = self.active_version.entry((user, agent_id)).read();
            assert(previous != 0, 'not exists, use create');
            assert(version > previous, 'version must increase');

            let block = get_block_number();
            let commitment = Commitment {
                policy_hash,
                version,
                effective_from_block: block,
                committed_at: get_block_timestamp(),
                revoked: false,
            };

            self.commitments.entry((user, agent_id, version)).write(commitment);
            self.active_version.entry((user, agent_id)).write(version);
            self.emit(PolicyUpdated { user, agent_id, policy_hash, version, effective_from_block: block });
        }

        fn revoke_commitment(ref self: ContractState, agent_id: felt252) {
            assert(agent_id != 0, 'agent_id zero');
            let user = get_caller_address();
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');

            let version = self.active_version.entry((user, agent_id)).read();
            assert(version != 0, 'not anchored');

            let mut c = self.commitments.entry((user, agent_id, version)).read();
            assert(!c.revoked, 'already revoked');
            c.revoked = true;
            self.commitments.entry((user, agent_id, version)).write(c);
            self.emit(PolicyRevoked { user, agent_id, version });
        }

        fn get_current_commitment(self: @ContractState, user: ContractAddress, agent_id: felt252) -> Commitment {
            assert(agent_id != 0, 'agent_id zero');
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');
            let version = self.active_version.entry((user, agent_id)).read();
            assert(version != 0, 'not anchored');
            self.commitments.entry((user, agent_id, version)).read()
        }

        fn get_commitment_at_version(self: @ContractState, user: ContractAddress, agent_id: felt252, version: u64) -> Commitment {
            assert(agent_id != 0, 'agent_id zero');
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');
            assert(version != 0, 'version zero');
            self.commitments.entry((user, agent_id, version)).read()
        }

        fn verify_commitment(self: @ContractState, user: ContractAddress, agent_id: felt252, version: u64, policy_hash: felt252) -> bool {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if agent_id == 0 || policy_hash == 0 || version == 0 || user == zero {
                return false;
            }
            let c = self.commitments.entry((user, agent_id, version)).read();
            c.policy_hash == policy_hash && !c.revoked && c.version == version
        }

        fn is_anchored(self: @ContractState, user: ContractAddress, agent_id: felt252) -> bool {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if agent_id == 0 || user == zero {
                return false;
            }
            let version = self.active_version.entry((user, agent_id)).read();
            if version == 0 {
                return false;
            }
            let c = self.commitments.entry((user, agent_id, version)).read();
            !c.revoked && c.policy_hash != 0
        }
    }
}
