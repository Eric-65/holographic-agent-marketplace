use starknet::ContractAddress;
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address};
use holographic::policy_commitment::{IPolicyCommitmentDispatcher, IPolicyCommitmentDispatcherTrait};

fn USER1() -> ContractAddress {
    starknet::contract_address_const::<0x1>()
}

fn USER2() -> ContractAddress {
    starknet::contract_address_const::<0x2>()
}

fn deploy_commitment() -> ContractAddress {
    let contract = declare("PolicyCommitment").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();
    contract_address
}

#[test]
fn test_create_commitment() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);

    let commitment = dispatcher.get_current_commitment(USER1(), 'treasury');
    assert(commitment.policy_hash == 'hash1', 'hash mismatch');
    assert(commitment.version == 1, 'version mismatch');
    assert(!commitment.revoked, 'should not be revoked');
}

#[test]
fn test_query_commitment() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);

    assert(dispatcher.is_anchored(USER1(), 'treasury'), 'should be anchored');
    assert(!dispatcher.is_anchored(USER2(), 'treasury'), 'other user not anchored');
    assert(dispatcher.verify_commitment(USER1(), 'treasury', 1, 'hash1'), 'should verify');
    assert(!dispatcher.verify_commitment(USER1(), 'treasury', 1, 'wrong'), 'should not verify wrong hash');
}

#[test]
fn test_update_version() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 'hash1', 1);
    dispatcher.update_commitment('treasury', 'hash2', 2);
    stop_cheat_caller_address(contract_address);

    let current = dispatcher.get_current_commitment(USER1(), 'treasury');
    assert(current.version == 2, 'version not updated');
    assert(current.policy_hash == 'hash2', 'hash not updated');

    let old = dispatcher.get_commitment_at_version(USER1(), 'treasury', 1);
    assert(old.policy_hash == 'hash1', 'old version lost');
}

#[test]
#[should_panic(expected: 'version must increase')]
fn test_duplicate_version() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 'hash1', 1);
    dispatcher.update_commitment('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'already exists, use update')]
fn test_duplicate_create() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 'hash1', 1);
    dispatcher.create_commitment('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'not anchored')]
fn test_reject_unauthorized_revoke_other_user() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, USER2());
    dispatcher.revoke_commitment('treasury');
    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'policy_hash zero')]
fn test_invalid_commitment_zero_hash() {
    let contract_address = deploy_commitment();
    let dispatcher = IPolicyCommitmentDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.create_commitment('treasury', 0, 1);
    stop_cheat_caller_address(contract_address);
}
