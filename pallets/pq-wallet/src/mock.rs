use crate as pallet_pq_wallet;
use frame_support::{
	derive_impl, parameter_types,
	traits::{ConstU128, ConstU16},
};
use sp_runtime::BuildStorage;

pub type AccountId = u64;
pub type Balance = u128;
type Block = frame_system::mocking::MockBlock<Test>;

#[frame_support::runtime]
mod runtime {
	#[runtime::runtime]
	#[runtime::derive(
		RuntimeCall,
		RuntimeEvent,
		RuntimeError,
		RuntimeOrigin,
		RuntimeFreezeReason,
		RuntimeHoldReason,
		RuntimeSlashReason,
		RuntimeLockId,
		RuntimeTask,
		RuntimeViewFunction
	)]
	pub struct Test;

	#[runtime::pallet_index(0)]
	pub type System = frame_system::Pallet<Test>;

	#[runtime::pallet_index(1)]
	pub type Balances = pallet_balances::Pallet<Test>;

	#[runtime::pallet_index(2)]
	pub type PqRegistry = pallet_pq_registry::Pallet<Test>;

	#[runtime::pallet_index(3)]
	pub type PqWallet = pallet_pq_wallet::Pallet<Test>;
}

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
	type Block = Block;
	type AccountId = AccountId;
	type SS58Prefix = ConstU16<42>;
	type AccountData = pallet_balances::AccountData<Balance>;
	type Lookup = sp_runtime::traits::IdentityLookup<AccountId>;
}

#[derive_impl(pallet_balances::config_preludes::TestDefaultConfig)]
impl pallet_balances::Config for Test {
	type Balance = Balance;
	type AccountStore = System;
	type ExistentialDeposit = ConstU128<1>;
}

impl pallet_pq_registry::Config for Test {
	type RuntimeEvent = RuntimeEvent;
}

parameter_types! {
	pub const ChainId: u32 = 42;
}

impl pallet_pq_wallet::Config for Test {
	type RuntimeEvent = RuntimeEvent;
	type Currency = Balances;
	type ChainId = ChainId;
}

pub fn new_test_ext() -> sp_io::TestExternalities {
	let mut t = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();
	pallet_balances::GenesisConfig::<Test> {
		balances: vec![(1, 1_000_000), (2, 1_000_000)],
		dev_accounts: None,
	}
	.assimilate_storage(&mut t)
	.unwrap();
	let mut ext = sp_io::TestExternalities::new(t);
	ext.execute_with(|| System::set_block_number(1));
	ext
}
