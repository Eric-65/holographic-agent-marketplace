// SPDX-License-Identifier: Apache-2.0
// AgentRegistry — minimal MVP for Holographic
// Provides agent identity/registry: register, update metadata, deactivate, query, verify owner, track version
// Security: tied to authorized Starknet account, no private info, simple immutable behavior

use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store, Copy, PartialEq)]
pub enum AgentStatus {
    DRAFT,
    ACTIVE,
    PAUSED,
    DISABLED,
}

#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct Agent {
    pub owner: ContractAddress,
    pub version: u64,
    pub metadata_hash: felt252,
    pub status: AgentStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

#[starknet::interface]
pub trait IAgentRegistry<TContractState> {
    fn register_agent(ref self: TContractState, agent_id: felt252, metadata_hash: felt252, version: u64);
    fn update_agent(ref self: TContractState, agent_id: felt252, metadata_hash: felt252, version: u64);
    fn deactivate_agent(ref self: TContractState, agent_id: felt252);
    fn pause_agent(ref self: TContractState, agent_id: felt252);
    fn resume_agent(ref self: TContractState, agent_id: felt252);
    fn get_agent(self: @TContractState, agent_id: felt252) -> Agent;
    fn is_registered(self: @TContractState, agent_id: felt252) -> bool;
    fn verify_owner(self: @TContractState, agent_id: felt252, owner: ContractAddress) -> bool;
}

#[starknet::contract]
pub mod AgentRegistry {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{Agent, AgentStatus, IAgentRegistry};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        agents: Map<felt252, Agent>,
        registered: Map<felt252, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AgentRegistered: AgentRegistered,
        AgentUpdated: AgentUpdated,
        AgentDeactivated: AgentDeactivated,
        AgentPaused: AgentPaused,
        AgentResumed: AgentResumed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AgentRegistered {
        #[key]
        pub agent_id: felt252,
        #[key]
        pub owner: ContractAddress,
        pub metadata_hash: felt252,
        pub version: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AgentUpdated {
        #[key]
        pub agent_id: felt252,
        pub metadata_hash: felt252,
        pub version: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AgentDeactivated {
        #[key]
        pub agent_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AgentPaused {
        #[key]
        pub agent_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AgentResumed {
        #[key]
        pub agent_id: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        let zero: ContractAddress = starknet::contract_address_const::<0>();
        assert(owner != zero, 'owner zero');
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl AgentRegistryImpl of IAgentRegistry<ContractState> {
        fn register_agent(ref self: ContractState, agent_id: felt252, metadata_hash: felt252, version: u64) {
            assert(agent_id != 0, 'agent_id zero');
            assert(metadata_hash != 0, 'metadata_hash zero');
            assert(version != 0, 'version zero');
            assert(!self.registered.entry(agent_id).read(), 'agent exists');

            let caller = get_caller_address();
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(caller != zero, 'caller zero');

            let now = get_block_timestamp();
            let agent = Agent {
                owner: caller,
                version,
                metadata_hash,
                status: AgentStatus::ACTIVE,
                created_at: now,
                updated_at: now,
            };

            self.agents.entry(agent_id).write(agent);
            self.registered.entry(agent_id).write(true);

            self.emit(AgentRegistered { agent_id, owner: caller, metadata_hash, version });
        }

        fn update_agent(ref self: ContractState, agent_id: felt252, metadata_hash: felt252, version: u64) {
            assert(agent_id != 0, 'agent_id zero');
            assert(metadata_hash != 0, 'metadata_hash zero');
            assert(version != 0, 'version zero');

            let mut agent = self.agents.entry(agent_id).read();
            assert(self.registered.entry(agent_id).read(), 'not registered');
            assert(agent.owner == get_caller_address(), 'not owner');
            assert(agent.status == AgentStatus::ACTIVE, 'not active');
            assert(version > agent.version, 'version must increase');

            agent.metadata_hash = metadata_hash;
            agent.version = version;
            agent.updated_at = get_block_timestamp();

            self.agents.entry(agent_id).write(agent);
            self.emit(AgentUpdated { agent_id, metadata_hash, version });
        }

        fn deactivate_agent(ref self: ContractState, agent_id: felt252) {
            assert(agent_id != 0, 'agent_id zero');
            let mut agent = self.agents.entry(agent_id).read();
            assert(self.registered.entry(agent_id).read(), 'not registered');
            let caller = get_caller_address();
            assert(caller == agent.owner || caller == self.owner.read(), 'unauthorized');

            agent.status = AgentStatus::DISABLED;
            agent.updated_at = get_block_timestamp();
            self.agents.entry(agent_id).write(agent);
            self.emit(AgentDeactivated { agent_id });
        }

        fn pause_agent(ref self: ContractState, agent_id: felt252) {
            assert(agent_id != 0, 'agent_id zero');
            let mut agent = self.agents.entry(agent_id).read();
            assert(self.registered.entry(agent_id).read(), 'not registered');
            assert(agent.owner == get_caller_address(), 'not owner');
            assert(agent.status == AgentStatus::ACTIVE, 'not active');

            agent.status = AgentStatus::PAUSED;
            agent.updated_at = get_block_timestamp();
            self.agents.entry(agent_id).write(agent);
            self.emit(AgentPaused { agent_id });
        }

        fn resume_agent(ref self: ContractState, agent_id: felt252) {
            assert(agent_id != 0, 'agent_id zero');
            let mut agent = self.agents.entry(agent_id).read();
            assert(self.registered.entry(agent_id).read(), 'not registered');
            assert(agent.owner == get_caller_address(), 'not owner');
            assert(agent.status == AgentStatus::PAUSED, 'not paused');

            agent.status = AgentStatus::ACTIVE;
            agent.updated_at = get_block_timestamp();
            self.agents.entry(agent_id).write(agent);
            self.emit(AgentResumed { agent_id });
        }

        fn get_agent(self: @ContractState, agent_id: felt252) -> Agent {
            assert(agent_id != 0, 'agent_id zero');
            assert(self.registered.entry(agent_id).read(), 'not registered');
            self.agents.entry(agent_id).read()
        }

        fn is_registered(self: @ContractState, agent_id: felt252) -> bool {
            if agent_id == 0 {
                return false;
            }
            self.registered.entry(agent_id).read()
        }

        fn verify_owner(self: @ContractState, agent_id: felt252, owner: ContractAddress) -> bool {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if agent_id == 0 || owner == zero {
                return false;
            }
            if !self.registered.entry(agent_id).read() {
                return false;
            }
            let agent = self.agents.entry(agent_id).read();
            agent.owner == owner
        }
    }
}
