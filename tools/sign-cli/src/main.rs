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
    Keygen {
        #[arg(long)]
        out: String,
    },
    CommitHash {
        #[arg(long)]
        pk: String,
    },
    SignTransfer {
        #[arg(long)]
        sk: String,
        #[arg(long)]
        from: String,
        #[arg(long)]
        to: String,
        #[arg(long)]
        amount: u128,
        #[arg(long)]
        nonce: u64,
        #[arg(long, default_value = "42")]
        chain_id: u32,
        #[arg(long, default_value = "200")]
        spec_version: u32,
        #[arg(long)]
        out: String,
    },
}

#[derive(Serialize, Deserialize)]
struct Keypair {
    pk_hex: String,
    sk_hex: String,
}

#[derive(Serialize, Deserialize)]
struct SignedTransfer {
    from: String,
    to: String,
    amount: u128,
    nonce: u64,
    pubkey_hex: String,
    sig_hex: String,
    msg_hex: String,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Keygen { out } => cmd_keygen(&out),
        Cmd::CommitHash { pk } => cmd_commit_hash(&pk),
        Cmd::SignTransfer {
            sk,
            from,
            to,
            amount,
            nonce,
            chain_id,
            spec_version,
            out,
        } => cmd_sign_transfer(&sk, &from, &to, amount, nonce, chain_id, spec_version, &out),
    }
}

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

fn cmd_commit_hash(pk: &str) -> anyhow::Result<()> {
    let kp: Keypair = serde_json::from_str(&std::fs::read_to_string(pk)?)?;
    let pk_bytes = hex::decode(&kp.pk_hex)?;
    let mut input = b"QL_PQ_COMMIT_V1".to_vec();
    input.extend_from_slice(&pk_bytes);
    use blake2::{digest::consts::U32, Blake2b, Digest};
    let mut h = Blake2b::<U32>::new();
    h.update(&input);
    println!("{}", hex::encode(h.finalize()));
    Ok(())
}

fn cmd_sign_transfer(
    sk_path: &str,
    from_hex: &str,
    to_hex: &str,
    amount: u128,
    nonce: u64,
    chain_id: u32,
    spec_version: u32,
    out: &str,
) -> anyhow::Result<()> {
    use codec::Encode;
    use fips204::ml_dsa_44;
    use fips204::traits::{SerDes, Signer};

    let kp: Keypair = serde_json::from_str(&std::fs::read_to_string(sk_path)?)?;
    let sk_bytes: [u8; ml_dsa_44::SK_LEN] = hex::decode(&kp.sk_hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("sk wrong length"))?;
    let pk_bytes: [u8; 1312] = hex::decode(&kp.pk_hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("pk wrong length"))?;
    let sk = ml_dsa_44::PrivateKey::try_from_bytes(sk_bytes)
        .map_err(|e| anyhow::anyhow!("{e:?}"))?;

    // AccountId = sp_core::crypto::AccountId32 = [u8;32]
    let from_bytes: [u8; 32] = hex::decode(from_hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("from must be 32 bytes hex"))?;
    let to_bytes: [u8; 32] = hex::decode(to_hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("to must be 32 bytes hex"))?;
    let from = sp_core::crypto::AccountId32::from(from_bytes);
    let to = sp_core::crypto::AccountId32::from(to_bytes);

    let domain: &[u8] = b"QL_PQ_TRANSFER_V1";
    let payload = (domain, chain_id, spec_version, &from, &to, amount, nonce).encode();
    let sig = sk
        .try_sign(&payload, &[])
        .map_err(|e| anyhow::anyhow!("{e:?}"))?;

    let out_obj = SignedTransfer {
        from: from_hex.to_string(),
        to: to_hex.to_string(),
        amount,
        nonce,
        pubkey_hex: hex::encode(pk_bytes),
        sig_hex: hex::encode(sig),
        msg_hex: hex::encode(&payload),
    };
    std::fs::write(out, serde_json::to_string_pretty(&out_obj)?)?;
    println!("wrote {out}");
    Ok(())
}
