//! # PQ Registry Pallet
//!
//! Lets a (classically signed) account commit to a hash of a future post-quantum
//! public key. This is the v1 "pre-commit" half of QuantumLeap's crypto-agility
//! story — users lock in `H(pq_pubkey)` now, then after a forkless runtime
//! upgrade reveal and spend with the underlying PQ keypair (v2's `pq-wallet`).
//!
//! Storage maps each `AccountId` to a single `H256` commitment. The pallet
//! exposes two extrinsics:
//! - `commit`: one-shot — fails if a commitment already exists.
//! - `recommit`: replaces an existing commitment — fails if none exists.
//!
//! Hashing convention (`commitment_hash` in `pq-crypto`) is
//! `blake2_256(b"QL_PQ_COMMIT_V1" || pq_pubkey)`. This pallet does not compute
//! the hash itself; callers commit whatever `H256` they want, and `pq-wallet`
//! in v2 enforces the binding between commitment and revealed pubkey.

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;
#[cfg(test)]
mod tests;

#[frame_support::pallet]
pub mod pallet {
	use frame_support::pallet_prelude::*;
	use frame_system::pallet_prelude::*;
	use sp_core::H256;

	#[pallet::config]
	pub trait Config: frame_system::Config {
		/// The overarching runtime event type.
		#[allow(deprecated)]
		type RuntimeEvent: From<Event<Self>>
			+ IsType<<Self as frame_system::Config>::RuntimeEvent>;
	}

	#[pallet::pallet]
	pub struct Pallet<T>(_);

	/// One commitment per account: `blake2_256(domain || pq_pubkey)`.
	#[pallet::storage]
	pub type Commitment<T: Config> =
		StorageMap<_, Blake2_128Concat, T::AccountId, H256, OptionQuery>;

	#[pallet::event]
	#[pallet::generate_deposit(pub(super) fn deposit_event)]
	pub enum Event<T: Config> {
		/// An account stored a fresh commitment.
		Committed { who: T::AccountId, hash: H256 },
		/// An account replaced an existing commitment.
		Recommitted { who: T::AccountId, new_hash: H256 },
	}

	#[pallet::error]
	pub enum Error<T> {
		/// `commit` was called but a commitment already exists for this account.
		AlreadyCommitted,
		/// `recommit` was called but no prior commitment exists for this account.
		NotCommitted,
	}

	#[pallet::call]
	impl<T: Config> Pallet<T> {
		/// Store a fresh PQ-pubkey commitment for the signer. One-shot — to
		/// replace an existing commitment use [`Pallet::recommit`].
		#[pallet::call_index(0)]
		#[pallet::weight({10_000})]
		pub fn commit(origin: OriginFor<T>, hash: H256) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(!Commitment::<T>::contains_key(&who), Error::<T>::AlreadyCommitted);
			Commitment::<T>::insert(&who, hash);
			Self::deposit_event(Event::Committed { who, hash });
			Ok(())
		}

		/// Replace the signer's existing PQ-pubkey commitment with `new_hash`.
		/// In v1 this is gated by the classical signature on the extrinsic;
		/// v2 enforces post-quantum semantics via `pq-wallet`.
		#[pallet::call_index(1)]
		#[pallet::weight({10_000})]
		pub fn recommit(origin: OriginFor<T>, new_hash: H256) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(Commitment::<T>::contains_key(&who), Error::<T>::NotCommitted);
			Commitment::<T>::insert(&who, new_hash);
			Self::deposit_event(Event::Recommitted { who, new_hash });
			Ok(())
		}
	}
}
