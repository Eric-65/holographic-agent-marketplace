use starknet::ContractAddress;
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address};
use holographic::execution_attestor::{IExecutionAttestorDispatcher, IExecutionAttestorDispatcherTrait};

fn OWNER() -> ContractAddress {
    starknet::contract_address_const::<0x123>()
}

fn USER1() -> ContractAddress {
    starknet::contract_address_const::<0x1>()
}

fn USER2() -> ContractAddress {
    starknet::contract_address_const::<0x2>()
}

fn ATTACKER() -> ContractAddress {
    starknet::contract_address_const::<0x9>()
}

fn deploy_attestor() -> ContractAddress {
    let contract = declare("ExecutionAttestor").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![OWNER().into()]).unwrap();
    contract_address
}

#[test]
fn test_create_attestation() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);

    let att = dispatcher.get_attestation(USER1(), 'intent_hash1');
    assert(att.agent_id == 'treasury', 'agent_id mismatch');
    assert(att.policy_hash == 'policy_hash1', 'policy_hash mismatch');
    assert(att.intent_hash == 'intent_hash1', 'intent_hash mismatch');
    assert(att.verdict == 0, 'verdict mismatch');
    assert(att.execution_status == 4, 'status mismatch');
}

#[test]
fn test_query_attestation() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);

    assert(dispatcher.get_attestation_count(USER1()) == 1, 'count should be 1');
    assert(dispatcher.get_attestation_count(USER2()) == 0, 'other user count 0');
    assert(dispatcher.verify_attestation(USER1(), 'intent_hash1', 'trace_hash1'), 'should verify');
    assert(!dispatcher.verify_attestation(USER1(), 'intent_hash1', 'wrong'), 'should not verify wrong trace');
}

#[test]
fn test_verify_attestation() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);

    assert(dispatcher.verify_attestation(USER1(), 'intent_hash1', 'trace_hash1'), 'verify failed');
}

#[test]
#[should_panic(expected: 'intent already attested')]
fn test_duplicate_execution_id() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'unauthorized attestor')]
fn test_unauthorized_attestation() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    // ATTACKER tries to attest for USER1 without being authorized
    start_cheat_caller_address(contract_address, ATTACKER());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_authorized_attestor_can_attest_for_user() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    // Owner adds authorized attestor
    start_cheat_caller_address(contract_address, OWNER());
    dispatcher.add_authorized_attestor(USER2());
    stop_cheat_caller_address(contract_address);

    // USER2 (authorized) can attest for USER1
    start_cheat_caller_address(contract_address, USER2());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);

    assert(dispatcher.get_attestation_count(USER1()) == 1, 'should be 1');
}

#[test]
#[should_panic(expected: 'invalid verdict')]
fn test_invalid_metadata_verdict() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 'intent_hash1', 'trace_hash1', 5, 4);
    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'intent_hash zero')]
fn test_invalid_metadata_zero_hash() {
    let contract_address = deploy_attestor();
    let dispatcher = IExecutionAttestorDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.attest_execution(USER1(), 'treasury', 'policy_hash1', 1, 0, 'trace_hash1', 0, 4);
    stop_cheat_caller_address(contract_address);
}
