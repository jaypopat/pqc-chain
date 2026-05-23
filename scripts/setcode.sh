#!/usr/bin/env bash
#
# Convert the v2 runtime WASM to hex for sudo.setCode in polkadot-js-apps.
#
# Usage:
#   scripts/setcode.sh           # prints size + first/last bytes + writes .demo/v2.code.hex
#   scripts/setcode.sh full      # also prints the full hex on stdout
#
set -euo pipefail

wasm="target/release/wbuild/quantumleap-runtime-v2/quantumleap_runtime_v2.compact.compressed.wasm"

if [[ ! -f "$wasm" ]]; then
	echo "v2 WASM not found. Build it first:" >&2
	echo "  cargo build --release -p quantumleap-runtime-v2" >&2
	exit 1
fi

mkdir -p .demo
hex_path=".demo/v2.code.hex"
python3 -c "import sys; sys.stdout.write('0x' + open('$wasm','rb').read().hex())" > "$hex_path"

size_bytes=$(stat -c%s "$wasm")
hex_len=$(stat -c%s "$hex_path")
echo "WASM file:    $wasm"
echo "WASM size:    $size_bytes bytes ($((size_bytes / 1024)) KiB)"
echo "Hex file:     $hex_path"
echo "Hex length:   $hex_len chars (incl. 0x prefix)"
echo
echo "First 64 chars: $(head -c 64 "$hex_path")..."
echo "Last  64 chars: ...$(tail -c 64 "$hex_path")"
echo
echo "Use in polkadot-js-apps:"
echo "  Developer → Sudo → system.setCode(code)"
echo "  In the 'code' field, click the upload icon and select:"
echo "    $wasm"
echo "  (or paste the contents of $hex_path)"

if [[ "${1:-}" == "full" ]]; then
	echo
	echo "--- full hex ---"
	cat "$hex_path"
fi
