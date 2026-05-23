# justfile

set shell := ["bash", "-uc"]

wasm_path := "target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm"
base := "/tmp/quantumleap-demo"

# List available recipes
default:
    @just --list

# Format all Rust code (nightly rustfmt — honors the polkadot .rustfmt.toml)
fmt:
    cargo +nightly fmt

# Check formatting without writing (CI-friendly)
fmt-check:
    cargo +nightly fmt --check

# Build everything + stage the v2 WASM at .demo/v2.compact.wasm for the live demo
build:
    cargo build --release -p quantumleap-node
    cargo build --release -p quantumleap-runtime-v2
    cargo build --release -p sign-cli
    mkdir -p .demo
    cp {{ wasm_path }} .demo/v2.compact.wasm
    @echo "staged: .demo/v2.compact.wasm ($(stat -c%s .demo/v2.compact.wasm) B)"

# Reset chain state, start node on v1
demo-reset: build
    -pkill -x quantumleap-nod || true
    rm -rf {{ base }}
    mkdir -p {{ base }}
    ./target/release/quantumleap-node --dev --base-path {{ base }} \
        --rpc-port 9944 --rpc-cors all 2>&1 > {{ base }}/node.log &
    sleep 4
    @echo "node up, spec_version:"
    @curl -s -H "Content-Type: application/json" \
        -d '{"id":1,"jsonrpc":"2.0","method":"state_getRuntimeVersion"}' \
        http://127.0.0.1:9944 | grep -o '"specVersion":[0-9]*' || echo "(node not up?)"

# Generate Alice's keypair and commitment hash
demo-keygen:
    mkdir -p .demo
    ./target/release/sign-cli keygen --out .demo/alice.json
    @echo "commitment:"
    @./target/release/sign-cli commit-hash --pk .demo/alice.json

# Generate a transfer payload to be submitted post-upgrade
demo-presign FROM TO AMOUNT NONCE:
    ./target/release/sign-cli sign-transfer \
        --sk .demo/alice.json \
        --from {{ FROM }} --to {{ TO }} \
        --amount {{ AMOUNT }} --nonce {{ NONCE }} \
        --out .demo/transfer{{ NONCE }}.json

# Print v2 WASM size + first hex bytes (for sudo.setCode)
demo-wasm:
    test -f {{ wasm_path }} || just build
    @echo "WASM size: $(stat -c%s {{ wasm_path }}) bytes"
    @echo "First 200 hex chars: 0x$(xxd -p {{ wasm_path }} | tr -d '\n' | head -c 200)..."

# Confirm upgraded
demo-version:
    @curl -s -H "Content-Type: application/json" \
        -d '{"id":1,"jsonrpc":"2.0","method":"state_getRuntimeVersion"}' \
        http://127.0.0.1:9944 | grep -o '"specVersion":[0-9]*\|"transactionVersion":[0-9]*' || echo "(node not up?)"

# Start ffmpeg screen recording
demo-record:
    ffmpeg -y -f x11grab -framerate 30 -video_size 1920x1080 -i :0.0 \
        -c:v libx264 -preset ultrafast -crf 22 .demo/recording.mp4

# Open polkadot-js-apps in default browser
demo-apps:
    xdg-open "https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:9944"

# Open the frontend
demo-ui:
    cd frontend && bun run dev

# Spin up everything: reset+start node, then run frontend in foreground
demo-up: demo-reset
    @echo "node running on ws://127.0.0.1:9944 (logs: {{ base }}/node.log)"
    @echo "starting frontend..."
    cd frontend && bun run dev
