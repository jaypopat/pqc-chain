# QuantumLeap demo runbook

End-to-end manual demo flow for the hackathon stage. Targets a freshly built
node on `--dev` and assumes you have the v2 WASM and pre-signed transfer
artifacts on disk under `.demo/`.

## 0. Prereqs (one-time)

- `cargo build --release -p quantumleap-node`
- `cargo build --release -p quantumleap-runtime-v2`
- `cargo build --release -p sign-cli`
- Browser open to <https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:9944>

## 1. Reset and boot v1

```bash
just demo-reset       # kills any old node, wipes /tmp/quantumleap-demo, boots fresh on v1
just demo-version     # should print specVersion=100
```

## 2. Generate Alice's PQ keypair and commitment hash

```bash
just demo-keygen
# Prints: 0x<32-byte hex>  ← copy this
```

Outputs:
- `.demo/alice.json` — `{ pk_hex, sk_hex }` for Alice (NEVER hits the chain)
- stdout — the commitment `blake2_256("QL_PQ_COMMIT_V1" || alice.pk)`

## 3. Submit Alice's commitment (in polkadot-js-apps)

Developer → Extrinsics → using account **Alice**:
- Pallet: `pqRegistry`
- Call: `commit(hash)`
- `hash`: paste `0x<commitment from step 2>`
- Submit and sign

Watch the block import in the node log:
```bash
tail -f /tmp/quantumleap-demo/node.log | grep -E "Imported|Committed"
```
Expected: `Committed { who: …, hash: 0x… }` event in the next block.

Verify on-chain state:
- Developer → Chain state → `pqRegistry.commitment(AccountId)` → Alice → Submit
- Returns `Some(0x<hash>)`. **Alice's PQ pubkey is NOT on chain.**

## 4. Pre-sign Alice's first PQ transfer

```bash
# Alice's dev AccountId hex:
alice=d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d
# Bob's dev AccountId hex:
bob=8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48

just demo-presign $alice $bob 1000000000000 0
# → .demo/transfer0.json
```

This produces a signed payload that v2 can verify. Hold for step 6.

## 5. THE UPGRADE — `sudo.setCode`

```bash
just demo-wasm        # confirms v2 WASM blob exists; writes .demo/v2.code.hex
# or:
scripts/setcode.sh    # same thing, more verbose
```

In polkadot-js-apps:
- Developer → Sudo → `system.setCode(code)`
- `code`: click the upload icon, pick:
  `target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm`
  (or paste `0x...` from `.demo/v2.code.hex`)
- Submit as Alice (the sudo key on `--dev`)

Watch:
```bash
tail -f /tmp/quantumleap-demo/node.log | grep -E "runtime|upgrade|spec"
```
Expected within ~12s: `Runtime upgraded from 100 to 200`.

Confirm via RPC:
```bash
just demo-version     # should print specVersion=200, transactionVersion=2
```

## 6. Post-upgrade: classical transfer must FAIL

In polkadot-js-apps:
- Developer → Extrinsics → from **Bob**
- `balances.transferAllowDeath(dest=Alice, value=any)`
- Submit and sign
- Expected: dispatch error `system.CallFiltered` (the v2 `BaseCallFilter`
  rejects classical transfers).

Show the red ✗ toast to the audience.

## 7. Post-upgrade: PQ transfer from Alice must SUCCEED

In polkadot-js-apps:
- Developer → Extrinsics → call `pqWallet.pqTransfer(...)` as **unsigned**
  (the call is gated by `ValidateUnsigned`, not a classical signature).
- Fields from `.demo/transfer0.json`:
  - `from`: `0xd43593...` (Alice)
  - `to`:   `0x8eaf04...` (Bob)
  - `amount`: 1000000000000
  - `nonce`: 0
  - `pq_pubkey`: paste `0x` + the value of `pubkey_hex` from transfer0.json
  - `sig`:       paste `0x` + the value of `sig_hex`    from transfer0.json
- Submit unsigned

Expected events in the same block:
- `pqWallet.Revealed { who: Alice }`        ← lazy reveal happens once
- `balances.Transfer { from: Alice, to: Bob, amount: 1000000000000 }`
- `pqWallet.PqTransfer { from: Alice, to: Bob, amount: 1000000000000 }`

Confirm balance change in Accounts panel.

## 8. Post-upgrade: PQ transfer from Bob must FAIL (NoCommitment)

If you have time, the punchline: try `pqWallet.pqTransfer` from Bob with any
keys — it errors with `pqWallet.NoCommitment` at `ValidateUnsigned` (rejected
from tx pool). Bob never pre-committed, so post-Q-day he's locked out.

> "The customer is responsible for pre-committing. That's the product."

## 9. Cleanup

```bash
pkill quantumleap-node
```

---

## Troubleshooting

- **`setCode` rejected with `InvalidSpecName`**: v1 and v2 must share `spec_name`.
  Both must say `"quantumleap"`. Check `runtime/{v1,v2}/src/lib.rs`.
- **`pqWallet.pqTransfer` rejected with custom code 2**: no commitment exists
  for `from`. Did you commit in step 3?
- **`pqWallet.pqTransfer` rejected with `BadProof`**: signature doesn't verify.
  Re-run `sign-cli sign-transfer` — did you change AccountIds or spec_version?
- **Browser can't connect**: confirm `--rpc-cors all` is on the node command
  and the WS port is 9944.
