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
