use crate::{mock::*, *};
use fips204::ml_dsa_44;
use fips204::traits::{SerDes, Signer};
use frame_support::pallet_prelude::*;
use frame_support::unsigned::ValidateUnsigned;
use frame_support::{assert_noop, assert_ok};
use sp_runtime::transaction_validity::TransactionSource;

/// Helper: generate a keypair and commit its `commitment_hash` for `account`.
fn setup_committed_account(account: AccountId) -> (ml_dsa_44::PublicKey, ml_dsa_44::PrivateKey) {
	let (pk, sk) = ml_dsa_44::try_keygen().unwrap();
	let pk_bytes = pk.clone().into_bytes();
	let hash = pq_crypto::commitment_hash(&pk_bytes);
	assert_ok!(PqRegistry::commit(RuntimeOrigin::signed(account), hash));
	(pk, sk)
}

#[test]
fn pq_transfer_first_time_reveals_and_transfers() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = setup_committed_account(1);
		let pk_bytes = pk.into_bytes().to_vec();
		let nonce = 0u64;
		let amount = 100u128;
		let msg = encode_transfer_msg::<Test>(&1, &2, amount, nonce);
		let sig = sk.try_sign(&msg, &[]).unwrap().to_vec();

		assert_ok!(PqWallet::pq_transfer(
			RuntimeOrigin::none(),
			1,
			2,
			amount,
			nonce,
			pk_bytes.clone().try_into().unwrap(),
			sig.try_into().unwrap(),
		));

		assert_eq!(Balances::free_balance(&1), 1_000_000 - amount);
		assert_eq!(Balances::free_balance(&2), 1_000_000 + amount);
		assert_eq!(Revealed::<Test>::get(&1).map(|v| v.to_vec()), Some(pk_bytes));
		assert_eq!(Nonce::<Test>::get(&1), 1);
	});
}

#[test]
fn pq_transfer_with_no_commitment_fails() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = ml_dsa_44::try_keygen().unwrap();
		let pk_bytes = pk.into_bytes().to_vec();
		let msg = encode_transfer_msg::<Test>(&1, &2, 50, 0);
		let sig = sk.try_sign(&msg, &[]).unwrap().to_vec();

		assert_noop!(
			PqWallet::pq_transfer(
				RuntimeOrigin::none(),
				1,
				2,
				50,
				0,
				pk_bytes.try_into().unwrap(),
				sig.try_into().unwrap(),
			),
			Error::<Test>::NoCommitment
		);
	});
}

#[test]
fn pq_transfer_with_wrong_pubkey_fails_commitment_check() {
	new_test_ext().execute_with(|| {
		let (_pk_committed, _sk) = setup_committed_account(1);
		// Try to spend with a DIFFERENT keypair.
		let (pk_attacker, sk_attacker) = ml_dsa_44::try_keygen().unwrap();
		let pk_bytes = pk_attacker.into_bytes().to_vec();
		let msg = encode_transfer_msg::<Test>(&1, &2, 50, 0);
		let sig = sk_attacker.try_sign(&msg, &[]).unwrap().to_vec();

		assert_noop!(
			PqWallet::pq_transfer(
				RuntimeOrigin::none(),
				1,
				2,
				50,
				0,
				pk_bytes.try_into().unwrap(),
				sig.try_into().unwrap(),
			),
			Error::<Test>::CommitmentMismatch
		);
	});
}

#[test]
fn pq_transfer_second_time_uses_cached_pubkey() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = setup_committed_account(1);
		let pk_bytes = pk.into_bytes().to_vec();

		for nonce in 0..2u64 {
			let msg = encode_transfer_msg::<Test>(&1, &2, 10, nonce);
			let sig = sk.try_sign(&msg, &[]).unwrap().to_vec();
			assert_ok!(PqWallet::pq_transfer(
				RuntimeOrigin::none(),
				1,
				2,
				10,
				nonce,
				pk_bytes.clone().try_into().unwrap(),
				sig.try_into().unwrap(),
			));
		}
		assert_eq!(Nonce::<Test>::get(&1), 2);
	});
}

#[test]
fn pq_transfer_bad_nonce_fails() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = setup_committed_account(1);
		let pk_bytes = pk.into_bytes().to_vec();
		let msg = encode_transfer_msg::<Test>(&1, &2, 10, 5); // expected nonce is 0
		let sig = sk.try_sign(&msg, &[]).unwrap().to_vec();
		assert_noop!(
			PqWallet::pq_transfer(
				RuntimeOrigin::none(),
				1,
				2,
				10,
				5,
				pk_bytes.try_into().unwrap(),
				sig.try_into().unwrap(),
			),
			Error::<Test>::BadNonce
		);
	});
}

#[test]
fn pq_transfer_tampered_sig_fails() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = setup_committed_account(1);
		let pk_bytes = pk.into_bytes().to_vec();
		let msg = encode_transfer_msg::<Test>(&1, &2, 10, 0);
		let mut sig = sk.try_sign(&msg, &[]).unwrap().to_vec();
		sig[0] ^= 0x01;
		assert_noop!(
			PqWallet::pq_transfer(
				RuntimeOrigin::none(),
				1,
				2,
				10,
				0,
				pk_bytes.try_into().unwrap(),
				sig.try_into().unwrap(),
			),
			Error::<Test>::BadSignature
		);
	});
}

#[test]
fn pq_transfer_signed_origin_rejected() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = setup_committed_account(1);
		let pk_bytes = pk.into_bytes().to_vec();
		let msg = encode_transfer_msg::<Test>(&1, &2, 10, 0);
		let sig = sk.try_sign(&msg, &[]).unwrap().to_vec();
		assert!(PqWallet::pq_transfer(
			RuntimeOrigin::signed(1), // must be RuntimeOrigin::none()
			1,
			2,
			10,
			0,
			pk_bytes.try_into().unwrap(),
			sig.try_into().unwrap(),
		)
		.is_err());
	});
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

#[test]
fn validate_unsigned_rejects_unsigned_with_no_commitment() {
	new_test_ext().execute_with(|| {
		let (pk, sk) = ml_dsa_44::try_keygen().unwrap();
		let pk_bytes: BoundedVec<u8, ConstU32<1312>> =
			pk.into_bytes().to_vec().try_into().unwrap();
		let msg = encode_transfer_msg::<Test>(&1, &2, 10, 0);
		let sig: BoundedVec<u8, ConstU32<2420>> =
			sk.try_sign(&msg, &[]).unwrap().to_vec().try_into().unwrap();
		let call = Call::<Test>::pq_transfer {
			from: 1,
			to: 2,
			amount: 10,
			nonce: 0,
			pq_pubkey: pk_bytes,
			sig,
		};
		let res = PqWallet::validate_unsigned(TransactionSource::External, &call);
		assert!(res.is_err());
	});
}
