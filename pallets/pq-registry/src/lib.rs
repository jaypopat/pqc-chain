//! # PQ Registry Pallet
//!
//! Stores per-account commitments to a future post-quantum public key:
//! `H = blake2b_256("QL_PQ_COMMIT_V1" || pq_pubkey)`. The pubkey itself never
//! reaches the chain until first spend (see `pallet-pq-wallet`), keeping cold
//! storage HNDL-safe.
//!
//! - `commit`   — one-shot, classical-signed.
//! - `recommit` — rotate while still on the classical key (e.g. if the local
//!   PQ keygen environment is suspected compromised).

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;
#[cfg(test)]
mod tests;

#[frame_support::pallet]
pub mod pallet {
	use frame_support::pallet_prelude::*;
	use sp_core::H256;

	#[pallet::config]
	pub trait Config: frame_system::Config {
		#[allow(deprecated)]
		type RuntimeEvent: From<Event<Self>>
			+ IsType<<Self as frame_system::Config>::RuntimeEvent>;
	}

	#[pallet::pallet]
	pub struct Pallet<T>(_);

	#[pallet::storage]
	pub type Commitment<T: Config> =
		StorageMap<_, Blake2_128Concat, T::AccountId, H256, OptionQuery>;

	#[pallet::event]
	#[pallet::generate_deposit(pub(super) fn deposit_event)]
	pub enum Event<T: Config> {
		Committed { who: T::AccountId, hash: H256 },
		Recommitted { who: T::AccountId, new_hash: H256 },
	}

	#[pallet::error]
	pub enum Error<T> {
		AlreadyCommitted,
		NotCommitted,
	}

	#[pallet::call]
	impl<T: Config> Pallet<T> {
		// commit / recommit added in Tasks 6 + 7.
	}
}
