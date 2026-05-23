//! # PQ Wallet Pallet
//!
//! Lazy-reveal post-quantum wallet. In runtime v2 (after the forkless upgrade)
//! this pallet exposes a single unsigned extrinsic, `pq_transfer`, that:
//!
//! 1. On first use for an account, verifies the supplied `pq_pubkey` matches
//!    the previously stored commitment in `pallet-pq-registry`, and caches
//!    the pubkey in `Revealed`.
//! 2. On subsequent uses, requires the supplied pubkey to match the cached
//!    one exactly.
//! 3. Verifies the ML-DSA-44 signature over a domain-separated, canonical
//!    encoding of `(domain, chain_id, spec_version, from, to, amount, nonce)`
//!    using the `pq-crypto` host function.
//! 4. Increments the per-account nonce and executes the balance transfer.
//!
//! See `docs/superpowers/specs/2026-05-23-quantumleap-design.md` §4.3 for the
//! `pq_transfer` contract.

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;
#[cfg(test)]
mod tests;

extern crate alloc;

use alloc::vec::Vec;
use codec::Encode;
use frame_support::traits::Currency;

/// Domain-separation tag prefixed to every signed transfer message.
pub const TRANSFER_DOMAIN: &[u8] = b"QL_PQ_TRANSFER_V1";

/// Currency balance type alias.
pub type BalanceOf<T> =
	<<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

/// Canonical, deterministic encoding of a transfer message for ML-DSA signing.
///
/// Layout: raw `TRANSFER_DOMAIN` bytes followed by the SCALE-encoded tuple
/// `(chain_id, spec_version, from, to, amount, nonce)`. The domain tag is
/// prepended verbatim (not SCALE-length-prefixed) so the message is trivially
/// recognisable as a QuantumLeap PQ transfer payload. `spec_version` and
/// `chain_id` bind every signature to a specific runtime/chain, preventing
/// cross-chain or cross-upgrade replay.
pub fn encode_transfer_msg<T: Config>(
	from: &T::AccountId,
	to: &T::AccountId,
	amount: BalanceOf<T>,
	nonce: u64,
) -> Vec<u8> {
	use frame_support::traits::Get;
	let chain_id: u32 = T::ChainId::get();
	let spec_version: u32 = <T as frame_system::Config>::Version::get().spec_version;
	let mut out = Vec::with_capacity(TRANSFER_DOMAIN.len() + 64);
	out.extend_from_slice(TRANSFER_DOMAIN);
	(chain_id, spec_version, from, to, amount, nonce).encode_to(&mut out);
	out
}

#[frame_support::pallet]
pub mod pallet {
	use super::{BalanceOf, encode_transfer_msg};
	use frame_support::pallet_prelude::*;
	use frame_support::traits::{Currency, Get};
	use frame_system::pallet_prelude::*;

	#[pallet::config]
	pub trait Config: frame_system::Config + pallet_pq_registry::Config {
		/// The overarching runtime event type.
		#[allow(deprecated)]
		type RuntimeEvent: From<Event<Self>>
			+ IsType<<Self as frame_system::Config>::RuntimeEvent>;

		/// The currency used to settle `pq_transfer`s.
		type Currency: Currency<Self::AccountId>;

		/// Chain identifier, mixed into every signed message for replay protection.
		type ChainId: Get<u32>;
	}

	#[pallet::pallet]
	pub struct Pallet<T>(_);

	/// Cached ML-DSA-44 public key per account, populated on first `pq_transfer`.
	#[pallet::storage]
	pub type Revealed<T: Config> = StorageMap<
		_,
		Blake2_128Concat,
		T::AccountId,
		BoundedVec<u8, ConstU32<1312>>,
		OptionQuery,
	>;

	/// Replay-protection nonce; incremented after each successful `pq_transfer`.
	#[pallet::storage]
	pub type Nonce<T: Config> =
		StorageMap<_, Blake2_128Concat, T::AccountId, u64, ValueQuery>;

	#[pallet::event]
	#[pallet::generate_deposit(pub(super) fn deposit_event)]
	pub enum Event<T: Config> {
		/// The account's PQ pubkey was revealed and cached for the first time.
		Revealed { who: T::AccountId },
		/// A PQ-signed transfer was applied.
		PqTransfer { from: T::AccountId, to: T::AccountId, amount: BalanceOf<T> },
	}

	#[pallet::error]
	pub enum Error<T> {
		/// No prior commitment exists in `pallet-pq-registry` for this account.
		NoCommitment,
		/// The supplied pubkey does not hash to the stored commitment.
		CommitmentMismatch,
		/// The supplied pubkey differs from the previously revealed/cached one.
		PubkeyMismatch,
		/// The supplied nonce does not match the expected next nonce.
		BadNonce,
		/// The ML-DSA-44 signature failed to verify.
		BadSignature,
	}

	#[pallet::call]
	impl<T: Config> Pallet<T> {
		// pq_transfer implemented in Task 11.
	}
}
