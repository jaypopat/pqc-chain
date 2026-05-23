# QuantumLeap — 4-Minute Pitch Script

> **Format note:** Official slot is 3:00 presentation + 1:00 Q&A. This script runs ~3:50 so you have buffer. Lines marked `[CUT TO HIT 3:00]` can be dropped if timing is strict. Rehearse both versions.

**Legend:** `[SCREEN]` = what's displayed · **bold** = hit it hard · *(italics)* = delivery note

---

## 0:00 – 0:35 — The Hook

`[SCREEN: Black slide, one line of white text: "A Tuesday in 2030."]`

**SAY:**
> "Picture a Tuesday in 2030. Someone announces a working quantum computer that breaks the cryptography behind every major blockchain. Within the hour, wallets are being drained across every chain on earth.
>
> *(beat — pause one second)*
>
> Every wallet — except the ones that did one small thing, five years earlier.
>
> I'm going to show you that one thing. And I'm going to do it live, on a running blockchain."

*(Calm, not rushed. The pause after "drained" is the whole hook. Let it land.)*

---

## 0:35 – 1:00 — Why This Is Fidelity's Problem

`[SCREEN: Title slide — "QuantumLeap: crypto-agility as a runtime upgrade." Your name underneath.]`

**SAY:**
> "Every blockchain today signs transactions with elliptic-curve cryptography. Quantum computers break it. We don't know exactly when — but we know attackers are already harvesting today's chain data to decrypt it the day they can.
>
> For a custodian like Fidelity, that's not a 2030 problem. That's a *today* problem. The assets you hold now are being recorded now, to be stolen later."

*(Make eye contact with the judges on "custodian like Fidelity." This is where they lean in.)*

---

## 1:00 – 1:25 — The Gap

`[SCREEN: Two-column slide. Left: "The obvious fix" with a red ✗. Right: "What it misses" — three bullets appearing one at a time.]`

**SAY:**
> "The obvious fix is: add post-quantum signatures, tell everyone to register their new keys. But that misses three things.
>
> One — it leaves a window where attackers race you during the migration.
> Two — it puts your new post-quantum public keys on-chain *today* — and those algorithms are new. If *they* fall later, you've handed the attacker a head start.
> Three — it gives you no plan for the hop after that."

*(Brisk. This is the setup for why your design is smarter — don't dwell.)*

---

## 1:25 – 1:50 — The Solution in One Breath

`[SCREEN: Three-step diagram — "1. Commit  →  2. Stay invisible  →  3. Swap the lock". Clean icons.]`

**SAY:**
> "So we do three things differently.
>
> **Commit early** — users register a *hash* of their future quantum key, signed with the key they already trust.
> **Stay invisible** — the quantum key itself never touches the chain until the first time you spend. Cold storage stays safe indefinitely.
> **Swap the lock** — when the threat is real, the chain upgrades its signature scheme with no fork, no halt, same accounts.
>
> Let me show you all three. This is a live chain."

---

## 1:50 – 3:10 — THE DEMO *(your money minute — 80 seconds)*

`[SCREEN: Switch to live frontend + node logs side by side. Block height ticking.]`

**SAY:**
> "Here's our chain, producing blocks. Alice and Bob, two accounts. Right now it's the classical world."

`[SCREEN: polkadot-js-apps → Extrinsics → balances.transferKeepAlive, Alice → Bob, 10 units. Submit.]`

> "Alice sends Bob ten units with a normal transfer." *(submit in polkadot-js — show it confirm in a block)* "Works fine. This is every blockchain today."

*(The classical transfer is **not** a frontend button — do it in polkadot-js-apps. Bonus: it's the exact same call you'll show getting rejected after the upgrade, so keep the polkadot-js tab open.)*

`[SCREEN: /commit page]`

> "Now Alice protects herself. She generated a post-quantum keypair **on her laptop** — it never left. She commits just the *hash* of it."

*(Click commit. Show the `Committed` event.)*

> "The chain now knows Alice has a commitment. It does **not** know her quantum key. That's the harvest-proof part."

`[SCREEN: /upgrade page — WASM drop zone. Show spec_version banner reading "100".]`

> "Now — Q-day. We upgrade the live chain's cryptography. Watch the version number."

*(Submit set_code. Point at the banner.)*

> **"Spec version — one hundred — to two hundred. Live. No fork. No re-sync. Same chain, same balances, same accounts. The signature scheme just changed underneath everyone's feet."**

*(This is the wow. Pause. Let them see the number tick.)*

`[SCREEN: back to the polkadot-js-apps tab — the SAME balances.transferKeepAlive call from before, Bob → anyone. Submit.]`

> "Now watch what happens to the old way. The exact same transfer call we just ran—"

*(Submit in polkadot-js. It fails: `CallFiltered`. Show the error.)*

> "—**rejected.** `CallFiltered`. Classical transfers are dead on this chain. Even if an attacker has Bob's old key, the funds won't move."

*(Reusing the identical polkadot-js call before and after the upgrade is the sharpest possible contrast — same input, opposite outcome, because the runtime changed underneath it.)*

`[SCREEN: /pq-send page — Alice]`

> "Alice spends the new way. Her transfer is signed with her quantum key. The chain checks the key matches her commitment, verifies the signature, and transfers — **all in one atomic step.**"

*(Submit. Show single `PqTransfer` event + balance update.)*

> "Reveal and spend, together. And Bob, who never committed?"

*(Attempt Bob pq_transfer. Show `NoCommitment` error.)*

> "**Exposed.** Same as never turning on two-factor. Committing early *is* the product."

*(Don't rush the demo. If anything stutters for more than 5 seconds, say "let me show you the recorded run" and cut to the backup video without apology.)*

---

## 3:10 – 3:30 — Honest Trade-offs

`[SCREEN: Slide — "What we're honest about" — three short bullets.]`

**SAY:**
> "Three things we'll own. If quantum breaks ECDSA *before* the upgrade, that's a governance-speed race, not a crypto problem. Post-quantum signatures are bigger — a few kilobytes per transfer. And node operators upgrade their software once to enable this.
>
> Everything else — the agility is permanent." `[CUT TO HIT 3:00]`

*(Saying your weaknesses out loud builds more trust than any feature. Deliver it confidently, not apologetically.)*

---

## 3:30 – 3:50 — The Fidelity Close

`[SCREEN: Final slide — "What ships Monday." A mock wallet screen with one toggle: "Enable Quantum Recovery ✓"]`

**SAY:**
> "Here's what this means for Fidelity. The commit step is **one transaction.** In a wallet, it's **one button** — *Enable Quantum Recovery.* No new chain, no migration, no friction for the customer.
>
> And the migration itself is **forkless.** For a custodian, a hard fork is an operational and compliance nightmare — chain splits, asset reconciliation, customer re-onboarding. This is none of that. **One governed, auditable transaction. Continuity of custody — the cryptography changes, nothing your customers hold does.** " `[CUT TO HIT 3:00]`
>
> Customers who tap it survive Q-day. And when the post-quantum scheme itself eventually falls, the **same pattern** carries them to the next one. On a public chain today — or a permissioned chain for a regulated custodian, where the upgrade is even faster and fully auditable. `[CUT TO HIT 3:00]`
>
> **Crypto-agility, as a property of the chain — and a single tap for your customer. That's QuantumLeap. Thank you."**

*(Land "thank you" cleanly. Stop. Don't trail off into "yeah, so…". Silence is strong.)*

---

## Pre-Stage Checklist (tape this to your laptop)

- [ ] Node running on v1, blocks producing, Alice & Bob pre-funded
- [ ] v2 WASM blob on disk, drop-zone tested
- [ ] sign-cli outputs pre-generated: Alice's commit hash + Alice's pq_transfer `tx.json`
- [ ] Backup video queued in a **second tab**, one click away
- [ ] spec_version banner large enough to read from the back of the room
- [ ] Slides on a separate device from the demo (so a frontend crash doesn't kill your slides)
- [ ] Run the full thing end-to-end **5 times** Sunday morning

---

## Q&A — Pre-Loaded Answers (rehearse 15s each)

- **"Multi-chain?"** → "Commit registry is a contract on any chain. Only the *spend* side needs forkless upgrades — that's where Substrate shines. The pre-positioning works everywhere today."
- **"What about the pre-upgrade window / governance speed?"** → "On a public chain, that gap is governance speed. But a regulated custodian would deploy this on a *permissioned* chain — a known validator set that coordinates an emergency upgrade in minutes, not months, with full audit trail. The crypto-agility primitive is identical; the governance just gets faster *and* more accountable. Regulation isn't a constraint here — it's what makes the upgrade fast. And because you control every node, the one-time binary upgrade for the verifier is trivial too."
- **"Why not hybrid ECDSA + ML-DSA?"** → "Natural next step, and smoother for migration. We shipped the crisp single-scheme version for the demo; hybrid is a config change."
- **"Why ML-DSA-44 not -87?"** → "Smaller signatures, faster verify, still NIST Category 2. One-line swap to go higher."
- **"What if fips204 has a bug?"** → "The verifier is a swappable runtime interface — same upgrade mechanism fixes the implementation, not just the scheme."
- **"Solo?"** → "Solo, over the weekend — so it's one chain done properly rather than a survey. Generalising it is the next month, not the next 48 hours."
