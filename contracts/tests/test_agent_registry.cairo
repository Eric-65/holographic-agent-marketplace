use starknet::ContractAddress;
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address};
use holographic::agent_registry::{IAgentRegistryDispatcher, IAgentRegistryDispatcherTrait, AgentStatus};

fn OWNER() -> ContractAddress {
    starknet::contract_address_const::<0x123>()
}

fn USER1() -> ContractAddress {
    starknet::contract_address_const::<0x1>()
}

fn USER2() -> ContractAddress {
    starknet::contract_address_const::<0x2>()
}

fn deploy_registry() -> ContractAddress {
    let contract = declare("AgentRegistry").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![OWNER().into()]).unwrap();
    contract_address
}

#[test]
fn test_register_agent() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);

    let agent = dispatcher.get_agent('treasury');
    assert(agent.owner == USER1(), 'owner mismatch');
    assert(agent.version == 1, 'version mismatch');
    assert(agent.metadata_hash == 'hash1', 'hash mismatch');
    assert(agent.status == AgentStatus::ACTIVE, 'status not active');
}

#[test]
fn test_query_agent() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);

    assert(dispatcher.is_registered('treasury'), 'should be registered');
    assert(!dispatcher.is_registered('unknown'), 'should not be registered');
    assert(dispatcher.verify_owner('treasury', USER1()), 'should verify owner');
    assert(!dispatcher.verify_owner('treasury', USER2()), 'should not verify other owner');
}

#[test]
fn test_authorized_update() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    dispatcher.update_agent('treasury', 'hash2', 2);
    stop_cheat_caller_address(contract_address);

    let agent = dispatcher.get_agent('treasury');
    assert(agent.version == 2, 'version not updated');
    assert(agent.metadata_hash == 'hash2', 'hash not updated');
}

#[test]
#[should_panic(expected: 'not owner')]
fn test_unauthorized_update() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, USER2());
    dispatcher.update_agent('treasury', 'hash2', 2);
    stop_cheat_caller_address(contract_address);
}

#[test]
#[should_panic(expected: 'agent exists')]
fn test_duplicate_registration() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    dispatcher.register_agent('treasury', 'hash1', 1);
    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_deactivation() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    dispatcher.deactivate_agent('treasury');
    stop_cheat_caller_address(contract_address);

    let agent = dispatcher.get_agent('treasury');
    assert(agent.status == AgentStatus::DISABLED, 'should be disabled');
}

#[test]
#[should_panic(expected: 'agent_id zero')]
fn test_invalid_owner_zero_id() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent(0, 'hash1', 1);
    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_pause_resume() {
    let contract_address = deploy_registry();
    let dispatcher = IAgentRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER1());
    dispatcher.register_agent('treasury', 'hash1', 1);
    dispatcher.pause_agent('treasury');
    let agent = dispatcher.get_agent('treasury');
    assert(agent.status == AgentStatus::PAUSED, 'should be paused');
    dispatcher.resume_agent('treasury');
    let agent2 = dispatcher.get_agent('treasury');
    assert(agent2.status == AgentStatus::ACTIVE, 'should be active');
    stop_cheat_caller_address(contract_address);
}
