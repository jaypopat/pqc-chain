// End-to-end verification of the QuantumLeap upgrade flow against a live --dev node.
//
// Pre-reqs (handled by `just demo-reset` before running this):
//   - Node up on ws://127.0.0.1:9944
//   - `.demo/alice.json`            (sign-cli keygen --out .demo/alice.json)
//   - `.demo/alice.commitment.hex`  (sign-cli commit-hash --pk .demo/alice.json)
//   - `.demo/transfer0.json`        (sign-cli sign-transfer ... --out .demo/transfer0.json)
//   - target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm
//
// Run with: cd scripts/e2e && node run.mjs

import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RPC = 'ws://127.0.0.1:9944';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const WASM_PATH = resolve(REPO_ROOT, 'target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm');
const COMMIT_HASH_PATH = resolve(REPO_ROOT, '.demo/alice.commitment.hex');
const TRANSFER_PATH = resolve(REPO_ROOT, '.demo/transfer0.json');

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`  ${m}`);
const fail = (m) => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };
const step = (n, t) => console.log(`\n\x1b[1m[${n}]\x1b[0m ${t}`);

// Submit an extrinsic and resolve when included in a block. Returns the events.
function submitAndWait(extrinsic, signerOrUnsigned) {
  return new Promise((res, rej) => {
    const handler = ({ status, events = [], dispatchError }) => {
      if (status.isInBlock) {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = extrinsic.registry.findMetaError(dispatchError.asModule);
            return rej(new Error(`dispatch error: ${decoded.section}.${decoded.name}`));
          }
          return rej(new Error(`dispatch error: ${dispatchError.toString()}`));
        }
        res({ blockHash: status.asInBlock.toHex(), events });
      } else if (status.isFinalityTimeout || status.isDropped || status.isInvalid) {
        rej(new Error(`tx failed: ${status.type}`));
      }
    };
    const send = signerOrUnsigned === null
      ? extrinsic.send(handler)
      : extrinsic.signAndSend(signerOrUnsigned, handler);
    send.catch(rej);
  });
}

async function getSpec(api) {
  const v = await api.rpc.state.getRuntimeVersion();
  return { spec: v.specVersion.toNumber(), tx: v.transactionVersion.toNumber(), name: v.specName.toString() };
}

async function waitForBlock(api, n) {
  return new Promise((res) => {
    const unsub = api.rpc.chain.subscribeNewHeads((h) => {
      if (h.number.toNumber() >= n) {
        unsub.then((u) => u());
        res(h.number.toNumber());
      }
    });
  });
}

async function main() {
  console.log('QuantumLeap end-to-end verification');
  console.log(`RPC: ${RPC}\n`);

  const provider = new WsProvider(RPC);
  const api = await ApiPromise.create({ provider });
  api.on('error', (e) => fail(`api error: ${e.message}`));

  const keyring = new Keyring({ type: 'sr25519' });
  const alice = keyring.addFromUri('//Alice');
  const bob = keyring.addFromUri('//Bob');

  // ----------- 1. Confirm v1 -----------
  step(1, 'confirm v1 spec_version=100');
  let v = await getSpec(api);
  info(`runtime: ${v.name} spec=${v.spec} tx=${v.tx}`);
  if (v.spec !== 100) fail(`expected spec=100, got ${v.spec}`);
  if (v.name !== 'quantumleap') fail(`expected name=quantumleap, got ${v.name}`);
  ok('v1 live');

  // ----------- 2. Alice commits -----------
  step(2, "Alice submits pqRegistry.commit(H(pk_A))");
  const commitHashHex = '0x' + readFileSync(COMMIT_HASH_PATH, 'utf8').trim();
  info(`commitment: ${commitHashHex}`);
  const commitTx = api.tx.pqRegistry.commit(commitHashHex);
  const commitRes = await submitAndWait(commitTx, alice);
  const committedEv = commitRes.events.find(({ event }) =>
    event.section === 'pqRegistry' && event.method === 'Committed');
  if (!committedEv) fail('no Committed event');
  ok(`Committed event in block ${commitRes.blockHash.slice(0, 12)}…`);

  // Verify storage
  const stored = await api.query.pqRegistry.commitment(alice.address);
  if (stored.toString() !== commitHashHex) fail(`storage mismatch: ${stored.toString()}`);
  ok(`storage Commitment[Alice] = ${stored.toString().slice(0, 14)}…`);

  // ----------- 3. sudo.setCode(v2.wasm) -----------
  step(3, 'Alice (sudo) submits system.setCode(v2_wasm)');
  const wasm = readFileSync(WASM_PATH);
  const wasmHex = '0x' + wasm.toString('hex');
  info(`v2 WASM: ${wasm.length} bytes`);
  const setCodeCall = api.tx.system.setCode(wasmHex);
  const sudoTx = api.tx.sudo.sudoUncheckedWeight(setCodeCall, { refTime: 0, proofSize: 0 });
  const sudoRes = await submitAndWait(sudoTx, alice);
  ok(`setCode included in block ${sudoRes.blockHash.slice(0, 12)}…`);

  // Wait one more block so the upgrade is applied at runtime.
  const startBlock = (await api.rpc.chain.getHeader()).number.toNumber();
  await waitForBlock(api, startBlock + 1);

  v = await getSpec(api);
  info(`runtime: ${v.name} spec=${v.spec} tx=${v.tx}`);
  if (v.spec !== 200) fail(`expected spec=200 after upgrade, got ${v.spec}`);
  if (v.tx !== 2) fail(`expected tx=2 after upgrade, got ${v.tx}`);
  ok('v2 LIVE');

  // Reload metadata so we pick up the new pallets (PqWallet, etc).
  await api.disconnect();
  const api2 = await ApiPromise.create({ provider: new WsProvider(RPC) });
  api2.on('error', (e) => fail(`api error: ${e.message}`));

  // ----------- 4. Classical transfer must FAIL -----------
  step(4, 'Bob submits balances.transferAllowDeath → must be CallFiltered');
  const classicalTx = api2.tx.balances.transferAllowDeath(alice.address, 1_000_000_000);
  try {
    await submitAndWait(classicalTx, bob);
    fail('classical transfer was NOT rejected — BaseCallFilter broken');
  } catch (e) {
    if (/CallFiltered/.test(e.message)) {
      ok(`rejected with ${e.message}`);
    } else {
      fail(`wrong error: ${e.message}`);
    }
  }

  // ----------- 5. Alice's PQ transfer must SUCCEED -----------
  step(5, 'Alice submits unsigned pqWallet.pqTransfer (lazy reveal + transfer)');
  const transfer = JSON.parse(readFileSync(TRANSFER_PATH, 'utf8'));
  info(`amount: ${transfer.amount} nonce: ${transfer.nonce}`);

  const pqTx = api2.tx.pqWallet.pqTransfer(
    '0x' + transfer.from,
    '0x' + transfer.to,
    BigInt(transfer.amount),
    BigInt(transfer.nonce),
    '0x' + transfer.pubkey_hex,
    '0x' + transfer.sig_hex,
  );
  const pqRes = await submitAndWait(pqTx, null); // unsigned
  ok(`pqTransfer included in block ${pqRes.blockHash.slice(0, 12)}…`);

  const evRevealed = pqRes.events.find(({ event }) =>
    event.section === 'pqWallet' && event.method === 'Revealed');
  const evTransfer = pqRes.events.find(({ event }) =>
    event.section === 'balances' && event.method === 'Transfer');
  const evPq = pqRes.events.find(({ event }) =>
    event.section === 'pqWallet' && event.method === 'PqTransfer');
  if (!evRevealed) fail('no Revealed event');
  if (!evTransfer) fail('no balances.Transfer event');
  if (!evPq) fail('no PqTransfer event');
  ok('Revealed + balances.Transfer + PqTransfer all fired');

  // Verify reveal stored
  const revealed = await api2.query.pqWallet.revealed(alice.address);
  if (revealed.isNone) fail('Revealed storage empty after first spend');
  ok(`Revealed[Alice] = ${revealed.unwrap().length} bytes (pubkey on chain)`);

  // Verify nonce ticked
  const nonce = await api2.query.pqWallet.nonce(alice.address);
  if (nonce.toNumber() !== 1) fail(`expected nonce=1, got ${nonce.toNumber()}`);
  ok(`Nonce[Alice] = 1`);

  // ----------- 6. Bob's pqTransfer (no commit) must FAIL -----------
  step(6, 'Bob attempts pqTransfer with no prior commitment → must reject');
  const bogusPk = '0x' + '00'.repeat(1312);
  const bogusSig = '0x' + '00'.repeat(2420);
  const bobPqTx = api2.tx.pqWallet.pqTransfer(
    bob.publicKey,
    alice.publicKey,
    1_000n,
    0n,
    bogusPk,
    bogusSig,
  );
  try {
    await submitAndWait(bobPqTx, null);
    fail('Bob pqTransfer was NOT rejected — NoCommitment guard broken');
  } catch (e) {
    // Could be NoCommitment (custom code 2) at ValidateUnsigned or in dispatch.
    if (/NoCommitment|Custom|Invalid|Transaction/i.test(e.message)) {
      ok(`rejected with ${e.message}`);
    } else {
      fail(`wrong error: ${e.message}`);
    }
  }

  await api2.disconnect();
  console.log('\n\x1b[1;32mALL CHECKS PASSED\x1b[0m');
  console.log('The forkless upgrade + lazy reveal + filter all work end-to-end.\n');
}

main().catch((e) => {
  console.error('\n\x1b[1;31mFAILED:\x1b[0m', e.message);
  console.error(e.stack);
  process.exit(1);
});
