#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

use alloc::vec::Vec;
use sp_core::H256;
use sp_runtime_interface::pass_by::PassFatPointerAndRead;

pub const PQ_PK_LEN: usize = 1312;
pub const PQ_SIG_LEN: usize = 2420;
pub const COMMIT_DOMAIN: &[u8] = b"QL_PQ_COMMIT_V1";

/// Blake2b-256 of `COMMIT_DOMAIN || pq_pubkey`. Stable across host/wasm
/// because it routes through `sp_io::hashing` (which already has a host fn).
pub fn commitment_hash(pq_pubkey: &[u8]) -> H256 {
    let mut input: Vec<u8> = Vec::with_capacity(COMMIT_DOMAIN.len() + pq_pubkey.len());
    input.extend_from_slice(COMMIT_DOMAIN);
    input.extend_from_slice(pq_pubkey);
    sp_io::hashing::blake2_256(&input).into()
}

#[sp_runtime_interface::runtime_interface]
pub trait PqCrypto {
    /// Verify an ML-DSA-44 signature. Empty FIPS-204 context.
    /// Returns false on any decoding or verification failure (no panics).
    fn verify(
        pubkey: PassFatPointerAndRead<&[u8]>,
        sig: PassFatPointerAndRead<&[u8]>,
        msg: PassFatPointerAndRead<&[u8]>,
    ) -> bool {
        use fips204::ml_dsa_44;
        use fips204::traits::{SerDes, Verifier};

        let Ok(pk_arr): Result<[u8; PQ_PK_LEN], _> = pubkey.try_into() else { return false; };
        let Ok(sig_arr): Result<[u8; PQ_SIG_LEN], _> = sig.try_into() else { return false; };
        let Ok(vk) = ml_dsa_44::PublicKey::try_from_bytes(pk_arr) else { return false; };
        vk.verify(msg, &sig_arr, &[])
    }
}
