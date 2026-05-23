# QuantumLeap Frontend Spec — v0.1

**Status:** locked 2026-05-23
**Owner:** Jay
**Deadline-driver:** demo by 2026-05-24 14:00

## 0. What this is

A single-page React app that takes a fresh dev-mode QuantumLeap node from
genesis to a fully-PQ chain in ~90 seconds of clicks. It is the *demo
surface* — the thing the judges see — so it must double as the product
story (slide 8: "Alice commits, sudo upgrades, Alice spends post-quantum").

This is **not** a generic block explorer or wallet. Three flows, one
banner, no menus. Everything that distracts gets cut.

## 1. Stack (locked; do not re-litigate)

| Layer        | Choice                                       | Why                                                       |
|--------------|----------------------------------------------|-----------------------------------------------------------|
| Build        | Vite 7 (already in repo)                     | Existing scaffold                                         |
| UI           | React 19 + TypeScript 5.9                    | Existing scaffold                                         |
| Styles       | Tailwind v4 + daisyUI 5                      | Existing scaffold; technical-UI palette only              |
| Chain client | polkadot-api 1.23 (`getTypedApi`)            | Existing scaffold; type-safe via codegen                  |
| Classical wallet | `@talismn/connect-wallets`               | Existing scaffold; user-facing flow on /commit            |
| Dev keys     | `@polkadot-labs/hdkd` (//Alice)              | Operator/governance flow on /upgrade                      |
| PQ crypto    | `@noble/post-quantum` (ml_dsa44)             | Pure JS, audited, ~50 KB; signs in-browser on /pq-send    |
| Fonts        | Geist + Geist Mono (self-hosted, woff2)      | Required by design-taste-frontend Technical-UI rule       |
| Icons        | `@iconify-json/mdi` (already installed)      | mdi line set; no Lucide, no FontAwesome                   |
| Router       | None — state-driven tabs                     | 4 views, zero deep links needed for demo                  |

### Net-new deps to install

```
@noble/post-quantum  @polkadot-labs/hdkd  @polkadot-labs/hdkd-helpers
```

`@noble/hashes` is a transitive dep of `@noble/post-quantum`, brings
`blake2b` for the commitment hash. No separate install needed.

### Deps to remove

Strip these public-chain descriptors from `.papi/polkadot-api.json` and
the corresponding `sdk.ts` block:
`asset_hub`, `people`, `pas_asset_hub`, `dot`, `dot_asset_hub`, `pas`.
Replace with a single `ql` entry pointed at `ws://127.0.0.1:9944`.

## 2. Information architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  QuantumLeap   [Home] [Commit] [Upgrade] [PQ Send]   v=200 ●LIVE  ●  │   ← Header
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                              <active page>                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Header** is always mounted. The spec-version chip subscribes to
  `api.constants.System.Version()` re-fetched on every new finalized
  head, so the colour flips the instant the upgrade takes effect (this
  *is* the demo's money shot).
- **Nav** is four buttons. No dropdowns. Active tab gets `border-b-2`
  in accent emerald.
- **Connect** sits at the far right of the nav (Talisman). On /upgrade
  the connect button is hidden — the page uses dev keys, no wallet.

### Header chip states

| Chain `spec_version` | Chip label    | Colour           |
|----------------------|---------------|------------------|
| 100                  | `v1 ECDSA`    | zinc-700 bg      |
| 200                  | `v2 ML-DSA`   | emerald-600 bg   |
| unknown / loading    | `…`           | zinc-300 bg, pulse |

## 3. Page-by-page contract

### 3.1 `/` — Home

Pure marketing/orientation. No tx. Has:
- One-line tagline ("A Substrate chain that walks before it runs, then
  leaps post-quantum.")
- Three numbered step cards (1: Commit → 2: Upgrade → 3: PQ Send) that
  each link to their flow.
- A small "Chain" panel: WS endpoint, current best block, current
  spec/tx version, genesis hash (truncated). Pulled from PAPI.

No external assets. Pure type + Tailwind. No hero image.

### 3.2 `/commit` — Stage 1: classical user commits a future PQ key

**User intent:** "Alice taps Commit; her wallet pops up; she signs with
her classical key; the chain stores a hash of a PQ pubkey she'll reveal
later."

**Flow:**
1. Connect Talisman (or already connected). Show selected address +
   short SS58.
2. Button: **"Generate ML-DSA-44 keypair"**. Calls
   `ml_dsa44.keygen()` (noble). Persists `{pk_hex, sk_hex}` to
   `localStorage.ql_pq_key` and shows:
   - pk: `0xab12…cd34` (1312 B), with "copy" button
   - sk: hidden by default behind a "show" toggle (2560 B). Warning
     that this is a demo wallet, not production-safe.
3. Computed inline: `commitment = blake2_256("QL_PQ_COMMIT_V1" || pk)`.
   Render the 32-byte hash with copy button.
4. Button: **"Commit on-chain"**. Builds
   `api.tx.PqRegistry.commit({ hash })`, calls `signAndSubmit` with the
   Talisman signer.
5. Loading state → success card with block hash + `Committed` event +
   "Continue to Upgrade →" link.

**Edge cases:**
- Already-committed (account has an existing commitment): show the
  stored hash and a "Re-commit" button that calls `recommit` instead.
- No wallet connected: greyed-out submit, copy says "Connect Talisman
  to sign".

### 3.3 `/upgrade` — Stage 2: sudo flips runtime v1 → v2

**User intent:** "Operator uploads v2 WASM and watches the chain
upgrade itself live, without restarting any node."

**Flow:**
1. File-drop zone accepting `.wasm`. Validates first 4 bytes are
   `\x00\x61\x73\x6d` (WASM magic). Shows file size + sha256.
2. Pre-flight panel: current `spec_version` (must be 100), target
   `spec_version` (must be 200, decoded from the WASM payload via a
   probe call — see Note A below).
3. Button: **"Upgrade chain (sudo)"**. Uses //Alice via hdkd
   (`sr25519CreateDerive(DEV_MINI_SECRET)("//Alice")`), builds:
   ```
   sudo.sudo_unchecked_weight(
     call: system.set_code(code: <wasm bytes>),
     weight: { ref_time: 0, proof_size: 0 },
   )
   ```
   `signAndSubmit` with the dev signer.
4. Three-step status tracker:
   - `[1/3] sudo extrinsic submitted` → tx hash
   - `[2/3] set_code dispatched in block #N`
   - `[3/3] runtime upgraded — spec_version 100 → 200` (waits on the
     header chip flipping, see §2)
5. Success: green panel, links to /pq-send.

**Note A (target spec_version probe):** Easiest path: don't probe. Just
display "target: 200 (expected)" as a static label sourced from the
file name (`quantumleap_runtime_v2.compact.compressed.wasm`). If the
file name doesn't match, warn but allow submit. Probing the WASM
payload for `spec_version` would require parsing the wasm module — not
worth the time.

### 3.4 `/pq-send` — Stage 3: lazy reveal + post-quantum transfer

**User intent:** "Alice spends the balance her commitment protects.
The chain validates her ML-DSA signature, records her pubkey for the
first time (lazy reveal), and moves the funds."

**Flow:**
1. Require: localStorage `ql_pq_key` exists AND a Committed event has
   been seen for the connected account. If not, link back to /commit.
2. Form:
   - `from` AccountId (defaults to connected account, 32-byte hex)
   - `to`   AccountId (input; default //Bob for demo)
   - `amount` (numeric, in plancks, with a UNIT toggle)
   - `nonce` (numeric, default 0, with "auto-suggest next" button that
     reads `pqWallet.nonceOf(from)` storage if it exists, else 0)
3. **Payload preview** panel (collapsed by default, "Show bytes" toggle
   for nerd points):
   ```
   domain (17 B):     QL_PQ_TRANSFER_V1
   chain_id u32:      42
   spec_version u32:  200
   from   [u8;32]:    0xd4…27d
   to     [u8;32]:    0x8e…a48
   amount u128:       1000000000000
   nonce  u64:        0
   ─────────
   total msg bytes:   105
   ```
4. Button: **"Sign + submit"**.
   - Build `payload = b"QL_PQ_TRANSFER_V1" || SCALE.encode((chain_id, spec_version, from, to, amount, nonce))`
   - `sig = ml_dsa44.sign(sk, payload, ctx=new Uint8Array())`
   - Build extrinsic via `api.tx.PqWallet.pq_transfer({...})`
   - Get encoded call bytes; wrap as unsigned v4 extrinsic
     (`0x04 || callBytes`, compact-length-prefixed); submit via
     `client._request("author_submitExtrinsic", [hex])` (matches
     scripts/e2e/run.ts).
5. Status tracker:
   - `[1/3] payload encoded — 105 B`
   - `[2/3] signed — sig=2420 B, pk=1312 B`
   - `[3/3] in block #N — Revealed{who} + PqTransfer{amount} emitted`

**Edge cases:**
- `from` AccountId hex must equal the committer (because the pallet
  looks up the commitment by `from`). Validate before signing.
- If a tx-pool rejection comes back (`Invalid Transaction: Custom 2 =
  NoCommitment`), surface it verbatim — that error message is itself
  part of the demo on slide 11.

## 4. Component tree

```
src/
├── main.tsx
├── App.tsx                        ← page switch + provider
├── style.css                      ← tailwind layers + Geist @font-face
│
├── components/
│   ├── Header.tsx                 ← logo + nav + SpecBanner + Connect
│   ├── Nav.tsx                    ← 4 tab buttons
│   ├── SpecBanner.tsx             ← live spec_version chip
│   ├── Connect.tsx                ← Talisman picker (existing, lightly tweaked)
│   ├── StatusTracker.tsx          ← reusable 3-step list w/ check/spinner/idle
│   ├── HexField.tsx               ← labelled hex w/ copy button + truncate
│   ├── FileDropZone.tsx           ← /upgrade wasm picker (validates magic)
│   └── ToastHost.tsx              ← bottom-right toast for tx events
│
├── pages/
│   ├── Home.tsx
│   ├── Commit.tsx
│   ├── Upgrade.tsx
│   └── PqSend.tsx
│
├── hooks/
│   ├── useChain.ts                ← memoised PAPI client/typed-api
│   ├── useRuntimeVersion.ts       ← subscribes to spec/tx version
│   ├── useBestBlock.ts            ← finalized + best head
│   ├── useConnect.ts              ← Talisman selected account (existing, kept)
│   └── usePqKeypair.ts            ← localStorage-backed PQ key state
│
├── utils/
│   ├── sdk.ts                     ← single ql client factory (rewrites existing)
│   ├── devKeys.ts                 ← //Alice sr25519 signer via hdkd
│   ├── mlDsa.ts                   ← noble keygen + sign + verify wrappers
│   ├── commitment.ts              ← blake2_256(domain || pk)
│   ├── transferPayload.ts         ← encode_transfer_msg<T>() mirror
│   ├── unsignedExtrinsic.ts       ← wrap call bytes + author_submitExtrinsic
│   ├── formatters.ts              ← shortHex(), planckToUnit(), etc. (existing)
│   └── storage.ts                 ← typed localStorage wrappers
```

Roughly: 4 pages, 8 components, 5 hooks, 8 utils. Manageable.

## 5. Visual system

Per `design-taste-frontend` Technical-UI rule:

| Token            | Value                                                                |
|------------------|----------------------------------------------------------------------|
| Background       | `bg-zinc-50` (page) / `bg-white` (cards)                             |
| Surface border   | `border border-zinc-200` + `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`     |
| Accent           | Emerald-600 (CTAs, success, active tab indicator). One accent only.  |
| Text body        | `text-zinc-700 leading-relaxed`                                      |
| Text mono        | `font-mono text-zinc-800` (Geist Mono) — for hashes, keys, addresses |
| Display          | `font-sans tracking-tight text-zinc-950`                             |
| Error            | `text-rose-600` + `border-rose-200 bg-rose-50` panel                 |
| Spacing rhythm   | Page padding `px-6 py-10`; section gap `space-y-8`; card pad `p-6`   |
| Max width        | `max-w-3xl mx-auto` on each page (focused, not edge-to-edge)         |

**Banned per skill rules:** Inter, purple/lila, neon gradients, drop
shadows darker than 0.05 alpha, edge-to-edge sticky nav, emoji in UI.

**Motion:** intentionally low. The only animation in the app is the
header chip pulse on the upgrade. No GSAP, no scroll-triggers — this
is a tool, not a landing page.

## 6. State + data flow

- `useChain()` returns a memoised `{ client, api }` keyed off the
  hard-coded WS URL. Single client for the whole app — PAPI handles
  metadata refresh on runtime upgrade via its chainHead subscription,
  so we never have to recreate.
- `useRuntimeVersion()` exposes `{ spec, tx, name }`. Re-reads
  `api.constants.System.Version()` on every new finalized head and
  swaps. This drives the header chip.
- `usePqKeypair()` reads/writes `localStorage.ql_pq_key` (JSON
  `{pk_hex, sk_hex, createdAt}`). Provides `clear()` for re-runs.
- `useConnect()` (existing): Talisman selected account.
- No Redux, no Zustand. `@xstate/store` already installed but unused
  for now — local `useState` is enough for 4 pages.

## 7. Demo runbook (what the operator clicks live)

```
0. Fresh node:  rm -rf /tmp/quantumleap-demo && \
                ./target/release/quantumleap-node --dev --tmp \
                  --rpc-cors all --rpc-port 9944 &
1. cd frontend && bun dev   →  http://localhost:5173

[Home]      shows "v1 ECDSA" chip,  best block ticking.
[Commit]    Connect Talisman → //Alice imported.
            Generate keypair  → pk + sk shown.
            Commit on-chain   → wallet popup → sign → ✓ Committed.
[Upgrade]   Drop quantumleap_runtime_v2.compact.compressed.wasm.
            Click Upgrade     → tx submitted →
            chip flips v1 → v2 (live, no refresh).
[PQ Send]   from = Alice's hex, to = //Bob, amount = 1000000000000.
            Sign + submit     → ✓ Revealed + PqTransfer in block #N.
```

Total live-click time target: **< 90 seconds**.

## 8. Risks + mitigations

| Risk                                                  | Mitigation                                                       |
|-------------------------------------------------------|------------------------------------------------------------------|
| `@noble/post-quantum` ML-DSA bytes don't match Rust   | Add a vitest that signs a fixed vector + verifies with sign-cli-produced sig (skip if no time). Smoke-tested manually first. |
| Talisman not installed on judge's machine             | Ship a fallback "use //Alice dev key" toggle on /commit. Default is wallet for the live demo. |
| PAPI metadata refresh fails after upgrade             | Already handled by chainHead subscription in PAPI 1.23 (verified in scripts/e2e). If it regresses, fall back to client.destroy + recreate. |
| WASM upload too big for ext popup signing             | We use dev key, not Talisman, on /upgrade specifically to avoid this. |
| spec_version chip doesn't flip (race)                 | useRuntimeVersion polls on every finalised head AND re-reads on focus. Worst case the user clicks the [PQ Send] tab and we re-read on mount. |

## 9. Out of scope (will not build)

- Multi-account picker (always uses connected Talisman or //Alice).
- Real fee estimation / weight UI.
- Transaction history / explorer.
- Mobile responsive past `sm:` — the demo runs on Jay's laptop.
- Dark mode.
- i18n.
- Storybook.
- Unit tests for the page components themselves; only the crypto
  helpers (commitment, transferPayload) get a vitest.

## 10. Implementation order

Five tasks, can be parallelised after F1 lands:

- **F1** — Repoint PAPI descriptors at `ws://127.0.0.1:9944`, regen.
  Blocks everything else because every page imports the `ql`
  descriptor.
- **F2** — App shell (Header, Nav, SpecBanner, Connect, page switch).
  Depends on F1.
- **F3** — `/commit` page.   Depends on F2.
- **F4** — `/upgrade` page.  Depends on F2.
- **F5** — `/pq-send` page.  Depends on F2 *and* F3 (key in storage).

F3/F4/F5 can run as three parallel sub-agents once F2 is merged.

End.
