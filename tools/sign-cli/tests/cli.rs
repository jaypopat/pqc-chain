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
