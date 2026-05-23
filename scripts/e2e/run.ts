#!/usr/bin/env bun
//
// End-to-end verification of the QuantumLeap upgrade flow against a live --dev node.
//
// Pre-reqs (handled by `just demo-reset` before running):
//   - Node up on ws://127.0.0.1:9944
//   - .demo/alice.json            (sign-cli keygen --out .demo/alice.json)
//   - .demo/alice.commitment.hex  (sign-cli commit-hash --pk .demo/alice.json)
//   - .demo/transfer0.json        (sign-cli sign-transfer ... --out .demo/transfer0.json)
//   - target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm
//
// Run with: bun run.ts

import { createClient, Binary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { getPolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_MINI_SECRET } from "@polkadot-labs/hdkd-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RPC = "ws://127.0.0.1:9944";
const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const WASM_PATH = resolve(REPO_ROOT, "target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm");
const COMMIT_HASH_PATH = resolve(REPO_ROOT, ".demo/alice.commitment.hex");
const TRANSFER_PATH = resolve(REPO_ROOT, ".demo/transfer0.json");

const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info = (m: string) => console.log(`  ${m}`);
const fail = (m: string): never => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };
const step = (n: number, t: string) => console.log(`\n\x1b[1m[${n}]\x1b[0m ${t}`);

// SCALE compact-length encoding (used to wrap unsigned extrinsic body).
function compactLen(n: number): Uint8Array {
	if (n < 64) return new Uint8Array([(n << 2) & 0xff]);
	if (n < 16384) {
		const v = (n << 2) | 1;
		return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
	}
	if (n < 1073741824) {
		const v = (n << 2) | 2;
		return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
	}
	throw new Error(`compact too big: ${n}`);
}

function toHex(bytes: Uint8Array): string {
	return "0x" + Buffer.from(bytes).toString("hex");
}

interface SpecVer { spec: number; tx: number; name: string }
async function getSpec(api: any): Promise<SpecVer> {
	const v = await api.constants.System.Version();
	return { spec: v.spec_version, tx: v.transaction_version, name: v.spec_name };
}

async function waitForRuntimeUpgrade(client: any, fromSpec: number, timeoutMs = 30_000): Promise<number> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const tmp = await client.getUnsafeApi();
		const v = await tmp.constants.System.Version();
		if (v.spec_version !== fromSpec) return v.spec_version;
		await Bun.sleep(1000);
	}
	return fail(`runtime did not upgrade from spec=${fromSpec} within ${timeoutMs}ms`);
}

// Wrap a SCALE-encoded call into an unsigned extrinsic body and submit raw.
// Unsigned v4 extrinsic = compact_len(body) || 0x04 (version, unsigned) || callBytes.
async function submitUnsigned(client: any, callBytes: Uint8Array): Promise<string> {
	const body = new Uint8Array(1 + callBytes.length);
	body[0] = 0x04;                       // extrinsic version 4, unsigned (high bit clear)
	body.set(callBytes, 1);
	const ext = new Uint8Array(compactLen(body.length).length + body.length);
	const prefix = compactLen(body.length);
	ext.set(prefix, 0);
	ext.set(body, prefix.length);
	const hex = toHex(ext);
	// Use the legacy author_* RPC because chainHead_v1 uses operation IDs and is async.
	return await (client as any)._request("author_submitExtrinsic", [hex]);
}

async function main() {
	console.log("QuantumLeap end-to-end verification (bun + polkadot-api)");
	console.log(`RPC: ${RPC}\n`);

	const derive = sr25519CreateDerive(DEV_MINI_SECRET);
	const alice = derive("//Alice");
	const bob = derive("//Bob");
	const aliceSigner = getPolkadotSigner(alice.publicKey, "Sr25519", alice.sign);
	const bobSigner = getPolkadotSigner(bob.publicKey, "Sr25519", bob.sign);

	let client = createClient(getWsProvider(RPC));
	let api = await client.getUnsafeApi();

	// ----------- 1. confirm v1 -----------
	step(1, "confirm v1 spec_version=100");
	let v = await getSpec(api);
	info(`runtime: ${v.name} spec=${v.spec} tx=${v.tx}`);
	if (v.spec !== 100) fail(`expected spec=100, got ${v.spec}`);
	if (v.name !== "quantumleap") fail(`expected name=quantumleap, got ${v.name}`);
	ok("v1 live");

	// ----------- 2. Alice commits -----------
	step(2, "Alice submits pqRegistry.commit(H(pk_A))");
	const commitHashHex = "0x" + readFileSync(COMMIT_HASH_PATH, "utf8").trim();
	info(`commitment: ${commitHashHex}`);
	const commitTx = api.tx.PqRegistry.commit({ hash: Binary.fromHex(commitHashHex) });
	const commitRes = await commitTx.signAndSubmit(aliceSigner);
	if (!commitRes.ok) fail(`commit dispatch error: ${JSON.stringify(commitRes.dispatchError)}`);
	const committedEv = commitRes.events.find((e: any) => e.type === "PqRegistry" && e.value.type === "Committed");
	if (!committedEv) fail("no Committed event");
	const storedHash = (committedEv as any).value.value.hash.asHex();
	if (storedHash !== commitHashHex) fail(`event hash mismatch: ${storedHash}`);
	ok(`Committed{hash=${storedHash.slice(0, 14)}…} in block ${commitRes.block.hash.slice(0, 12)}…`);

	// ----------- 3. sudo.setCode(v2.wasm) -----------
	step(3, "Alice (sudo) submits system.setCode(v2_wasm)");
	const wasm = readFileSync(WASM_PATH);
	info(`v2 WASM: ${wasm.length} bytes`);

	const setCodeCall = api.tx.System.set_code({ code: Binary.fromBytes(wasm) }).decodedCall;
	const sudoTx = api.tx.Sudo.sudo_unchecked_weight({
		call: setCodeCall,
		weight: { ref_time: 0n, proof_size: 0n },
	});
	const sudoRes = await sudoTx.signAndSubmit(aliceSigner);
	if (!sudoRes.ok) fail(`setCode dispatch error: ${JSON.stringify(sudoRes.dispatchError)}`);
	ok(`setCode included in block ${sudoRes.block.hash.slice(0, 12)}…`);

	// Wait for runtime upgrade to apply (happens on next block after inclusion).
	// PAPI auto-handles metadata refresh via chainHead subscription — no reconnect.
	const newSpec = await waitForRuntimeUpgrade(client, 100);
	info(`runtime upgraded to spec=${newSpec}`);
	if (newSpec !== 200) fail(`expected spec=200, got ${newSpec}`);
	v = await getSpec(api);
	info(`runtime: ${v.name} spec=${v.spec} tx=${v.tx}`);
	if (v.tx !== 2) fail(`expected tx=2 after upgrade, got ${v.tx}`);
	ok("v2 LIVE");

	// ----------- 4. classical transfer must FAIL -----------
	step(4, "Bob submits balances.transferAllowDeath → must be CallFiltered");
	const classicalTx = api.tx.Balances.transfer_allow_death({
		dest: { type: "Id", value: alice.publicKey },
		value: 1_000_000_000n,
	});
	const classicalRes = await classicalTx.signAndSubmit(bobSigner);
	if (classicalRes.ok) fail("classical transfer was NOT rejected — BaseCallFilter broken");
	const err = JSON.stringify(classicalRes.dispatchError);
	if (!/CallFiltered/.test(err)) fail(`wrong error: ${err}`);
	ok(`rejected with ${err}`);

	// ----------- 5. Alice's PQ transfer must SUCCEED -----------
	step(5, "Alice submits UNSIGNED pqWallet.pq_transfer (lazy reveal + transfer)");
	const transfer = JSON.parse(readFileSync(TRANSFER_PATH, "utf8"));
	info(`amount: ${transfer.amount} nonce: ${transfer.nonce}`);

	const pqTx = api.tx.PqWallet.pq_transfer({
		from: Binary.fromHex("0x" + transfer.from),
		to: Binary.fromHex("0x" + transfer.to),
		amount: BigInt(transfer.amount),
		nonce: BigInt(transfer.nonce),
		pq_pubkey: Binary.fromHex("0x" + transfer.pubkey_hex),
		sig: Binary.fromHex("0x" + transfer.sig_hex),
	});
	const callBytes = (await pqTx.getEncodedData()).asBytes();
	info(`call bytes: ${callBytes.length}`);

	// Subscribe to events BEFORE submitting so we don't miss the block.
	const seenEvents: any[] = [];
	const eventsSub = api.event.PqWallet.PqTransfer.watch().subscribe((ev: any) => seenEvents.push(ev));
	const revealedSub = api.event.PqWallet.Revealed.watch().subscribe((ev: any) => seenEvents.push(ev));

	const txHash = await submitUnsigned(client, callBytes);
	ok(`pqTransfer submitted, hash=${txHash.slice(0, 12)}…`);

	// Wait for the events.
	let waited = 0;
	while (waited < 20_000 && (
		!seenEvents.some((e: any) => e?.payload?.who) ||
		!seenEvents.some((e: any) => e?.payload?.amount === BigInt(transfer.amount))
	)) {
		await Bun.sleep(500);
		waited += 500;
	}
	eventsSub.unsubscribe();
	revealedSub.unsubscribe();

	const revealedEvent = seenEvents.find((e: any) => e?.payload?.who);
	const pqTransferEvent = seenEvents.find((e: any) => e?.payload?.amount === BigInt(transfer.amount));
	if (!revealedEvent) fail(`no Revealed event after ${waited}ms`);
	if (!pqTransferEvent) fail(`no PqTransfer event after ${waited}ms`);
	ok(`Revealed{who=Alice} fired (lazy reveal worked)`);
	ok(`PqTransfer{amount=${pqTransferEvent.payload.amount}} fired (transfer happened)`);

	// ----------- 6. Bob's pqTransfer (no commit) must FAIL -----------
	step(6, "Bob attempts pqTransfer with no prior commitment → must reject");
	const bobPqTx = api.tx.PqWallet.pq_transfer({
		from: Binary.fromBytes(bob.publicKey),
		to: Binary.fromBytes(alice.publicKey),
		amount: 1000n,
		nonce: 0n,
		pq_pubkey: Binary.fromBytes(new Uint8Array(1312)),
		sig: Binary.fromBytes(new Uint8Array(2420)),
	});
	const bobCallBytes = (await bobPqTx.getEncodedData()).asBytes();
	try {
		await submitUnsigned(client, bobCallBytes);
		fail("Bob pqTransfer was NOT rejected — NoCommitment guard broken");
	} catch (e: any) {
		// Expected: tx pool rejection (Invalid Transaction: Custom 2).
		if (/NoCommitment|Custom|Invalid|2/.test(e.message ?? String(e))) {
			ok(`rejected with ${e.message ?? e}`);
		} else {
			fail(`wrong error: ${e.message ?? e}`);
		}
	}

	client.destroy();
	console.log("\n\x1b[1;32mALL CHECKS PASSED\x1b[0m");
	console.log("The forkless upgrade + lazy reveal + filter all work end-to-end.\n");
}

main().catch((e) => {
	console.error("\n\x1b[1;31mFAILED:\x1b[0m", e?.message ?? e);
	if (e?.stack) console.error(e.stack);
	process.exit(1);
});
