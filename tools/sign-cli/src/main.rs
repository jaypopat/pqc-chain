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

fn cmd_keygen(_out: &str) -> anyhow::Result<()> {
    todo!()
}

fn cmd_commit_hash(_pk: &str) -> anyhow::Result<()> {
    todo!()
}

fn cmd_sign_transfer(
    _sk: &str,
    _from: &str,
    _to: &str,
    _amount: u128,
    _nonce: u64,
    _chain_id: u32,
    _spec_version: u32,
    _out: &str,
) -> anyhow::Result<()> {
    todo!()
}
