use assert_cmd::Command;
use tempfile::tempdir;

#[test]
fn keygen_writes_valid_json_with_correct_lengths() {
    let dir = tempdir().unwrap();
    let out = dir.path().join("alice.json");
    Command::cargo_bin("sign-cli")
        .unwrap()
        .args(["keygen", "--out", out.to_str().unwrap()])
        .assert()
        .success();

    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&out).unwrap()).unwrap();
    let pk_hex = json["pk_hex"].as_str().unwrap();
    let sk_hex = json["sk_hex"].as_str().unwrap();
    assert_eq!(pk_hex.len(), 1312 * 2); // hex-encoded
    assert!(sk_hex.len() > 0);
}

#[test]
fn commit_hash_matches_blake2_of_domain_plus_pk() {
    let dir = tempdir().unwrap();
    let key_path = dir.path().join("a.json");
    Command::cargo_bin("sign-cli")
        .unwrap()
        .args(["keygen", "--out", key_path.to_str().unwrap()])
        .assert()
        .success();

    let output = Command::cargo_bin("sign-cli")
        .unwrap()
        .args(["commit-hash", "--pk", key_path.to_str().unwrap()])
        .output()
        .unwrap();
    let hash_hex = std::str::from_utf8(&output.stdout).unwrap().trim();
    assert_eq!(hash_hex.len(), 64); // 32 bytes hex

    // Recompute manually.
    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&key_path).unwrap()).unwrap();
    let pk_bytes = hex::decode(json["pk_hex"].as_str().unwrap()).unwrap();
    let mut input = b"QL_PQ_COMMIT_V1".to_vec();
    input.extend_from_slice(&pk_bytes);
    use blake2::{digest::consts::U32, Blake2b, Digest};
    let mut h = Blake2b::<U32>::new();
    h.update(&input);
    let expected = hex::encode(h.finalize());
    assert_eq!(hash_hex, expected);
}

#[test]
fn sign_transfer_writes_valid_signed_payload() {
    let dir = tempdir().unwrap();
    let key_path = dir.path().join("a.json");
    let out_path = dir.path().join("tx.json");
    Command::cargo_bin("sign-cli")
        .unwrap()
        .args(["keygen", "--out", key_path.to_str().unwrap()])
        .assert()
        .success();

    // AccountId encoded as SS58 in real chain; for the CLI we accept raw hex
    // (32-byte) so the message bytes are deterministic.
    let alice_hex = "d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    let bob_hex = "8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48";

    Command::cargo_bin("sign-cli")
        .unwrap()
        .args([
            "sign-transfer",
            "--sk",
            key_path.to_str().unwrap(),
            "--from",
            alice_hex,
            "--to",
            bob_hex,
            "--amount",
            "100",
            "--nonce",
            "0",
            "--out",
            out_path.to_str().unwrap(),
        ])
        .assert()
        .success();

    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&out_path).unwrap()).unwrap();
    assert_eq!(v["pubkey_hex"].as_str().unwrap().len(), 1312 * 2);
    assert_eq!(v["sig_hex"].as_str().unwrap().len(), 2420 * 2);
    // SCALE-encoded `&[u8]` prepends a Compact<u32> length prefix; for the
    // 17-byte domain that's a single byte (0x44). The domain bytes follow.
    assert!(v["msg_hex"]
        .as_str()
        .unwrap()
        .contains(&hex::encode(b"QL_PQ_TRANSFER_V1")));
}

#[test]
fn cli_produced_signature_verifies_with_pq_crypto() {
    let dir = tempdir().unwrap();
    let key_path = dir.path().join("a.json");
    let tx_path = dir.path().join("tx.json");
    Command::cargo_bin("sign-cli")
        .unwrap()
        .args(["keygen", "--out", key_path.to_str().unwrap()])
        .assert()
        .success();
    Command::cargo_bin("sign-cli")
        .unwrap()
        .args([
            "sign-transfer",
            "--sk",
            key_path.to_str().unwrap(),
            "--from",
            "d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d",
            "--to",
            "8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48",
            "--amount",
            "100",
            "--nonce",
            "0",
            "--out",
            tx_path.to_str().unwrap(),
        ])
        .assert()
        .success();

    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&tx_path).unwrap()).unwrap();
    let pk = hex::decode(v["pubkey_hex"].as_str().unwrap()).unwrap();
    let sig = hex::decode(v["sig_hex"].as_str().unwrap()).unwrap();
    let msg = hex::decode(v["msg_hex"].as_str().unwrap()).unwrap();
    assert!(pq_crypto::pq_crypto::verify(&pk, &sig, &msg));
}
