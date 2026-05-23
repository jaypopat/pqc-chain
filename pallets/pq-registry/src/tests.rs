use crate::{mock::*, *};
use frame_support::{assert_noop, assert_ok};
use sp_core::H256;

#[test]
fn commit_stores_hash_and_emits_event() {
	new_test_ext().execute_with(|| {
		let h = H256::from([7u8; 32]);
		assert_ok!(PqRegistry::commit(RuntimeOrigin::signed(1), h));
		assert_eq!(Commitment::<Test>::get(&1), Some(h));
		System::assert_last_event(Event::Committed { who: 1, hash: h }.into());
	});
}

#[test]
fn commit_twice_fails() {
	new_test_ext().execute_with(|| {
		let h = H256::from([7u8; 32]);
		assert_ok!(PqRegistry::commit(RuntimeOrigin::signed(1), h));
		assert_noop!(
			PqRegistry::commit(RuntimeOrigin::signed(1), H256::from([9u8; 32])),
			Error::<Test>::AlreadyCommitted
		);
	});
}
