// SPDX-License-Identifier: Apache-2.0
// ExecutionAttestor — anchors non-sensitive execution event onchain
// Stores only non-sensitive fields: agent_id, policy_hash, policy_version, intent_hash, trace_hash, verdict, execution_status
// Does NOT store viewing keys, private notes, shielded balances, private recipients, exact amounts, proof witnesses
// Only authorized Holographic execution authority can create attestation, plus user self-attestation for MVP

use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct Attestation {
    pub agent_id: felt252,
    pub policy_hash: felt252,
    pub policy_version: u64,
    pub intent_hash: felt252,
    pub trace_hash: felt252,
    pub verdict: u8, // 0=APPROVE, 1=REJECT, 2=REQUIRE_USER_CONFIRMATION
    pub execution_status: u8, // 0=PROPOSED,1=POLICY_APPROVED,2=AWAITING_USER,3=EXECUTING,4=COMPLETED,5=BLOCKED,6=FAILED,7=CANCELLED
    pub attested_at: u64,
    pub attestor: ContractAddress,
}

#[starknet::interface]
pub trait IExecutionAttestor<TContractState> {
    fn attest_execution(ref self: TContractState, user: ContractAddress, agent_id: felt252, policy_hash: felt252, policy_version: u64, intent_hash: felt252, trace_hash: felt252, verdict: u8, execution_status: u8);
    fn get_attestation(self: @TContractState, user: ContractAddress, intent_hash: felt252) -> Attestation;
    fn verify_attestation(self: @TContractState, user: ContractAddress, intent_hash: felt252, trace_hash: felt252) -> bool;
    fn get_attestation_count(self: @TContractState, user: ContractAddress) -> u64;
    fn add_authorized_attestor(ref self: TContractState, attestor: ContractAddress);
    fn remove_authorized_attestor(ref self: TContractState, attestor: ContractAddress);
    fn is_authorized_attestor(self: @TContractState, attestor: ContractAddress) -> bool;
}

#[starknet::contract]
pub mod ExecutionAttestor {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{Attestation, IExecutionAttestor};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        attestations: Map<(ContractAddress, felt252), Attestation>,
        counts: Map<ContractAddress, u64>,
        authorized_attestors: Map<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ExecutionAttested: ExecutionAttested,
        AuthorizedAttestorAdded: AuthorizedAttestorAdded,
        AuthorizedAttestorRemoved: AuthorizedAttestorRemoved,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ExecutionAttested {
        #[key]
        pub user: ContractAddress,
        #[key]
        pub agent_id: felt252,
        #[key]
        pub intent_hash: felt252,
        pub policy_hash: felt252,
        pub policy_version: u64,
        pub trace_hash: felt252,
        pub verdict: u8,
        pub execution_status: u8,
        pub attestor: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AuthorizedAttestorAdded {
        #[key]
        pub attestor: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AuthorizedAttestorRemoved {
        #[key]
        pub attestor: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        let zero: ContractAddress = starknet::contract_address_const::<0>();
        assert(owner != zero, 'owner zero');
        self.owner.write(owner);
        self.authorized_attestors.entry(owner).write(true);
        self.emit(AuthorizedAttestorAdded { attestor: owner });
    }

    #[abi(embed_v0)]
    impl ExecutionAttestorImpl of IExecutionAttestor<ContractState> {
        fn attest_execution(ref self: ContractState, user: ContractAddress, agent_id: felt252, policy_hash: felt252, policy_version: u64, intent_hash: felt252, trace_hash: felt252, verdict: u8, execution_status: u8) {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');
            assert(agent_id != 0, 'agent_id zero');
            assert(policy_hash != 0, 'policy_hash zero');
            assert(intent_hash != 0, 'intent_hash zero');
            assert(trace_hash != 0, 'trace_hash zero');
            assert(policy_version != 0, 'policy_version zero');
            assert(verdict < 3, 'invalid verdict');
            assert(execution_status < 8, 'invalid execution_status');

            let caller = get_caller_address();
            assert(caller != zero, 'caller zero');

            let is_authorized = self.authorized_attestors.entry(caller).read();
            assert(is_authorized || caller == user, 'unauthorized attestor');

            let existing = self.attestations.entry((user, intent_hash)).read();
            assert(existing.intent_hash == 0, 'intent already attested');

            let attestation = Attestation {
                agent_id,
                policy_hash,
                policy_version,
                intent_hash,
                trace_hash,
                verdict,
                execution_status,
                attested_at: get_block_timestamp(),
                attestor: caller,
            };

            self.attestations.entry((user, intent_hash)).write(attestation);
            let count = self.counts.entry(user).read();
            self.counts.entry(user).write(count + 1);

            self.emit(ExecutionAttested { user, agent_id, intent_hash, policy_hash, policy_version, trace_hash, verdict, execution_status, attestor: caller });
        }

        fn get_attestation(self: @ContractState, user: ContractAddress, intent_hash: felt252) -> Attestation {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(user != zero, 'user zero');
            assert(intent_hash != 0, 'intent_hash zero');
            self.attestations.entry((user, intent_hash)).read()
        }

        fn verify_attestation(self: @ContractState, user: ContractAddress, intent_hash: felt252, trace_hash: felt252) -> bool {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if user == zero || intent_hash == 0 || trace_hash == 0 {
                return false;
            }
            let a = self.attestations.entry((user, intent_hash)).read();
            a.intent_hash == intent_hash && a.trace_hash == trace_hash && a.intent_hash != 0
        }

        fn get_attestation_count(self: @ContractState, user: ContractAddress) -> u64 {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if user == zero {
                return 0;
            }
            self.counts.entry(user).read()
        }

        fn add_authorized_attestor(ref self: ContractState, attestor: ContractAddress) {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(attestor != zero, 'attestor zero');
            assert(get_caller_address() == self.owner.read(), 'not owner');
            assert(!self.authorized_attestors.entry(attestor).read(), 'already authorized');
            self.authorized_attestors.entry(attestor).write(true);
            self.emit(AuthorizedAttestorAdded { attestor });
        }

        fn remove_authorized_attestor(ref self: ContractState, attestor: ContractAddress) {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            assert(attestor != zero, 'attestor zero');
            assert(get_caller_address() == self.owner.read(), 'not owner');
            assert(self.authorized_attestors.entry(attestor).read(), 'not authorized');
            assert(attestor != self.owner.read(), 'cannot remove owner');
            self.authorized_attestors.entry(attestor).write(false);
            self.emit(AuthorizedAttestorRemoved { attestor });
        }

        fn is_authorized_attestor(self: @ContractState, attestor: ContractAddress) -> bool {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if attestor == zero {
                return false;
            }
            self.authorized_attestors.entry(attestor).read()
        }
    }
}
