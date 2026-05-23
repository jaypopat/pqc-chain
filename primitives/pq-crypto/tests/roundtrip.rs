use fips204::ml_dsa_44;
use fips204::traits::{SerDes, Signer};
use pq_crypto::{commitment_hash, COMMIT_DOMAIN, PQ_PK_LEN, PQ_SIG_LEN};

#[test]
fn keygen_sign_verify_roundtrip() {
    sp_io::TestExternalities::default().execute_with(|| {
        let (pk, sk) = ml_dsa_44::try_keygen().expect("keygen");
        let msg = b"the quantum fox jumps over the lazy ECDSA";
        let sig = sk.try_sign(msg, &[]).expect("sign");
        let pk_bytes = pk.into_bytes();
        let sig_bytes: [u8; PQ_SIG_LEN] = sig;
        let ok = pq_crypto::pq_crypto::verify(&pk_bytes[..], &sig_bytes[..], msg);
        assert!(ok, "valid signature must verify");
    });
}

#[test]
fn flipped_byte_fails() {
    sp_io::TestExternalities::default().execute_with(|| {
        let (pk, sk) = ml_dsa_44::try_keygen().expect("keygen");
        let msg = b"x";
        let mut sig = sk.try_sign(msg, &[]).expect("sign");
        sig[0] ^= 0x01;
        let pk_bytes = pk.into_bytes();
        let ok = pq_crypto::pq_crypto::verify(&pk_bytes[..], &sig[..], msg);
        assert!(!ok, "tampered signature must not verify");
    });
}

#[test]
fn short_pubkey_fails() {
    sp_io::TestExternalities::default().execute_with(|| {
        let ok = pq_crypto::pq_crypto::verify(&[0u8; 10][..], &[0u8; PQ_SIG_LEN][..], b"x");
        assert!(!ok);
    });
}

#[test]
fn commitment_hash_is_domain_separated() {
    sp_io::TestExternalities::default().execute_with(|| {
        let pk = [7u8; PQ_PK_LEN];
        let h1 = commitment_hash(&pk);
        // A direct blake2 of the same bytes (without domain) must differ.
        let h2: sp_core::H256 = sp_io::hashing::blake2_256(&pk).into();
        assert_ne!(h1, h2);
        assert_eq!(COMMIT_DOMAIN, b"QL_PQ_COMMIT_V1");
    });
}
