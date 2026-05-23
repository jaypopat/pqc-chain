# QuantumLeap

Crypto-agile Substrate solochain that upgrades from ECDSA to ML-DSA (FIPS-204) via a live `sudo.setCode` runtime swap.

See `docs/superpowers/specs/2026-05-23-quantumleap-design.md` for the design and `docs/superpowers/plans/2026-05-23-quantumleap.md` for the implementation plan.

## Prerequisites

- Rust (via rustup) — toolchain pinned in `rust-toolchain.toml`
- `protobuf-compiler` — required by `sc-network` build (Linux: `sudo apt install -y protobuf-compiler`, macOS: `brew install protobuf`)
- `wasm32v1-none` target (auto-installed by toolchain pin)

## Quick start

```bash
cargo build --release -p quantumleap-node
./target/release/quantumleap-node --dev --tmp
```

Status: under development for the PQC crypto-agility hackathon (2026-05-23/24).
