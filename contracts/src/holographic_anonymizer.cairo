// SPDX-License-Identifier: Apache-2.0
//
// HolographicAnonymizer — PHASE 2, NOT DEPLOYED.
//
// An anonymizer contract in the STRK20 sense. The privacy pool calls it
// atomically through a single entrypoint:
//
//   1. the pool unshields into this contract, creating an open note
//   2. this contract performs the approved DeFi leg (swap / repay / deposit)
//   3. the output is credited back into the pool as a fresh private note
//
// The entire sequence is one transaction. If any step reverts, the whole thing
// rolls back and the funds return to the pool untouched.
//
// IMPORTANT BOUNDARIES
// - This contract does NOT implement privacy. The pool is core Starknet
//   infrastructure; we compose with it.
// - It holds no user funds outside the lifetime of a single transaction.
// - It performs no policy evaluation. By the time the pool calls this, the
//   deterministic policy engine has already returned APPROVE off-chain and the
//   user's wallet has signed. This contract only executes the mechanical leg.

use starknet::ContractAddress;

#[derive(Drop, Serde)]
pub struct AnonymizedAction {
    /// Mirrors the off-chain ActionIntent kind.
    pub kind: u8,
    pub token_in: ContractAddress,
    pub token_out: ContractAddress,
    pub amount_in: u256,
    pub min_amount_out: u256,
    /// Opaque, venue-specific routing calldata (e.g. an AVNU route).
    pub route: Span<felt252>,
    pub deadline: u64,
}

#[starknet::interface]
pub trait IHolographicAnonymizer<TContractState> {
    /// Single entrypoint invoked by the STRK20 privacy pool.
    /// MUST revert on any failure so the pool rolls the unshield back.
    fn execute_anonymized(
        ref self: TContractState, action: AnonymizedAction, recipient_note_key: felt252,
    ) -> u256;

    fn privacy_pool(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod HolographicAnonymizer {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{AnonymizedAction, IHolographicAnonymizer};

    pub mod kind {
        pub const SWAP: u8 = 0;
        pub const LEND_DEPOSIT: u8 = 1;
        pub const LEND_REPAY: u8 = 2;
    }

    #[storage]
    struct Storage {
        /// The canonical STRK20 privacy pool. The only permitted caller.
        privacy_pool: ContractAddress,
        avnu_router: ContractAddress,
        vesu_pool: ContractAddress,
        paused: bool,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AnonymizedLegExecuted: AnonymizedLegExecuted,
    }

    /// Deliberately minimal: emits no amount, no recipient, no token pair.
    /// Only enough for operational monitoring of the contract itself.
    #[derive(Drop, starknet::Event)]
    pub struct AnonymizedLegExecuted {
        pub kind: u8,
        pub at: u64,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        privacy_pool: ContractAddress,
        avnu_router: ContractAddress,
        vesu_pool: ContractAddress,
    ) {
        self.privacy_pool.write(privacy_pool);
        self.avnu_router.write(avnu_router);
        self.vesu_pool.write(vesu_pool);
        self.paused.write(false);
    }

    #[abi(embed_v0)]
    impl HolographicAnonymizerImpl of IHolographicAnonymizer<ContractState> {
        fn execute_anonymized(
            ref self: ContractState, action: AnonymizedAction, recipient_note_key: felt252,
        ) -> u256 {
            // Only the pool may invoke this. Anything else is an attempt to use
            // the contract as a standalone router.
            assert(get_caller_address() == self.privacy_pool.read(), 'caller not pool');
            assert(!self.paused.read(), 'anonymizer paused');
            assert(action.deadline >= get_block_timestamp(), 'deadline passed');
            assert(action.amount_in > 0, 'zero amount');

            // --- PHASE 2 IMPLEMENTATION -------------------------------------
            // let amount_out = match action.kind {
            //     kind::SWAP        => self._swap_via_avnu(action),
            //     kind::LEND_REPAY  => self._repay_vesu(action),
            //     kind::LEND_DEPOSIT=> self._deposit_vesu(action),
            //     _ => panic_with_felt252('unknown kind'),
            // };
            // assert(amount_out >= action.min_amount_out, 'slippage exceeded');
            // self._credit_back_to_pool(action.token_out, amount_out, recipient_note_key);
            // ----------------------------------------------------------------

            let _ = recipient_note_key;
            self.emit(AnonymizedLegExecuted { kind: action.kind, at: get_block_timestamp() });

            // Reverts until phase 2 lands, guaranteeing the pool rolls back.
            panic!("HolographicAnonymizer: not implemented");
        }

        fn privacy_pool(self: @ContractState) -> ContractAddress {
            self.privacy_pool.read()
        }
    }
}
