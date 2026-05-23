use crate::{mock::*, *};
use fips204::ml_dsa_44;
use fips204::traits::{SerDes, Signer};
use frame_support::{assert_noop, assert_ok};

/// Helper: generate a keypair and commit its `commitment_hash` for `account`.
fn setup_committed_account(account: AccountId) -> (ml_dsa_44::PublicKey, ml_dsa_44::PrivateKey) {
	let (pk, sk) = ml_dsa_44::try_keygen().unwrap();
	let pk_bytes = pk.clone().into_bytes();
	let hash = pq_crypto::commitment_hash(&pk_bytes);
	assert_ok!(PqRegistry::commit(RuntimeOrigin::signed(account), hash));
	(pk, sk)
}

#[test]
fn encode_transfer_msg_is_stable() {
	new_test_ext().execute_with(|| {
		let m1 = encode_transfer_msg::<Test>(&1, &2, 100, 0);
		let m2 = encode_transfer_msg::<Test>(&1, &2, 100, 0);
		assert_eq!(m1, m2);

		// Domain prefix is present.
		assert!(m1.starts_with(TRANSFER_DOMAIN));

		// Different fields produce different messages.
		assert_ne!(m1, encode_transfer_msg::<Test>(&1, &2, 101, 0));
		assert_ne!(m1, encode_transfer_msg::<Test>(&1, &2, 100, 1));
		assert_ne!(m1, encode_transfer_msg::<Test>(&1, &3, 100, 0));
	});
}
