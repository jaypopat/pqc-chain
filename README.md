# QuantumLeap

Crypto-agile Substrate chain with hash-committed post-quantum recovery.

A live demonstration that a running blockchain can swap its core signature scheme from ECDSA to ML-DSA via a forkless runtime upgrade — protecting users who pre-committed against both classical and post-quantum harvest-now-decrypt-later attacks.

## Prerequisites

- Rust (via rustup) — toolchain pinned in `rust-toolchain.toml`
- `protobuf-compiler` — required by `sc-network` build (Linux: `sudo apt install -y protobuf-compiler`, macOS: `brew install protobuf`)
- `wasm32v1-none` target (auto-installed by toolchain pin)
- [`just`](https://github.com/casey/just) — recipe runner used for demo orchestration (`cargo install just`)

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

Run `just --list` to see all available recipes.

## Layout

- `primitives/pq-crypto` — ML-DSA-44 host function (`sp_runtime_interface`)
- `pallets/pq-registry` — `commit` + `recommit` (in v1 + v2)
- `pallets/pq-wallet` — `pq_transfer` with lazy reveal (v2 only)
- `runtime/v1` — boot runtime (spec=100, tx=1), ECDSA path only
- `runtime/v2` — upgraded runtime (spec=200, tx=2), BaseCallFilter rejects classical transfers
- `tools/sign-cli` — std Rust binary: keygen, commit-hash, sign-transfer → JSON
- `frontend/` — React/PAPI/Tailwind/Talisman; pages for `/commit` and `/pq-send`

## Architecture

The mermaid source for the system diagram lives at [`docs/diagrams/architecture.mmd`](docs/diagrams/architecture.mmd). Paste it into <https://mermaid.live> to render an SVG/PNG.

## Spec & plan

- Design spec: [`docs/superpowers/specs/2026-05-23-quantumleap-design.md`](docs/superpowers/specs/2026-05-23-quantumleap-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-05-23-quantumleap.md`](docs/superpowers/plans/2026-05-23-quantumleap.md)
