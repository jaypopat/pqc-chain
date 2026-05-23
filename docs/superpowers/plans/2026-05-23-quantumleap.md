# QuantumLeap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Substrate solochain that boots on ECDSA, then forklessly upgrades its runtime to ML-DSA (FIPS-204) signature verification via `sudo.set_code`, with users who pre-commit a hash of their future PQ pubkey surviving the swap.

**Architecture:** `polkadot-sdk-solochain-template` base. Two custom pallets: `pallet-pq-registry` (in v1+v2, lets accounts commit `H(pq_pubkey)`) and `pallet-pq-wallet` (in v2 only, single `pq_transfer` extrinsic that does lazy reveal + verify + transfer atomically). The PQ verifier is exposed as an `sp_runtime_interface` host function — `fips204` runs natively in the node binary, not in WASM. Two runtimes (`runtime/v1`, `runtime/v2`) compiled to separate WASM blobs. v2 adds a `BaseCallFilter` rejecting classical `Balances::transfer*`.

**Tech Stack:** Rust (workspace), `polkadot-sdk = 2512.0.0`, `fips204 = 0.4.6` (host-side), `sp_runtime_interface` for the verifier, FRAME v2 macros, existing React/PAPI/Tailwind frontend, `just` for demo orchestration.

**Spec:** `docs/superpowers/specs/2026-05-23-quantumleap-design.md`

**Working assumptions for the engineer:**
- `cargo`, `rustc nightly`, `wasm32-unknown-unknown` target, and `protoc` are installed.
- Network has access to crates.io and `github.com/paritytech/polkadot-sdk`.
- All commits are conventional (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- After every task, run `cargo check --workspace` once before committing. If it fails, fix before moving on.

---

## Phase 0: Repo reset

### Task 1: Replace parachain template with solochain-template

**Files:**
- Delete: `runtime/` (parachain runtime), `network.toml`
- Create: full solochain skeleton (`node/`, `runtime/`, root `Cargo.toml`)

- [ ] **Step 1: Save the frontend, archive old runtime**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
# Keep frontend/ as-is; it survives the reset.
mkdir -p .archive
mv runtime .archive/parachain-runtime
mv network.toml .archive/
mv Cargo.lock .archive/
```

- [ ] **Step 2: Clone the solochain template into a temp dir and copy in**

```bash
cd /tmp
rm -rf polkadot-sdk-solochain-template
git clone --depth 1 --branch polkadot-stable2512 \
  https://github.com/paritytech/polkadot-sdk-solochain-template.git
cd polkadot-sdk-solochain-template
# Copy node/, runtime/, root Cargo.toml into our repo.
cp -r node /home/jay/Dev/pqc-hackathon/pqc-chain/
cp -r runtime /home/jay/Dev/pqc-hackathon/pqc-chain/runtime/
cp Cargo.toml /home/jay/Dev/pqc-hackathon/pqc-chain/Cargo.toml.template
cp rust-toolchain.toml /home/jay/Dev/pqc-hackathon/pqc-chain/rust-toolchain.toml
```

If the branch name doesn't exist, list available branches with `git ls-remote --heads https://github.com/paritytech/polkadot-sdk-solochain-template.git` and pick the latest `polkadot-stable*` branch.

- [ ] **Step 3: Merge root Cargo.toml**

Open `/home/jay/Dev/pqc-hackathon/pqc-chain/Cargo.toml.template` — copy its `[workspace]` and `[workspace.dependencies]` blocks into `/home/jay/Dev/pqc-hackathon/pqc-chain/Cargo.toml`. Then expand `[workspace] members` to:

```toml
[workspace]
members = [
    "node",
    "primitives/pq-crypto",
    "pallets/pq-registry",
    "pallets/pq-wallet",
    "runtime/v1",
    "runtime/v2",
    "tools/sign-cli",
]
resolver = "2"
```

Remove `Cargo.toml.template` after merge.

- [ ] **Step 4: Move template runtime to `runtime/v1`**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
mkdir -p runtime/v1
# `runtime/` from the template is now a flat crate. Move its contents into v1.
mv runtime/src runtime/v1/src
mv runtime/build.rs runtime/v1/build.rs
mv runtime/Cargo.toml runtime/v1/Cargo.toml
mv runtime/README.md runtime/v1/README.md 2>/dev/null || true
```

Edit `runtime/v1/Cargo.toml`: rename `name = "solochain-template-runtime"` → `name = "quantumleap-runtime-v1"`. Bump `version = "0.1.0"`.

- [ ] **Step 5: Update `node/Cargo.toml` to depend on v1**

In `node/Cargo.toml`, find the line referencing the runtime (something like `solochain-template-runtime = { path = "../runtime" }`) and change to:
```toml
quantumleap-runtime-v1 = { path = "../runtime/v1" }
```
Also update `node/src/*.rs` imports — find/replace `solochain_template_runtime` → `quantumleap_runtime_v1`.

- [ ] **Step 6: Verify it builds**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
cargo check -p quantumleap-runtime-v1
cargo check -p node  # or whatever node crate name the template uses (often `solochain-template-node`; rename to `quantumleap-node` if you like)
```
Expected: both succeed (warnings OK).

- [ ] **Step 7: Run a dev node and confirm blocks produce**

```bash
cargo run --release -p quantumleap-node -- --dev --tmp 2>&1 | head -50
```
Expected: log line `🎁 Prepared block for proposing at 1` within 30s. Kill with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: replace parachain template with solochain-template at runtime/v1"
```

---

## Phase 1: pq-crypto host function

### Task 2: Scaffold `primitives/pq-crypto`

**Files:**
- Create: `primitives/pq-crypto/Cargo.toml`
- Create: `primitives/pq-crypto/src/lib.rs`

- [ ] **Step 1: Write `primitives/pq-crypto/Cargo.toml`**

```toml
[package]
name = "pq-crypto"
version = "0.1.0"
edition = "2021"

[dependencies]
sp-runtime-interface = { version = "29.0.0", default-features = false }
sp-io = { version = "40.0.0", default-features = false }
sp-std = { version = "14.0.0", default-features = false }
sp-core = { version = "36.0.0", default-features = false }
# `fips204` is std-only and only pulled into the host binary, never WASM.
fips204 = { version = "0.4.6", optional = true }

[features]
default = ["std"]
std = [
    "dep:fips204",
    "sp-runtime-interface/std",
    "sp-io/std",
    "sp-std/std",
    "sp-core/std",
]
```

If the sp-* versions above don't match what `polkadot-sdk = "2512.0.0"` resolves to, fix by running `cargo tree -p quantumleap-runtime-v1 -e features --depth 1 | grep sp-` and updating to match. The polkadot-sdk umbrella also re-exports these; if you prefer, use `polkadot-sdk = { workspace = true, features = ["sp-runtime-interface", "sp-io", "sp-std", "sp-core"] }` and adjust the imports in `lib.rs` accordingly.

- [ ] **Step 2: Write `primitives/pq-crypto/src/lib.rs`**

```rust
#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

use alloc::vec::Vec;
use sp_core::H256;

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
    fn verify(pubkey: &[u8], sig: &[u8], msg: &[u8]) -> bool {
        use fips204::ml_dsa_44;
        use fips204::traits::{SerDes, Verifier};

        let Ok(pk_arr): Result<[u8; PQ_PK_LEN], _> = pubkey.try_into() else { return false; };
        let Ok(sig_arr): Result<[u8; PQ_SIG_LEN], _> = sig.try_into() else { return false; };
        let Ok(vk) = ml_dsa_44::PublicKey::try_from_bytes(pk_arr) else { return false; };
        vk.verify(msg, &sig_arr, &[])
    }
}
```

`#[runtime_interface]` generates `pub mod pq_crypto { pub fn verify(...) -> bool { ... } }` — callers write `pq_crypto::verify(...)`. The native impl is what's in the `fn verify` body; the WASM-side stub traps to the host via the externalities table.

- [ ] **Step 3: Verify it builds in both std and no_std modes**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
cargo check -p pq-crypto                     # std
cargo check -p pq-crypto --no-default-features --target wasm32-unknown-unknown
```
Expected: both succeed. If the wasm build complains about `fips204`, that confirms it's correctly gated behind `std` (the `optional = true` + `"dep:fips204"` in std feature should keep it out of the no_std build).

- [ ] **Step 4: Commit**

```bash
git add primitives/
git commit -m "feat(pq-crypto): host function for ML-DSA-44 verification via sp_runtime_interface"
```

### Task 3: Unit test the host function natively

**Files:**
- Create: `primitives/pq-crypto/tests/roundtrip.rs`

- [ ] **Step 1: Write a std-only test using fips204 directly**

```rust
// primitives/pq-crypto/tests/roundtrip.rs
use fips204::ml_dsa_44;
use fips204::traits::{SerDes, Signer};
use pq_crypto::{commitment_hash, COMMIT_DOMAIN, PQ_PK_LEN, PQ_SIG_LEN};

#[test]
fn keygen_sign_verify_roundtrip() {
    let (pk, sk) = ml_dsa_44::try_keygen().expect("keygen");
    let msg = b"the quantum fox jumps over the lazy ECDSA";
    let sig = sk.try_sign(msg, &[]).expect("sign");
    let pk_bytes = pk.into_bytes();
    let sig_bytes: [u8; PQ_SIG_LEN] = sig;
    // Call our host fn body directly (it's just a function when "std" is enabled).
    let ok = pq_crypto::pq_crypto::verify(&pk_bytes, &sig_bytes, msg);
    assert!(ok, "valid signature must verify");
}

#[test]
fn flipped_byte_fails() {
    let (pk, sk) = ml_dsa_44::try_keygen().expect("keygen");
    let msg = b"x";
    let mut sig = sk.try_sign(msg, &[]).expect("sign");
    sig[0] ^= 0x01;
    let pk_bytes = pk.into_bytes();
    let ok = pq_crypto::pq_crypto::verify(&pk_bytes, &sig, msg);
    assert!(!ok, "tampered signature must not verify");
}

#[test]
fn short_pubkey_fails() {
    let ok = pq_crypto::pq_crypto::verify(&[0u8; 10], &[0u8; PQ_SIG_LEN], b"x");
    assert!(!ok);
}

#[test]
fn commitment_hash_is_domain_separated() {
    let pk = [7u8; PQ_PK_LEN];
    let h1 = commitment_hash(&pk);
    // A direct blake2 of the same bytes (without domain) must differ.
    let h2: sp_core::H256 = sp_io::hashing::blake2_256(&pk).into();
    assert_ne!(h1, h2);
    assert_eq!(COMMIT_DOMAIN, b"QL_PQ_COMMIT_V1");
}
```

Note: `pq_crypto::pq_crypto::verify` is the generated submodule path from `#[runtime_interface]`. Yes, it looks doubled — that's the macro's output. If the engineer used `polkadot-sdk` umbrella deps, the path is the same.

- [ ] **Step 2: Run it**

```bash
cargo test -p pq-crypto --tests
```
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add primitives/pq-crypto/tests/
git commit -m "test(pq-crypto): roundtrip + tamper + length + domain-separation"
```

### Task 4: Register the host function in the node

**Files:**
- Modify: `node/Cargo.toml`, `node/src/service.rs` (or `node/src/command.rs`)

- [ ] **Step 1: Add `pq-crypto` to node deps**

In `node/Cargo.toml`, under `[dependencies]`:
```toml
pq-crypto = { path = "../primitives/pq-crypto" }
```
(No features needed — node is std, so `default = ["std"]` kicks in.)

- [ ] **Step 2: Wire the host fn into the executor**

Open `node/src/service.rs`. Find the `sc_executor::WasmExecutor` or `RuntimeExecutor` type — in the polkadot-sdk solochain-template it's usually defined as something like:

```rust
pub(crate) type RuntimeExecutor = sc_executor::WasmExecutor<sp_io::SubstrateHostFunctions>;
```

Replace with a tuple including our host fn:

```rust
pub(crate) type RuntimeExecutor = sc_executor::WasmExecutor<(
    sp_io::SubstrateHostFunctions,
    pq_crypto::pq_crypto::HostFunctions,
)>;
```

`HostFunctions` is the type generated by `#[runtime_interface]`. The double `pq_crypto::pq_crypto` is the crate + generated module again.

If the template uses a `NativeElseWasmExecutor` instead, the override is on the `HostFunctions` associated type in the `NativeExecutionDispatch` impl — same pattern, add our type to the tuple.

- [ ] **Step 3: Build the node**

```bash
cargo build --release -p quantumleap-node 2>&1 | tail -20
```
Expected: success.

- [ ] **Step 4: Start it and confirm no host-fn errors**

```bash
./target/release/quantumleap-node --dev --tmp 2>&1 | head -30
```
Expected: blocks produce. Kill with Ctrl-C. No "missing host function" warnings.

- [ ] **Step 5: Commit**

```bash
git add node/
git commit -m "feat(node): register pq_crypto host function in WasmExecutor"
```

---

## Phase 2: pallet-pq-registry

### Task 5: Scaffold `pallet-pq-registry`

**Files:**
- Create: `pallets/pq-registry/Cargo.toml`
- Create: `pallets/pq-registry/src/lib.rs`
- Create: `pallets/pq-registry/src/mock.rs`
- Create: `pallets/pq-registry/src/tests.rs`

- [ ] **Step 1: `pallets/pq-registry/Cargo.toml`**

```toml
[package]
name = "pallet-pq-registry"
version = "0.1.0"
edition = "2021"

[dependencies]
codec = { package = "parity-scale-codec", version = "3.7.5", default-features = false, features = ["derive"] }
scale-info = { version = "2.11.6", default-features = false, features = ["derive"] }
frame-support = { version = "40.0.0", default-features = false }
frame-system = { version = "40.0.0", default-features = false }
sp-core = { version = "36.0.0", default-features = false }
sp-runtime = { version = "41.0.0", default-features = false }
pq-crypto = { path = "../../primitives/pq-crypto", default-features = false }

[dev-dependencies]
sp-io = { version = "40.0.0" }

[features]
default = ["std"]
std = [
    "codec/std", "scale-info/std",
    "frame-support/std", "frame-system/std",
    "sp-core/std", "sp-runtime/std",
    "pq-crypto/std",
]
runtime-benchmarks = []
try-runtime = []
```

Same caveat as Task 2: if these `frame-*` versions don't match the workspace's polkadot-sdk resolution, run `cargo tree -p quantumleap-runtime-v1 -e features --depth 1` to pin versions.

- [ ] **Step 2: `pallets/pq-registry/src/lib.rs` skeleton**

```rust
#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)] mod mock;
#[cfg(test)] mod tests;

#[frame_support::pallet]
pub mod pallet {
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use sp_core::H256;

    #[pallet::config]
    pub trait Config: frame_system::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::storage]
    pub type Commitment<T: Config> = StorageMap<
        _, Blake2_128Concat,
        T::AccountId, H256,
        OptionQuery,
    >;

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
        // commit / recommit implemented in Tasks 6 + 7
    }
}
```

- [ ] **Step 3: `pallets/pq-registry/src/mock.rs`**

```rust
use crate as pallet_pq_registry;
use frame_support::{derive_impl, traits::ConstU16};
use sp_runtime::BuildStorage;

type Block = frame_system::mocking::MockBlock<Test>;

frame_support::construct_runtime!(
    pub enum Test {
        System: frame_system,
        PqRegistry: pallet_pq_registry,
    }
);

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Block = Block;
    type SS58Prefix = ConstU16<42>;
}

impl pallet_pq_registry::Config for Test {
    type RuntimeEvent = RuntimeEvent;
}

pub fn new_test_ext() -> sp_io::TestExternalities {
    let t = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();
    let mut ext = sp_io::TestExternalities::new(t);
    ext.execute_with(|| System::set_block_number(1));
    ext
}
```

- [ ] **Step 4: Empty `pallets/pq-registry/src/tests.rs`**

```rust
use crate::{mock::*, *};
use frame_support::{assert_noop, assert_ok};
use sp_core::H256;
```

- [ ] **Step 5: Build**

```bash
cargo check -p pallet-pq-registry
cargo check -p pallet-pq-registry --no-default-features --target wasm32-unknown-unknown
```
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add pallets/pq-registry
git commit -m "feat(pq-registry): scaffold pallet with mock and empty test file"
```

### Task 6: Implement `commit` (TDD)

**Files:**
- Modify: `pallets/pq-registry/src/lib.rs`, `pallets/pq-registry/src/tests.rs`

- [ ] **Step 1: Write failing tests**

Append to `pallets/pq-registry/src/tests.rs`:
```rust
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
```

- [ ] **Step 2: Run them — they must fail to compile**

```bash
cargo test -p pallet-pq-registry --tests 2>&1 | tail -10
```
Expected: compile error `no function 'commit' in PqRegistry`.

- [ ] **Step 3: Add `commit` to the pallet**

Inside the `#[pallet::call]` block in `lib.rs`:
```rust
#[pallet::call_index(0)]
#[pallet::weight({10_000})]  // hardcoded for hackathon; real weight via benchmarking
pub fn commit(origin: OriginFor<T>, hash: H256) -> DispatchResult {
    let who = ensure_signed(origin)?;
    ensure!(!Commitment::<T>::contains_key(&who), Error::<T>::AlreadyCommitted);
    Commitment::<T>::insert(&who, hash);
    Self::deposit_event(Event::Committed { who, hash });
    Ok(())
}
```

- [ ] **Step 4: Run tests, both must pass**

```bash
cargo test -p pallet-pq-registry --tests
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add pallets/pq-registry
git commit -m "feat(pq-registry): commit extrinsic with one-shot semantics"
```

### Task 7: Implement `recommit` (TDD)

**Files:**
- Modify: `pallets/pq-registry/src/lib.rs`, `pallets/pq-registry/src/tests.rs`

- [ ] **Step 1: Write failing tests**

Append to `tests.rs`:
```rust
#[test]
fn recommit_replaces_hash_and_emits_event() {
    new_test_ext().execute_with(|| {
        let h1 = H256::from([1u8; 32]);
        let h2 = H256::from([2u8; 32]);
        assert_ok!(PqRegistry::commit(RuntimeOrigin::signed(1), h1));
        assert_ok!(PqRegistry::recommit(RuntimeOrigin::signed(1), h2));
        assert_eq!(Commitment::<Test>::get(&1), Some(h2));
        System::assert_last_event(Event::Recommitted { who: 1, new_hash: h2 }.into());
    });
}

#[test]
fn recommit_without_prior_commit_fails() {
    new_test_ext().execute_with(|| {
        assert_noop!(
            PqRegistry::recommit(RuntimeOrigin::signed(1), H256::from([2u8; 32])),
            Error::<Test>::NotCommitted
        );
    });
}
```

- [ ] **Step 2: Run — should fail compile**

```bash
cargo test -p pallet-pq-registry --tests 2>&1 | tail -5
```
Expected: `no function 'recommit'`.

- [ ] **Step 3: Implement**

Append to the `#[pallet::call]` block:
```rust
#[pallet::call_index(1)]
#[pallet::weight({10_000})]
pub fn recommit(origin: OriginFor<T>, new_hash: H256) -> DispatchResult {
    let who = ensure_signed(origin)?;
    ensure!(Commitment::<T>::contains_key(&who), Error::<T>::NotCommitted);
    Commitment::<T>::insert(&who, new_hash);
    Self::deposit_event(Event::Recommitted { who, new_hash });
    Ok(())
}
```

- [ ] **Step 4: Tests pass**

```bash
cargo test -p pallet-pq-registry --tests
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add pallets/pq-registry
git commit -m "feat(pq-registry): recommit extrinsic (v1 classical-signed)"
```

### Task 8: Wire `pallet-pq-registry` into runtime v1

**Files:**
- Modify: `runtime/v1/Cargo.toml`, `runtime/v1/src/lib.rs`

- [ ] **Step 1: Add dep in `runtime/v1/Cargo.toml`**

Under `[dependencies]`:
```toml
pallet-pq-registry = { path = "../../pallets/pq-registry", default-features = false }
```
Under `[features] std = [...]`, add `"pallet-pq-registry/std",`.

- [ ] **Step 2: Edit `runtime/v1/src/lib.rs`**

Find the `construct_runtime!` macro. Add `PqRegistry: pallet_pq_registry,` as a new pallet entry.

Above `construct_runtime!`, add the Config impl:
```rust
impl pallet_pq_registry::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
}
```

- [ ] **Step 3: Bump spec_version to 100 explicitly**

Find the `pub const VERSION: RuntimeVersion = RuntimeVersion { ... }` block. Set:
```rust
spec_name: create_runtime_str!("quantumleap"),
impl_name: create_runtime_str!("quantumleap"),
authoring_version: 1,
spec_version: 100,
impl_version: 1,
transaction_version: 1,
state_version: 1,
```
(Other fields untouched.)

- [ ] **Step 4: Build**

```bash
cargo build --release -p quantumleap-runtime-v1 2>&1 | tail -5
cargo build --release -p quantumleap-node 2>&1 | tail -5
```
Expected: both succeed.

- [ ] **Step 5: Smoke test the pallet via the running node**

Start the node, then in another terminal use `polkadot-js-apps` (https://polkadot.js.org/apps/) → connect to `ws://127.0.0.1:9944` → Developer → Extrinsics → `pqRegistry.commit` with any H256 from Alice. Confirm `Committed` event appears.

Or via CLI with `subxt`:
```bash
# Just confirm via logs: the node should print "Imported #N" with the extrinsic.
```
Lightweight check is enough — proper end-to-end is in Task 14.

- [ ] **Step 6: Commit**

```bash
git add runtime/v1
git commit -m "feat(runtime/v1): include pallet-pq-registry; spec_version=100"
```

---

## Phase 3: pallet-pq-wallet

### Task 9: Scaffold `pallet-pq-wallet`

**Files:**
- Create: `pallets/pq-wallet/Cargo.toml`
- Create: `pallets/pq-wallet/src/lib.rs`
- Create: `pallets/pq-wallet/src/mock.rs`
- Create: `pallets/pq-wallet/src/tests.rs`

- [ ] **Step 1: `pallets/pq-wallet/Cargo.toml`**

```toml
[package]
name = "pallet-pq-wallet"
version = "0.1.0"
edition = "2021"

[dependencies]
codec = { package = "parity-scale-codec", version = "3.7.5", default-features = false, features = ["derive"] }
scale-info = { version = "2.11.6", default-features = false, features = ["derive"] }
frame-support = { version = "40.0.0", default-features = false }
frame-system = { version = "40.0.0", default-features = false }
sp-core = { version = "36.0.0", default-features = false }
sp-runtime = { version = "41.0.0", default-features = false }
sp-std = { version = "14.0.0", default-features = false }
pallet-balances = { version = "40.0.0", default-features = false }
pallet-pq-registry = { path = "../pq-registry", default-features = false }
pq-crypto = { path = "../../primitives/pq-crypto", default-features = false }

[dev-dependencies]
sp-io = { version = "40.0.0" }
pallet-balances = { version = "40.0.0" }
fips204 = { version = "0.4.6" }

[features]
default = ["std"]
std = [
    "codec/std", "scale-info/std",
    "frame-support/std", "frame-system/std",
    "sp-core/std", "sp-runtime/std", "sp-std/std",
    "pallet-balances/std",
    "pallet-pq-registry/std",
    "pq-crypto/std",
]
```

- [ ] **Step 2: `pallets/pq-wallet/src/lib.rs` skeleton**

```rust
#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)] mod mock;
#[cfg(test)] mod tests;

use codec::Encode;
use frame_support::traits::Currency;
use sp_std::vec::Vec;

pub const TRANSFER_DOMAIN: &[u8] = b"QL_PQ_TRANSFER_V1";

pub type BalanceOf<T> =
    <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

pub fn encode_transfer_msg<T: Config>(
    from: &T::AccountId,
    to: &T::AccountId,
    amount: BalanceOf<T>,
    nonce: u64,
) -> Vec<u8> {
    let chain_id: u32 = T::ChainId::get();
    let spec_version: u32 = <T as frame_system::Config>::Version::get().spec_version;
    (TRANSFER_DOMAIN, chain_id, spec_version, from, to, amount, nonce).encode()
}

#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use frame_support::traits::{Currency, ExistenceRequirement, Get};

    #[pallet::config]
    pub trait Config: frame_system::Config + pallet_pq_registry::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type Currency: Currency<Self::AccountId>;
        type ChainId: Get<u32>;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::storage]
    pub type Revealed<T: Config> = StorageMap<
        _, Blake2_128Concat,
        T::AccountId, BoundedVec<u8, ConstU32<1312>>,
        OptionQuery,
    >;

    #[pallet::storage]
    pub type Nonce<T: Config> = StorageMap<
        _, Blake2_128Concat,
        T::AccountId, u64,
        ValueQuery,
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        Revealed { who: T::AccountId },
        PqTransfer { from: T::AccountId, to: T::AccountId, amount: BalanceOf<T> },
    }

    #[pallet::error]
    pub enum Error<T> {
        NoCommitment,
        CommitmentMismatch,
        PubkeyMismatch,
        BadNonce,
        BadSignature,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        // pq_transfer implemented in Task 11
    }
}
```

- [ ] **Step 3: `pallets/pq-wallet/src/mock.rs`**

```rust
use crate as pallet_pq_wallet;
use frame_support::{derive_impl, parameter_types, traits::{ConstU16, ConstU64}};
use sp_runtime::BuildStorage;

pub type AccountId = u64;
pub type Balance = u128;
type Block = frame_system::mocking::MockBlock<Test>;

frame_support::construct_runtime!(
    pub enum Test {
        System: frame_system,
        Balances: pallet_balances,
        PqRegistry: pallet_pq_registry,
        PqWallet: pallet_pq_wallet,
    }
);

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Block = Block;
    type AccountId = AccountId;
    type SS58Prefix = ConstU16<42>;
    type AccountData = pallet_balances::AccountData<Balance>;
}

#[derive_impl(pallet_balances::config_preludes::TestDefaultConfig)]
impl pallet_balances::Config for Test {
    type Balance = Balance;
    type AccountStore = System;
    type ExistentialDeposit = ConstU64<1>;
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
    }
    .assimilate_storage(&mut t)
    .unwrap();
    let mut ext = sp_io::TestExternalities::new(t);
    ext.execute_with(|| System::set_block_number(1));
    ext
}
```

The `ConstU64<1>` for `ExistentialDeposit` may need to be `ConstU128<1>` depending on the polkadot-sdk version — match whatever `pallet_balances::Config` requires (`type ExistentialDeposit: Get<Self::Balance>`).

- [ ] **Step 4: Empty tests file**

```rust
// pallets/pq-wallet/src/tests.rs
use crate::{mock::*, *};
use frame_support::{assert_noop, assert_ok};
use fips204::ml_dsa_44;
use fips204::traits::{SerDes, Signer};

/// Helper: generate a keypair and commit it for `account`.
fn setup_committed_account(account: AccountId) -> (ml_dsa_44::PublicKey, ml_dsa_44::PrivateKey) {
    let (pk, sk) = ml_dsa_44::try_keygen().unwrap();
    let pk_bytes = pk.clone().into_bytes();
    let hash = pq_crypto::commitment_hash(&pk_bytes);
    assert_ok!(PqRegistry::commit(RuntimeOrigin::signed(account), hash));
    (pk, sk)
}
```

- [ ] **Step 5: Build**

```bash
cargo check -p pallet-pq-wallet
```
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add pallets/pq-wallet
git commit -m "feat(pq-wallet): scaffold pallet with storage, errors, events, mock"
```

### Task 10: Test the message encoder (TDD)

**Files:**
- Modify: `pallets/pq-wallet/src/tests.rs`

- [ ] **Step 1: Test that the encoded message is deterministic and domain-separated**

Append to `tests.rs`:
```rust
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
```

- [ ] **Step 2: Run**

```bash
cargo test -p pallet-pq-wallet --tests encode_transfer_msg_is_stable
```
Expected: PASS (the helper is already implemented; this is just confirming it).

- [ ] **Step 3: Commit**

```bash
git add pallets/pq-wallet/src/tests.rs
git commit -m "test(pq-wallet): canonical signing payload is stable + domain-separated"
```

### Task 11: Implement `pq_transfer` with lazy reveal (TDD)

**Files:**
- Modify: `pallets/pq-wallet/src/lib.rs`, `pallets/pq-wallet/src/tests.rs`

- [ ] **Step 1: Write failing tests covering all paths**

Append to `tests.rs`:
```rust
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
            1, 2, amount, nonce,
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
                1, 2, 50, 0,
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
                1, 2, 50, 0,
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
                1, 2, 10, nonce,
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
                1, 2, 10, 5,
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
                1, 2, 10, 0,
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
            RuntimeOrigin::signed(1),  // must be RuntimeOrigin::none()
            1, 2, 10, 0,
            pk_bytes.try_into().unwrap(),
            sig.try_into().unwrap(),
        ).is_err());
    });
}
```

- [ ] **Step 2: Run — all should fail to compile**

```bash
cargo test -p pallet-pq-wallet --tests 2>&1 | tail -5
```
Expected: compile error `no function 'pq_transfer'`.

- [ ] **Step 3: Implement `pq_transfer`**

Inside the `#[pallet::call]` block in `lib.rs`:
```rust
#[pallet::call_index(0)]
#[pallet::weight({100_000})]
pub fn pq_transfer(
    origin: OriginFor<T>,
    from: T::AccountId,
    to: T::AccountId,
    amount: BalanceOf<T>,
    nonce: u64,
    pq_pubkey: BoundedVec<u8, ConstU32<1312>>,
    sig: BoundedVec<u8, ConstU32<2420>>,
) -> DispatchResult {
    ensure_none(origin)?;

    // 1. Reveal-if-needed.
    if let Some(stored) = Revealed::<T>::get(&from) {
        ensure!(stored.as_slice() == pq_pubkey.as_slice(), Error::<T>::PubkeyMismatch);
    } else {
        let commitment = pallet_pq_registry::Commitment::<T>::get(&from)
            .ok_or(Error::<T>::NoCommitment)?;
        ensure!(
            commitment == pq_crypto::commitment_hash(&pq_pubkey),
            Error::<T>::CommitmentMismatch,
        );
        Revealed::<T>::insert(&from, pq_pubkey.clone());
        Self::deposit_event(Event::Revealed { who: from.clone() });
    }

    // 2. Nonce.
    let expected = Nonce::<T>::get(&from);
    ensure!(nonce == expected, Error::<T>::BadNonce);

    // 3. Signature (host fn).
    let msg = encode_transfer_msg::<T>(&from, &to, amount, nonce);
    ensure!(
        pq_crypto::pq_crypto::verify(&pq_pubkey, &sig, &msg),
        Error::<T>::BadSignature,
    );

    Nonce::<T>::insert(&from, nonce + 1);
    T::Currency::transfer(&from, &to, amount, ExistenceRequirement::AllowDeath)?;
    Self::deposit_event(Event::PqTransfer { from, to, amount });
    Ok(())
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p pallet-pq-wallet --tests
```
Expected: 7 passed (including the encode test from Task 10).

If `BoundedVec::try_from(Vec)` in the tests fails to compile, the import is `use frame_support::BoundedVec;` and the `try_into()` call works once the trait is imported via `use core::convert::TryInto;` (usually implicit in 2021 edition).

- [ ] **Step 5: Commit**

```bash
git add pallets/pq-wallet
git commit -m "feat(pq-wallet): pq_transfer with lazy reveal + sig verify via host fn"
```

### Task 12: Implement `ValidateUnsigned` for tx-pool gating

**Files:**
- Modify: `pallets/pq-wallet/src/lib.rs`

- [ ] **Step 1: Add the `ValidateUnsigned` impl**

Inside `#[frame_support::pallet]` mod, after the `#[pallet::call]` block:
```rust
#[pallet::validate_unsigned]
impl<T: Config> ValidateUnsigned for Pallet<T> {
    type Call = Call<T>;

    fn validate_unsigned(
        _source: TransactionSource,
        call: &Self::Call,
    ) -> TransactionValidity {
        let Call::pq_transfer { from, to, amount, nonce, pq_pubkey, sig } = call
            else { return InvalidTransaction::Call.into(); };

        if let Some(stored) = Revealed::<T>::get(from) {
            if stored.as_slice() != pq_pubkey.as_slice() {
                return InvalidTransaction::Custom(1).into();
            }
        } else {
            let Some(commitment) = pallet_pq_registry::Commitment::<T>::get(from)
                else { return InvalidTransaction::Custom(2).into(); };
            if commitment != pq_crypto::commitment_hash(pq_pubkey) {
                return InvalidTransaction::Custom(3).into();
            }
        }

        let msg = super::encode_transfer_msg::<T>(from, to, *amount, *nonce);
        if !pq_crypto::pq_crypto::verify(pq_pubkey, sig, &msg) {
            return InvalidTransaction::BadProof.into();
        }

        ValidTransaction::with_tag_prefix("PqTransfer")
            .priority(100)
            .and_provides((from.clone(), *nonce))
            .longevity(64)
            .propagate(true)
            .build()
    }
}
```

Needed imports (top of pallet mod):
```rust
use sp_runtime::transaction_validity::{
    InvalidTransaction, TransactionSource, TransactionValidity, ValidTransaction,
};
use frame_support::unsigned::ValidateUnsigned;
```

- [ ] **Step 2: Build**

```bash
cargo check -p pallet-pq-wallet
```
Expected: success.

- [ ] **Step 3: Optional smoke test of validate_unsigned**

Add to `tests.rs`:
```rust
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
            from: 1, to: 2, amount: 10, nonce: 0,
            pq_pubkey: pk_bytes, sig,
        };
        let res = PqWallet::validate_unsigned(
            sp_runtime::transaction_validity::TransactionSource::External,
            &call,
        );
        assert!(res.is_err());
    });
}
```
Imports at top of tests.rs:
```rust
use frame_support::pallet_prelude::*;
use frame_support::unsigned::ValidateUnsigned;
use sp_runtime::transaction_validity::TransactionSource;
```

```bash
cargo test -p pallet-pq-wallet --tests
```
Expected: 8 passed.

- [ ] **Step 4: Commit**

```bash
git add pallets/pq-wallet
git commit -m "feat(pq-wallet): ValidateUnsigned gates tx pool against spam"
```

---

## Phase 4: Runtime v2

### Task 13: Fork `runtime/v1` to `runtime/v2`

**Files:**
- Create: `runtime/v2/` (full copy of v1)

- [ ] **Step 1: Copy**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
cp -r runtime/v1 runtime/v2
```

- [ ] **Step 2: Rename the crate**

In `runtime/v2/Cargo.toml`, change `name = "quantumleap-runtime-v1"` → `name = "quantumleap-runtime-v2"`. Bump version.

- [ ] **Step 3: Add new deps**

In `runtime/v2/Cargo.toml`, under `[dependencies]`:
```toml
pallet-pq-wallet = { path = "../../pallets/pq-wallet", default-features = false }
pq-crypto = { path = "../../primitives/pq-crypto", default-features = false }
```
Under `[features] std = [...]`, append `"pallet-pq-wallet/std", "pq-crypto/std",`.

- [ ] **Step 4: Build**

```bash
cargo check -p quantumleap-runtime-v2
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add runtime/v2
git commit -m "chore(runtime/v2): copy of v1 as starting point"
```

### Task 14: Wire pallet-pq-wallet + BaseCallFilter into v2

**Files:**
- Modify: `runtime/v2/src/lib.rs`

- [ ] **Step 1: Add ChainId param and PqWallet Config impl**

Near the top of `lib.rs` (in the `parameter_types!` block or add a new one):
```rust
parameter_types! {
    pub const QlChainId: u32 = 42;
}
```

After the existing pallet Config impls, add:
```rust
impl pallet_pq_wallet::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type Currency = Balances;
    type ChainId = QlChainId;
}
```

- [ ] **Step 2: Add the BaseCallFilter**

After Config impls, before `construct_runtime!`:
```rust
use frame_support::traits::Contains;

pub struct PqBaseCallFilter;
impl Contains<RuntimeCall> for PqBaseCallFilter {
    fn contains(call: &RuntimeCall) -> bool {
        !matches!(call,
            RuntimeCall::Balances(pallet_balances::Call::transfer_allow_death { .. })
            | RuntimeCall::Balances(pallet_balances::Call::transfer_keep_alive { .. })
            | RuntimeCall::Balances(pallet_balances::Call::transfer_all { .. })
        )
    }
}
```

In the `frame_system::Config for Runtime` impl, change:
```rust
type BaseCallFilter = frame_support::traits::Everything;
```
to:
```rust
type BaseCallFilter = PqBaseCallFilter;
```

- [ ] **Step 3: Add `PqWallet` to `construct_runtime!`**

```rust
construct_runtime!(
    pub enum Runtime {
        System: frame_system,
        // ... existing pallets ...
        PqRegistry: pallet_pq_registry,
        PqWallet: pallet_pq_wallet,
    }
);
```

- [ ] **Step 4: Bump versions**

```rust
spec_version: 200,
transaction_version: 2,
```

- [ ] **Step 5: Build**

```bash
cargo build --release -p quantumleap-runtime-v2 2>&1 | tail -10
```
Expected: success. The resulting WASM blob is at `target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm`.

- [ ] **Step 6: Commit**

```bash
git add runtime/v2
git commit -m "feat(runtime/v2): pq-wallet + BaseCallFilter rejecting classical transfers; spec=200, tx=2"
```

---

## Phase 5: sign-cli

### Task 15: Scaffold `tools/sign-cli`

**Files:**
- Create: `tools/sign-cli/Cargo.toml`
- Create: `tools/sign-cli/src/main.rs`

- [ ] **Step 1: Cargo.toml**

```toml
[package]
name = "sign-cli"
version = "0.1.0"
edition = "2021"

[dependencies]
fips204 = { version = "0.4.6", features = ["ml-dsa-44", "default-rng"] }
parity-scale-codec = { version = "3.7.5", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
hex = "0.4"
clap = { version = "4", features = ["derive"] }
sp-core = "36.0.0"
blake2 = "0.10"
```

- [ ] **Step 2: `main.rs` skeleton**

```rust
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};

#[derive(Parser)]
#[command(name = "sign-cli", about = "QuantumLeap PQ signing helper")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    Keygen { #[arg(long)] out: String },
    CommitHash { #[arg(long)] pk: String },
    SignTransfer {
        #[arg(long)] sk: String,
        #[arg(long)] from: String,
        #[arg(long)] to: String,
        #[arg(long)] amount: u128,
        #[arg(long)] nonce: u64,
        #[arg(long, default_value = "42")] chain_id: u32,
        #[arg(long, default_value = "200")] spec_version: u32,
        #[arg(long)] out: String,
    },
}

#[derive(Serialize, Deserialize)]
struct Keypair { pk_hex: String, sk_hex: String }

#[derive(Serialize, Deserialize)]
struct SignedTransfer {
    from: String, to: String, amount: u128, nonce: u64,
    pubkey_hex: String, sig_hex: String, msg_hex: String,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Keygen { out } => cmd_keygen(&out),
        Cmd::CommitHash { pk } => cmd_commit_hash(&pk),
        Cmd::SignTransfer { sk, from, to, amount, nonce, chain_id, spec_version, out }
            => cmd_sign_transfer(&sk, &from, &to, amount, nonce, chain_id, spec_version, &out),
    }
}

fn cmd_keygen(_out: &str) -> anyhow::Result<()> { todo!() }
fn cmd_commit_hash(_pk: &str) -> anyhow::Result<()> { todo!() }
fn cmd_sign_transfer(
    _sk: &str, _from: &str, _to: &str, _amount: u128, _nonce: u64,
    _chain_id: u32, _spec_version: u32, _out: &str,
) -> anyhow::Result<()> { todo!() }
```

Add `anyhow = "1"` to `Cargo.toml`.

- [ ] **Step 3: Build to confirm skeleton compiles**

```bash
cargo build -p sign-cli
```

- [ ] **Step 4: Commit**

```bash
git add tools/sign-cli
git commit -m "chore(sign-cli): scaffold clap subcommands"
```

### Task 16: Implement `keygen` (TDD)

**Files:**
- Modify: `tools/sign-cli/src/main.rs`
- Create: `tools/sign-cli/tests/cli.rs`

- [ ] **Step 1: Add `assert_cmd` test dep**

In `tools/sign-cli/Cargo.toml`:
```toml
[dev-dependencies]
assert_cmd = "2"
tempfile = "3"
serde_json = "1"
```

- [ ] **Step 2: Write failing integration test**

```rust
// tools/sign-cli/tests/cli.rs
use assert_cmd::Command;
use tempfile::tempdir;

#[test]
fn keygen_writes_valid_json_with_correct_lengths() {
    let dir = tempdir().unwrap();
    let out = dir.path().join("alice.json");
    Command::cargo_bin("sign-cli").unwrap()
        .args(["keygen", "--out", out.to_str().unwrap()])
        .assert().success();

    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&out).unwrap()).unwrap();
    let pk_hex = json["pk_hex"].as_str().unwrap();
    let sk_hex = json["sk_hex"].as_str().unwrap();
    assert_eq!(pk_hex.len(), 1312 * 2); // hex-encoded
    assert!(sk_hex.len() > 0);
}
```

- [ ] **Step 3: Run — should fail with `not yet implemented`**

```bash
cargo test -p sign-cli --test cli 2>&1 | tail -5
```

- [ ] **Step 4: Implement `cmd_keygen`**

Replace the stub in `main.rs`:
```rust
fn cmd_keygen(out: &str) -> anyhow::Result<()> {
    use fips204::ml_dsa_44;
    use fips204::traits::SerDes;
    let (pk, sk) = ml_dsa_44::try_keygen().map_err(|e| anyhow::anyhow!("{e:?}"))?;
    let kp = Keypair {
        pk_hex: hex::encode(pk.into_bytes()),
        sk_hex: hex::encode(sk.into_bytes()),
    };
    std::fs::write(out, serde_json::to_string_pretty(&kp)?)?;
    println!("wrote {out}");
    Ok(())
}
```

- [ ] **Step 5: Test passes**

```bash
cargo test -p sign-cli --test cli
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add tools/sign-cli
git commit -m "feat(sign-cli): keygen writes ml-dsa-44 keypair as JSON"
```

### Task 17: Implement `commit-hash` (TDD)

**Files:**
- Modify: `tools/sign-cli/src/main.rs`
- Modify: `tools/sign-cli/tests/cli.rs`

- [ ] **Step 1: Add test**

Append to `tests/cli.rs`:
```rust
#[test]
fn commit_hash_matches_blake2_of_domain_plus_pk() {
    let dir = tempdir().unwrap();
    let key_path = dir.path().join("a.json");
    Command::cargo_bin("sign-cli").unwrap()
        .args(["keygen", "--out", key_path.to_str().unwrap()])
        .assert().success();

    let output = Command::cargo_bin("sign-cli").unwrap()
        .args(["commit-hash", "--pk", key_path.to_str().unwrap()])
        .output().unwrap();
    let hash_hex = std::str::from_utf8(&output.stdout).unwrap().trim();
    assert_eq!(hash_hex.len(), 64); // 32 bytes hex

    // Recompute manually.
    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&key_path).unwrap()).unwrap();
    let pk_bytes = hex::decode(json["pk_hex"].as_str().unwrap()).unwrap();
    let mut input = b"QL_PQ_COMMIT_V1".to_vec();
    input.extend_from_slice(&pk_bytes);
    use blake2::{Blake2b, Digest, digest::consts::U32};
    let mut h = Blake2b::<U32>::new();
    h.update(&input);
    let expected = hex::encode(h.finalize());
    assert_eq!(hash_hex, expected);
}
```

Add `blake2 = "0.10"` to `[dev-dependencies]` if not already there.

- [ ] **Step 2: Run, see failure**

```bash
cargo test -p sign-cli --test cli commit_hash 2>&1 | tail -10
```

- [ ] **Step 3: Implement `cmd_commit_hash`**

```rust
fn cmd_commit_hash(pk: &str) -> anyhow::Result<()> {
    let kp: Keypair = serde_json::from_str(&std::fs::read_to_string(pk)?)?;
    let pk_bytes = hex::decode(&kp.pk_hex)?;
    let mut input = b"QL_PQ_COMMIT_V1".to_vec();
    input.extend_from_slice(&pk_bytes);
    use blake2::{Blake2b, Digest, digest::consts::U32};
    let mut h = Blake2b::<U32>::new();
    h.update(&input);
    println!("{}", hex::encode(h.finalize()));
    Ok(())
}
```

- [ ] **Step 4: Test passes**

```bash
cargo test -p sign-cli --test cli
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add tools/sign-cli
git commit -m "feat(sign-cli): commit-hash matches pallet's blake2(domain || pk)"
```

### Task 18: Implement `sign-transfer` (TDD)

**Files:**
- Modify: `tools/sign-cli/src/main.rs`
- Modify: `tools/sign-cli/tests/cli.rs`

- [ ] **Step 1: Add test**

```rust
#[test]
fn sign_transfer_writes_valid_signed_payload() {
    let dir = tempdir().unwrap();
    let key_path = dir.path().join("a.json");
    let out_path = dir.path().join("tx.json");
    Command::cargo_bin("sign-cli").unwrap()
        .args(["keygen", "--out", key_path.to_str().unwrap()])
        .assert().success();

    // AccountId encoded as SS58 in real chain; for the CLI we accept raw hex
    // (32-byte) so the message bytes are deterministic.
    let alice_hex = "d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    let bob_hex   = "8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48";

    Command::cargo_bin("sign-cli").unwrap()
        .args(["sign-transfer",
            "--sk", key_path.to_str().unwrap(),
            "--from", alice_hex,
            "--to", bob_hex,
            "--amount", "100",
            "--nonce", "0",
            "--out", out_path.to_str().unwrap(),
        ])
        .assert().success();

    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&out_path).unwrap()).unwrap();
    assert_eq!(v["pubkey_hex"].as_str().unwrap().len(), 1312 * 2);
    assert_eq!(v["sig_hex"].as_str().unwrap().len(), 2420 * 2);
    assert!(v["msg_hex"].as_str().unwrap().starts_with(&hex::encode(b"QL_PQ_TRANSFER_V1")));
}
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement `cmd_sign_transfer`**

```rust
fn cmd_sign_transfer(
    sk_path: &str, from_hex: &str, to_hex: &str, amount: u128, nonce: u64,
    chain_id: u32, spec_version: u32, out: &str,
) -> anyhow::Result<()> {
    use fips204::ml_dsa_44;
    use fips204::traits::{SerDes, Signer};
    use parity_scale_codec::Encode;

    let kp: Keypair = serde_json::from_str(&std::fs::read_to_string(sk_path)?)?;
    let sk_bytes: [u8; ml_dsa_44::SK_LEN] =
        hex::decode(&kp.sk_hex)?.try_into().map_err(|_| anyhow::anyhow!("sk wrong length"))?;
    let pk_bytes: [u8; 1312] =
        hex::decode(&kp.pk_hex)?.try_into().map_err(|_| anyhow::anyhow!("pk wrong length"))?;
    let sk = ml_dsa_44::PrivateKey::try_from_bytes(sk_bytes)
        .map_err(|e| anyhow::anyhow!("{e:?}"))?;

    // AccountId = sp_core::crypto::AccountId32 = [u8;32]
    let from_bytes: [u8; 32] = hex::decode(from_hex)?
        .try_into().map_err(|_| anyhow::anyhow!("from must be 32 bytes hex"))?;
    let to_bytes: [u8; 32] = hex::decode(to_hex)?
        .try_into().map_err(|_| anyhow::anyhow!("to must be 32 bytes hex"))?;
    let from = sp_core::crypto::AccountId32::from(from_bytes);
    let to = sp_core::crypto::AccountId32::from(to_bytes);

    let domain: &[u8] = b"QL_PQ_TRANSFER_V1";
    let payload = (domain, chain_id, spec_version, &from, &to, amount, nonce).encode();
    let sig = sk.try_sign(&payload, &[]).map_err(|e| anyhow::anyhow!("{e:?}"))?;

    let out_obj = SignedTransfer {
        from: from_hex.to_string(), to: to_hex.to_string(), amount, nonce,
        pubkey_hex: hex::encode(pk_bytes),
        sig_hex: hex::encode(sig),
        msg_hex: hex::encode(&payload),
    };
    std::fs::write(out, serde_json::to_string_pretty(&out_obj)?)?;
    println!("wrote {out}");
    Ok(())
}
```

`ml_dsa_44::SK_LEN` may not be exported as a const — if it isn't, use the literal `2560` (ML-DSA-44 secret key bytes) or check `fips204` docs for the constant name. Inspect with `cargo doc -p fips204 --open`.

- [ ] **Step 4: Test passes**

```bash
cargo test -p sign-cli --test cli
```
Expected: 3 passed.

- [ ] **Step 5: Sanity-check: produced sig verifies via host fn**

Add one more integration test that calls into the pq-crypto crate to verify the signature the CLI produced. This catches encoding-mismatch bugs between sign-cli and the pallet.

```rust
#[test]
fn cli_produced_signature_verifies_with_pq_crypto() {
    let dir = tempdir().unwrap();
    let key_path = dir.path().join("a.json");
    let tx_path = dir.path().join("tx.json");
    Command::cargo_bin("sign-cli").unwrap()
        .args(["keygen", "--out", key_path.to_str().unwrap()]).assert().success();
    Command::cargo_bin("sign-cli").unwrap()
        .args(["sign-transfer",
            "--sk", key_path.to_str().unwrap(),
            "--from", "d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d",
            "--to",   "8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48",
            "--amount", "100", "--nonce", "0",
            "--out", tx_path.to_str().unwrap(),
        ]).assert().success();

    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&tx_path).unwrap()).unwrap();
    let pk = hex::decode(v["pubkey_hex"].as_str().unwrap()).unwrap();
    let sig = hex::decode(v["sig_hex"].as_str().unwrap()).unwrap();
    let msg = hex::decode(v["msg_hex"].as_str().unwrap()).unwrap();
    assert!(pq_crypto::pq_crypto::verify(&pk, &sig, &msg));
}
```

Add `pq-crypto = { path = "../../primitives/pq-crypto" }` to `[dev-dependencies]`.

```bash
cargo test -p sign-cli --test cli
```
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add tools/sign-cli
git commit -m "feat(sign-cli): sign-transfer produces JSON the pallet can verify"
```

---

## Phase 6: End-to-end smoke test

### Task 19: Set-code upgrade against real node

**Files:**
- Create: `scripts/setcode.sh`

- [ ] **Step 1: Build everything**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
cargo build --release -p quantumleap-node
cargo build --release -p quantumleap-runtime-v2
```

- [ ] **Step 2: Start node**

```bash
./target/release/quantumleap-node --dev --tmp \
  --rpc-port 9944 --rpc-cors all 2>&1 | tee node.log &
NODE_PID=$!
sleep 5
```

- [ ] **Step 3: Confirm v1 spec_version**

In `polkadot-js-apps` connected to `ws://127.0.0.1:9944`, inspect Settings → Metadata: `spec_version: 100`.

Or via curl:
```bash
curl -s -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"state_getRuntimeVersion"}' http://127.0.0.1:9944 | grep specVersion
```
Expected: `"specVersion":100`.

- [ ] **Step 4: Commit Alice's commitment**

Use `sign-cli` to generate Alice's keypair and compute the commitment hash.
```bash
mkdir -p .demo
./target/release/sign-cli keygen --out .demo/alice.json
HASH=$(./target/release/sign-cli commit-hash --pk .demo/alice.json)
echo "Commitment for Alice: 0x$HASH"
```
In polkadot-js-apps → Developer → Extrinsics → `pqRegistry.commit(0x$HASH)` from Alice's signed account. Confirm `Committed` event in the block.

- [ ] **Step 5: Submit setCode**

In polkadot-js-apps:
- Developer → Sudo → `system.setCode(code)`.
- `code` field: upload `target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm`.
- Submit.

Watch the log: a block within ~12s should report `runtime upgraded from 100 to 200`. Confirm via curl:
```bash
curl -s -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"state_getRuntimeVersion"}' http://127.0.0.1:9944 | grep specVersion
```
Expected: `"specVersion":200`.

- [ ] **Step 6: Try classical balances.transfer from Bob — must fail**

In apps → Extrinsics → `balances.transferAllowDeath` from Bob to Alice, any amount → submit. Expected: dispatch error `CallFiltered` (system pallet error 6 in standard Substrate).

- [ ] **Step 7: PQ transfer from Alice**

Alice's AccountId hex (from apps → Accounts → click Alice → copy raw hex, drop `0x` prefix):
```bash
ALICE_HEX="d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d"
BOB_HEX="8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48"
./target/release/sign-cli sign-transfer \
  --sk .demo/alice.json \
  --from $ALICE_HEX --to $BOB_HEX \
  --amount 1000000000000 --nonce 0 \
  --out .demo/transfer0.json
```

In apps → Extrinsics → `pqWallet.pqTransfer` filling fields from `.demo/transfer0.json`. Submit. Watch for `Revealed` + `PqTransfer` events in the same block.

- [ ] **Step 8: Stop node, save chain artifacts**

```bash
kill $NODE_PID
mkdir -p .demo/artifacts
cp target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm .demo/artifacts/v2.wasm
echo "v2 wasm bytes: $(stat -c%s .demo/artifacts/v2.wasm)" > .demo/artifacts/README
```

- [ ] **Step 9: Save the working flow as a script**

```bash
# scripts/setcode.sh
#!/usr/bin/env bash
set -euo pipefail
WASM=target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm
test -f "$WASM" || { echo "Build v2 first: cargo build --release -p quantumleap-runtime-v2"; exit 1; }
echo "WASM size: $(stat -c%s "$WASM") bytes"
echo "Hex prefix (paste into sudo.setCode in polkadot-js-apps):"
echo "0x$(xxd -p "$WASM" | tr -d '\n' | head -c 200)..."
echo
echo "Or full hex (warn: large):"
echo "  xxd -p '$WASM' | tr -d '\n'"
```
```bash
chmod +x scripts/setcode.sh
```

- [ ] **Step 10: Commit**

```bash
git add scripts/setcode.sh
git commit -m "feat(scripts): setcode helper script"
```

### Task 20: Record backup video v1

**Files:** none (output is video file).

- [ ] **Step 1: Reset state**

```bash
rm -rf /tmp/quantumleap-demo && mkdir /tmp/quantumleap-demo
./target/release/quantumleap-node --dev --base-path /tmp/quantumleap-demo \
  --rpc-port 9944 --rpc-cors all 2>&1 | tee /tmp/quantumleap-demo/node.log &
```

- [ ] **Step 2: Start screen recorder**

```bash
# Linux: ffmpeg X11 capture (adjust resolution and display)
ffmpeg -f x11grab -framerate 30 -video_size 1920x1080 -i :0.0 \
  -c:v libx264 -preset ultrafast -crf 22 \
  .demo/backup-v1.mp4 &
FFMPEG_PID=$!
```

- [ ] **Step 3: Walk through the demo flow manually**

Follow Task 19 steps 3–7 in real time, talking out loud what you'd say on stage. Keep under 3 minutes.

- [ ] **Step 4: Stop recording**

```bash
kill $FFMPEG_PID
```
Verify the file plays: `mpv .demo/backup-v1.mp4` or similar.

- [ ] **Step 5: Commit only a reference, not the video**

Add `.demo/` to `.gitignore` if not already, then commit the gitignore change.

```bash
echo '.demo/' >> .gitignore
git add .gitignore
git commit -m "chore: ignore .demo workspace"
```

---

## Phase 7: Frontend (Sunday)

### Task 21: Update frontend PAPI descriptors for the new chain

**Files:**
- Modify: `frontend/package.json` (scripts) and `.papi/` descriptors

- [ ] **Step 1: Regenerate PAPI descriptors against the running node**

```bash
cd /home/jay/Dev/pqc-hackathon/pqc-chain
./target/release/quantumleap-node --dev --tmp --rpc-port 9944 --rpc-cors all &
NODE_PID=$!
sleep 3
cd frontend
npx papi add quantumleap -w ws://127.0.0.1:9944
npx papi
cd ..
kill $NODE_PID
```

Confirm `frontend/.papi/descriptors/` updated.

- [ ] **Step 2: Commit**

```bash
git add frontend
git commit -m "feat(frontend): PAPI descriptors for quantumleap chain"
```

### Task 22: Add `/commit` page to the frontend

**Files:**
- Create: `frontend/src/components/CommitPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/CommitPage.tsx
import { useState } from 'react';
import { quantumleap } from '../../.papi/descriptors';
// Adjust the import path to match the PAPI conventions in this repo.

export function CommitPage({ api, selectedAddress, sign }: {
  api: any;  // typed via PAPI's TypedApi<typeof quantumleap>
  selectedAddress: string;
  sign: (tx: any) => Promise<any>;
}) {
  const [hashHex, setHashHex] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function submit() {
    setStatus('signing...');
    try {
      const hash = hashHex.startsWith('0x') ? hashHex : '0x' + hashHex;
      const tx = api.tx.PqRegistry.commit({ hash });
      const result = await sign(tx);
      setStatus(`✓ in block ${result.block.number}`);
    } catch (e: any) {
      setStatus(`✗ ${e.message}`);
    }
  }

  return (
    <div className="card bg-base-200 p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold">Commit PQ pubkey hash</h2>
      <p className="text-sm opacity-70 mt-2">
        Use <code>sign-cli commit-hash --pk &lt;keypair.json&gt;</code> to compute the 32-byte hash, paste below.
      </p>
      <input
        className="input input-bordered mt-4 font-mono"
        placeholder="0x... (64 hex chars)"
        value={hashHex}
        onChange={e => setHashHex(e.target.value.trim())}
      />
      <button className="btn btn-primary mt-4" onClick={submit}
              disabled={hashHex.replace(/^0x/, '').length !== 64}>
        Submit commit
      </button>
      {status && <div className="mt-4 font-mono text-sm">{status}</div>}
    </div>
  );
}
```

The exact PAPI invocation (`api.tx.PqRegistry.commit({hash})` vs `.signSubmitAndWatch(...)`) depends on PAPI's surface; check existing examples in `frontend/src/`. The component should follow whatever pattern the existing app uses for classical extrinsics.

- [ ] **Step 2: Wire into App.tsx**

Add a route or tab for the new component. Match the existing nav style in `frontend/src/App.tsx`.

- [ ] **Step 3: Run dev server, click through**

```bash
cd frontend
npm run dev
```
Open the localhost URL, navigate to /commit, paste a known hash, hit submit. Confirm via running node log that `pqRegistry.commit` was extrinsic'd and `Committed` event fired.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): CommitPage submits pqRegistry.commit via Talisman"
```

### Task 23: Add `/pq-send` page to the frontend

**Files:**
- Create: `frontend/src/components/PqSendPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Component that accepts a `tx.json` upload**

```tsx
// frontend/src/components/PqSendPage.tsx
import { useState } from 'react';

interface SignedTransfer {
  from: string; to: string; amount: number;
  nonce: number; pubkey_hex: string; sig_hex: string;
}

export function PqSendPage({ api, sign }: {
  api: any;
  sign: (tx: any) => Promise<any>;
}) {
  const [payload, setPayload] = useState<SignedTransfer | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then(t => setPayload(JSON.parse(t)));
  }

  async function submit() {
    if (!payload) return;
    setStatus('submitting unsigned...');
    try {
      const tx = api.tx.PqWallet.pq_transfer({
        from: '0x' + payload.from,
        to: '0x' + payload.to,
        amount: BigInt(payload.amount),
        nonce: BigInt(payload.nonce),
        pq_pubkey: '0x' + payload.pubkey_hex,
        sig: '0x' + payload.sig_hex,
      });
      // pq_transfer is unsigned (ensure_none); submit without signing.
      const result = await api.submitUnsigned(tx);
      setStatus(`✓ in block ${result.block.number}`);
    } catch (e: any) {
      setStatus(`✗ ${e.message}`);
    }
  }

  return (
    <div className="card bg-base-200 p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold">PQ transfer</h2>
      <p className="text-sm opacity-70 mt-2">
        Upload a <code>tx.json</code> produced by <code>sign-cli sign-transfer</code>.
      </p>
      <input type="file" className="file-input mt-4" onChange={onFile} accept=".json" />
      {payload && (
        <div className="mt-4 font-mono text-sm">
          <div>from: {payload.from.slice(0, 16)}…</div>
          <div>to: {payload.to.slice(0, 16)}…</div>
          <div>amount: {payload.amount}</div>
          <div>nonce: {payload.nonce}</div>
        </div>
      )}
      <button className="btn btn-primary mt-4" onClick={submit} disabled={!payload}>
        Submit pq_transfer
      </button>
      {status && <div className="mt-4 font-mono text-sm">{status}</div>}
    </div>
  );
}
```

PAPI's unsigned-submit API may differ (`api.tx.PqWallet.pq_transfer(...).signAndSubmit()` vs a special unsigned path). Check the PAPI docs in `frontend/node_modules/polkadot-api/` or the existing codebase for the correct call.

- [ ] **Step 2: Wire into App.tsx, run dev server**

```bash
cd frontend && npm run dev
```
Manually upload one of the `.demo/transfer*.json` files produced by sign-cli; confirm submission via the node log.

- [ ] **Step 3: Commit**

```bash
git add frontend
git commit -m "feat(frontend): PqSendPage submits pqWallet.pq_transfer from sign-cli JSON"
```

---

## Phase 8: Demo polish (Sunday)

### Task 24: justfile for demo orchestration

**Files:**
- Create: `justfile`

- [ ] **Step 1: Write recipes**

```just
# justfile

set shell := ["bash", "-uc"]

WASM := "target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm"
BASE := "/tmp/quantumleap-demo"

# Build everything
build:
    cargo build --release -p quantumleap-node
    cargo build --release -p quantumleap-runtime-v2
    cargo build --release -p sign-cli

# Reset chain state, start node on v1
demo-reset:
    -pkill quantumleap-node || true
    rm -rf {{BASE}}
    mkdir -p {{BASE}}
    ./target/release/quantumleap-node --dev --base-path {{BASE}} \
        --rpc-port 9944 --rpc-cors all 2>&1 > {{BASE}}/node.log &
    sleep 4
    @echo "node up, spec_version:"
    @curl -s -H "Content-Type: application/json" \
        -d '{"id":1,"jsonrpc":"2.0","method":"state_getRuntimeVersion"}' \
        http://127.0.0.1:9944 | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["specVersion"])'

# Generate Alice's keypair and commitment hash
demo-keygen:
    mkdir -p .demo
    ./target/release/sign-cli keygen --out .demo/alice.json
    @echo "commitment:"
    @./target/release/sign-cli commit-hash --pk .demo/alice.json

# Generate a transfer payload to be submitted post-upgrade
demo-presign FROM TO AMOUNT NONCE:
    ./target/release/sign-cli sign-transfer \
        --sk .demo/alice.json \
        --from {{FROM}} --to {{TO}} \
        --amount {{AMOUNT}} --nonce {{NONCE}} \
        --out .demo/transfer{{NONCE}}.json

# Print v2 WASM size + first hex bytes (for sudo.setCode)
demo-wasm:
    test -f {{WASM}} || just build
    @echo "WASM size: $(stat -c%s {{WASM}}) bytes"
    @echo "First 200 hex chars: 0x$(xxd -p {{WASM}} | tr -d '\n' | head -c 200)..."

# Confirm upgraded
demo-version:
    @curl -s -H "Content-Type: application/json" \
        -d '{"id":1,"jsonrpc":"2.0","method":"state_getRuntimeVersion"}' \
        http://127.0.0.1:9944 | python3 -c 'import sys,json; v=json.load(sys.stdin)["result"]; print(f"spec={v[\"specVersion\"]} tx={v[\"transactionVersion\"]}")'

# Start ffmpeg screen recording
demo-record:
    ffmpeg -y -f x11grab -framerate 30 -video_size 1920x1080 -i :0.0 \
        -c:v libx264 -preset ultrafast -crf 22 .demo/recording.mp4

# Open polkadot-js-apps in default browser
demo-apps:
    xdg-open "https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:9944"

# Open the frontend
demo-ui:
    cd frontend && npm run dev
```

- [ ] **Step 2: Smoke test**

```bash
just build
just demo-reset
just demo-keygen
just demo-version
just demo-wasm
```
Expected: each step prints reasonable output.

- [ ] **Step 3: Commit**

```bash
git add justfile
git commit -m "feat: justfile for demo orchestration"
```

### Task 25: Final clean re-recording (Sunday morning)

**Files:** none.

- [ ] **Step 1: Dry-run the full demo three times in a row**

`just demo-reset` between runs. Aim for under 3 minutes per run.

- [ ] **Step 2: Record the cleanest take**

```bash
just demo-reset
just demo-record &
# Walk through the flow
```
Save as `.demo/backup-v2.mp4`.

- [ ] **Step 3: Optionally trim with ffmpeg**

```bash
ffmpeg -i .demo/backup-v2.mp4 -ss 00:00:02 -t 00:03:00 -c copy .demo/final.mp4
```

### Task 26: Pitch deck + README

**Files:**
- Modify: `README.md`
- Create: `docs/diagrams/architecture.svg` (export from spec mermaid)

- [ ] **Step 1: Rewrite README**

Top-level README content:
```markdown
# QuantumLeap

Crypto-agile Substrate chain with hash-committed post-quantum recovery.

A live demonstration that a running blockchain can swap its core signature scheme from ECDSA to ML-DSA via a forkless runtime upgrade — protecting users who pre-committed against both classical and post-quantum harvest-now-decrypt-later attacks.

## Quick demo

```bash
just build
just demo-reset           # node up on v1 (spec=100)
just demo-keygen          # Alice's ML-DSA-44 keypair + commitment hash
# → submit `pqRegistry.commit(hash)` via polkadot-js-apps (Alice signed)
# → submit `system.setCode(v2.wasm)` via sudo
just demo-version         # confirms spec=200, tx=2
just demo-presign <alice_hex> <bob_hex> 1000 0
# → submit `pqWallet.pq_transfer` via the frontend
```

## Layout

- `primitives/pq-crypto` — ML-DSA-44 host function (`sp_runtime_interface`)
- `pallets/pq-registry` — `commit` + `recommit` (in v1 + v2)
- `pallets/pq-wallet` — `pq_transfer` with lazy reveal (v2 only)
- `runtime/v1` — boot runtime (spec=100, tx=1), ECDSA path only
- `runtime/v2` — upgraded runtime (spec=200, tx=2), BaseCallFilter rejects classical transfers
- `tools/sign-cli` — std Rust binary: keygen, commit-hash, sign-transfer → JSON
- `frontend/` — React/PAPI/Tailwind/Talisman; pages for `/commit` and `/pq-send`

## Spec & plan

- Design spec: [`docs/superpowers/specs/2026-05-23-quantumleap-design.md`](docs/superpowers/specs/2026-05-23-quantumleap-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-05-23-quantumleap.md`](docs/superpowers/plans/2026-05-23-quantumleap.md)
```

- [ ] **Step 2: Export architecture diagram**

Open the mermaid block from §3 of the spec in any mermaid renderer (e.g. https://mermaid.live) → export SVG → save to `docs/diagrams/architecture.svg`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/diagrams
git commit -m "docs: README + architecture diagram"
```

- [ ] **Step 4: Write slides separately (deck outline in §13 of spec)**

Deck delivery is out of scope for code; produce in Google Slides or Keynote on the day.

---

## Self-review checklist (engineer runs before claiming done)

- [ ] `cargo test --workspace --all-features` passes
- [ ] `cargo build --release -p quantumleap-node` succeeds; the binary runs `--dev` without warnings about missing host functions
- [ ] `cargo build --release -p quantumleap-runtime-v2` produces `target/release/wbuild/.../quantumleap_runtime_v2.compact.compressed.wasm`
- [ ] On a fresh dev chain, `sudo.setCode(v2.wasm)` succeeds and `state_getRuntimeVersion` reports `specVersion: 200, transactionVersion: 2`
- [ ] Post-upgrade, `balances.transferAllowDeath` from any account is rejected with `CallFiltered`
- [ ] Post-upgrade, an account that did NOT call `pqRegistry.commit` cannot submit `pqWallet.pq_transfer` (`NoCommitment`)
- [ ] Post-upgrade, an account that DID commit can submit `pqWallet.pq_transfer` once, atomically revealing its pubkey and transferring
- [ ] `frontend/` builds with `npm run build` and the two new pages render
- [ ] `.demo/backup-v2.mp4` exists and plays clean
- [ ] `justfile` recipes all succeed against a fresh checkout
