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
