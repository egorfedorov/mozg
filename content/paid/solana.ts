export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ------------------------------------------------- Account model attacks
  {
    title: "Is the program actually checking who owns this account?",
    body: "On Solana, any transaction can pass ANY account whose data happens to deserialize — the runtime does not verify an account belongs to your program. The classic bug: an instruction reads a state account via raw `AccountInfo` (or Anchor `UncheckedAccount`) and trusts its contents without checking `account.owner == &program_id`. An attacker crafts their own account under their own program (or the system program), writes attacker-controlled bytes into it, and passes it in as the \"config\", \"oracle\", or \"vault\" account. Fix: always verify `owner`, or use Anchor's `Account<'info, T>` which enforces owner = declaring program plus the 8-byte discriminator. Detection signal: any `try_from_slice`, `deserialize`, or `UncheckedAccount` without a preceding owner check. This is the Solana-native equivalent of trusting unvalidated external storage.",
    category: "Account model attacks",
    kind: "rule",
  },
  {
    title: "Can two same-type accounts be swapped in this instruction?",
    body: "Account confusion: when an instruction takes two accounts of the SAME type (e.g., `user_a` and `user_b`, or `vault` and `treasury` — both `Account<'info, Vault>`), the owner and discriminator checks pass for either slot, so nothing stops an attacker from swapping them or passing the attacker's own account where the victim's is expected. The fix is relational validation: every state account should store the pubkeys of the accounts it's tied to (authority, mint, vault), and the instruction must assert those links — in Anchor that's `has_one = authority`, `has_one = mint`, or `constraint = vault.authority == authority.key()`. Audit procedure: for every account pair of identical type in a `#[derive(Accounts)]` struct, ask \"what breaks if these are swapped or aliased?\" If the answer involves value moving the wrong way, it's a finding.",
    category: "Account model attacks",
    kind: "rule",
  },
  {
    title: "Are duplicate mutable accounts rejected here?",
    body: "If an instruction expects two distinct mutable accounts (e.g., `from` and `to` token accounts, `source` and `destination` staking accounts), Solana happily passes the SAME account in both slots. Effects range from broken accounting (a self-transfer that mints or burns net value because debit and credit read/write different cached states) to full exploits when the two roles have different trust assumptions. Fix in Anchor: `constraint = from.key() != to.key() @ ErrorCode::DuplicateAccounts`, or design so aliasing is harmless. Raw programs: compare `from.key == to.key` explicitly. Detection signal: any instruction taking two or more `#[account(mut)]` accounts of the same type with no inequality constraint. Note the reverse trap: some protocols intentionally require aliasing (merge operations) — check the spec before reporting.",
    category: "Account model attacks",
    kind: "pitfall",
  },
  {
    title: "Could a fake token mint slip past this validation?",
    body: "Creating a new SPL mint costs a fraction of a SOL, so any mint pubkey an attacker supplies is presumed hostile. Classic patterns: a program accepts a deposit of \"collateral\" and credits it against a hardcoded mint it never verifies; a reward program trusts `mint` from a user-supplied token account without checking `token_account.mint == expected_mint`; or a pricing path reads decimals from the attacker's mint (6 vs 9 decimals = 1000x mispricing). Fix: hardcode or store canonical mint addresses and assert equality — Anchor: `constraint = mint.key() == EXPECTED_MINT` or `address = EXPECTED_MINT`; always derive token-account expectations from the mint, not the reverse. Detection signal: `ctx.accounts.mint` used in transfer/burn/mint CPI whose address is never pinned against a constant or a stored config field.",
    category: "Account model attacks",
    kind: "pitfall",
  },
  {
    title: "What stops abuse of remaining_accounts in this instruction?",
    body: "`ctx.remaining_accounts` is an unvalidated free-for-all: Anchor applies ZERO checks to accounts passed there, and raw programs doing manual iteration often skip owner/signer/writability validation entirely. Abuse shapes: passing N attacker-owned accounts where the protocol expected program-owned ones (each credited as a deposit); passing the same account repeatedly to multiply rewards; passing a fake oracle or fee-destination account. Rule: every account pulled from `remaining_accounts` must get the same treatment as a named account — owner check, discriminator/deserialization check, address or seeds check against stored state, and explicit duplicate detection if iteration assumes uniqueness. Detection signal: loops over `remaining_accounts` doing CPI or balance reads with only `try_from_slice` inside. Flag any reward/fee/collateral logic driven by unvalidated tail accounts.",
    category: "Account model attacks",
    kind: "rule",
  },
  {
    title: "Can lamports be drained or rent-exemption broken on this account?",
    body: "Solana accounts carry a lamport balance independent of their data. As of early 2026 the runtime enforces rent exemption for newly allocated accounts, but live accounts can still be pushed below the rent-exempt minimum or drained entirely by bugs: paying transaction fees from a protocol PDA, `close`-style code that transfers lamports to a user-supplied recipient without validation, or `assign`/`allocate` patterns that shrink the balance an attacker can then siphon via a subsequent instruction. Draining a vault PDA's lamports below rent exemption breaks the account; draining to zero + reassigning owner enables full reinitialization. Rule: lamport-moving code (`**lamports.borrow_mut()`, `system_instruction::transfer`, `close`) must check the recipient against stored state and leave the source at or above `Rent::minimum_balance(data_len)`. Audit every direct lamport mutation — it's where raw-program exploits hide.",
    category: "Account model attacks",
    kind: "pitfall",
  },
  // ------------------------------------------------ Signer and authority checks
  {
    title: "Where is the signer check on this privileged instruction?",
    body: "The Solana runtime only guarantees `is_signer` reflects an actual signature; the PROGRAM must check it. Raw-program bug: an admin/withdraw instruction reads an `authority` pubkey from state and compares it to a passed account's key but never asserts `authority_info.is_signer` — anyone calls it with the real authority's pubkey (pubkeys are public) and moves funds. Anchor makes the common case easy (`authority: Signer<'info>` plus `has_one = authority`) and the wrong case silent: using `AccountInfo`/`UncheckedAccount` for the authority compiles fine and checks nothing. Detection signals: `ctx.accounts.authority.key() == state.authority` comparisons where `authority` isn't a `Signer`; raw `invoke` paths missing `if !authority.is_signer { return Err(...) }`. Every state-changing instruction that references a stored authority needs both the key match AND the signature.",
    category: "Signer and owner checks",
    kind: "rule",
  },
  {
    title: "Is this PDA's authority being lent to a hostile CPI?",
    body: "`invoke_signed` lets a program sign with its PDA — and if the CPI target program or any account in that call is attacker-controlled, the attacker just got the PDA to authorize whatever they want. Patterns: a \"router\" instruction that takes an arbitrary `program_id` and invokes it signed with the protocol's vault PDA (instant drain); a program that CPIs into a user-supplied token program; a program that signs a transfer where the destination token account is unvalidated (PDA signs, funds go to the attacker). Rule: `invoke_signed` calls must pin the target program id against a constant/allowlist AND validate every account the signed authority touches — destination token accounts must be checked for correct mint and owner. Audit question: \"if I control every account and program in this call except the signer PDA, what can I make it sign?\"",
    category: "Signer and owner checks",
    kind: "pitfall",
  },
  {
    title: "Are stale token delegate approvals revoked before state changes?",
    body: "SPL token accounts carry an optional `delegate` + `delegated_amount` that survives transfers of the account data across instructions. Programs that take custody semantics — escrows, staking, lending — often `approve` a delegate and later assume the approval is gone, or accept a user token account that already has a delegate set to a third party (who then pulls the deposited tokens back out via `transfer_checked` as delegate). Mirror-image bug: a program that closes/reassigns a token account without first `revoke`ing an outstanding delegate leaves a live allowance pointing at recycled state. Rule: custody instructions should reject incoming token accounts with `delegate.is_some()` (or explicitly revoke first), and close/finalize paths must revoke before closing. Detection signal: `approve` CPIs with no matching `revoke` on every exit path, including error paths.",
    category: "Signer and owner checks",
    kind: "example",
  },
  {
    title: "Can authority rotation brick or hijack this account?",
    body: "Programs that support `set_authority`-style updates (including SPL token's own `SetAuthority` for mints and accounts) have two failure modes. Hijack: the rotation instruction validates the OLD authority as signer but lets the caller set an arbitrary NEW authority without the new one signing — typo'd or attacker-substituted addresses become permanent owners; better pattern is two-step (propose + accept) or requiring the new authority to sign. Brick: rotating away a mint's `mint_authority` or `freeze_authority` permanently, or a program storing `authority` in state and letting it be set to a PDA nobody can sign for. Also check Anchor's `has_one = authority` still binds after rotation — if authority is stored in two places (state + token account authority field) they can desync. Audit both the rotation instruction and every consumer of the rotated field.",
    category: "Signer and owner checks",
    kind: "pitfall",
  },
  // ------------------------------------------------------------ PDAs and bumps
  {
    title: "Is a non-canonical bump accepted for this PDA?",
    body: "`find_program_address` returns the CANONICAL bump — the first value from 255 downward that lands off the ed25519 curve. But `create_program_address` accepts any valid (seeds, bump) pair, and a given seed set can have multiple valid bumps. If a program derives an address with a user-supplied bump instead of re-running `find_program_address` (or comparing against the canonical bump stored at init), an attacker can create a SECOND account at the same seeds with a different bump — splitting state the protocol assumed was unique (two \"global\" configs, two vaults for one user). Fix: in Anchor, store the bump at init and use `seeds = [...], bump = state.bump`; in raw code, recompute with `find_program_address` and compare. Detection signal: `bump` taken from instruction args or unconstrained in `#[account(seeds, bump)]` without a stored value.",
    category: "PDAs and bumps",
    kind: "rule",
  },
  {
    title: "Are the PDA seeds themselves fully validated?",
    body: "Checking that an account IS a PDA of your program is not enough — the seeds encode WHICH PDA, and partial seed validation is a whole bug class. Common misses: deriving with `find_program_address(&[b\"vault\"], ...)` and forgetting the `user.key()` seed, so every user maps to one shared vault; accepting a `vault` account whose seeds bind it to `mint_A` in an instruction operating on `mint_B`; seeds that include an attacker-controlled field (a \"name\" string) allowing collision or pre-computed squatting on expected addresses. Rule: list every domain separator the PDA conceptually depends on (user, mint, market, epoch) and confirm each appears in the `seeds = [...]` constraint with the values coming from validated accounts, not raw instruction arguments. In Anchor, `seeds` + `bump` re-derives and compares the address — but only with the seeds you actually wrote.",
    category: "PDAs and bumps",
    kind: "rule",
  },
  {
    title: "Is one PDA reused across security domains?",
    body: "PDA sharing: using the same PDA as authority for multiple unrelated resources — e.g., one program PDA that is simultaneously the token-vault authority, the mint authority for a receipt token, and the upgrade authority of an aux program. Any code path (or CPI to a compromised/malicious program) that can make the PDA sign for ONE purpose can be leveraged for the others; blast radius multiplies silently. It also breaks the principle that seeds encode intent: `seeds = [b\"vault\", market]` vs `seeds = [b\"mint_auth\", market]` cost nothing. Rule: one PDA per authority role, namespaced by seed prefix; never let a PDA that signs user-triggered CPIs also hold mint/freeze/upgrade authority unless that exact composition is the design. Audit move: enumerate every account whose authority/owner field equals a program PDA and check whether one PDA appears in more than one role.",
    category: "PDAs and bumps",
    kind: "pitfall",
  },
  {
    title: "Can this PDA be front-run at initialization?",
    body: "PDA addresses are deterministic, so anyone can compute them — and several init flows are raceable. If initialization seeds don't include the initializer's key (e.g., `seeds = [b\"config\"]` for a singleton, or `[b\"stake\", mint]` for a per-mint pool), an attacker can initialize the account FIRST with themselves as stored authority, then the protocol either fails to launch or — worse — the protocol's later code treats the attacker-initialized account as valid because only seeds/bump are checked, not the stored authority. Variants: `init_if_needed` on an account an attacker pre-created via raw system instructions (Anchor checks discriminator, so pre-creation with the RIGHT discriminator by your own program is the real risk). Rule: singleton PDAs should be initialized by a hardcoded admin or include the authority in seeds; verify stored authority fields, not just derivability.",
    category: "PDAs and bumps",
    kind: "pitfall",
  },
  // ------------------------------------------------ CPI and program confusion
  {
    title: "Is the CPI target program id verified?",
    body: "Arbitrary CPI is the Solana reentrancy-class bug: an instruction receives a `program_id` account (commonly `token_program`) and invokes it without checking the address. Attacker deploys a mimic program with the same instruction interface, passes it instead of SPL Token, and the \"transfer\" does nothing (or logs fake success) while the protocol credits a deposit. Worse with `invoke_signed`: the mimic receives the protocol's PDA signature and can be coded to do anything that signature authorizes in a composed transaction. Fix: Anchor `token_program: Program<'info, Token>` enforces the address; raw code needs `if *token_program.key != spl_token::ID { return Err }`. Detection signal: `invoke`/`invoke_signed` where the program id comes from an instruction account whose address isn't asserted. As of early 2026, also check Token-2022 pinning — `Interface<'info, TokenInterface>` accepts both, which is its own hazard.",
    category: "CPI and program confusion",
    kind: "rule",
  },
  {
    title: "Does this program break or leak value under Token-2022?",
    body: "Token-2022 (Token Extensions) mints behave differently in ways that break programs written for classic SPL Token: transfer-fee mints deliver LESS than the requested amount to the destination (accounting that credits `amount` on deposit leaks the difference); permanent delegates can move user tokens; default-account-state can freeze new accounts; transfer hooks execute arbitrary program logic mid-transfer (a reentrancy-shaped surface); non-transferable mints make transfers fail outright; and extension-bearing accounts are LARGER than the classic 165-byte token account, so hardcoded size math and `Account` deserialization assumptions break. Rule: if the protocol must support Token-2022, use `transfer_checked`, compute net-of-fee amounts via `get_transfer_fee`, and use `InterfaceAccount<TokenAccount>`; if it must NOT, explicitly pin `token_program` to the classic Token program and reject extension mints — silently accepting both is the finding.",
    category: "CPI and program confusion",
    kind: "fact",
  },
  {
    title: "Could sysvar accounts still be spoofed in this codebase?",
    body: "History: Solana sysvars (clock, rent, instructions...) are passed as accounts, and early runtimes/programs didn't verify that the account claiming to be a sysvar was the genuine sysvar address — attackers passed fake accounts containing fabricated sysvar data. The runtime later hardened this (as of early 2026, loading the well-known sysvars by their reserved addresses is enforced), but the LESSON persists: any account standing in for \"system truth\" must be validated by address. Modern residue: programs reading the instructions sysvar for flash-loan-guard or CPI-introspection patterns must assert `instructions_sysvar.key == &sysvar::instructions::ID` when taken from accounts; programs trusting a passed `clock`/`rent` account from `remaining_accounts` (to save an explicit account slot) repeat the original sin. Wormhole's $326M loss was exactly this class — treat it as the canonical example, not ancient history.",
    category: "CPI and program confusion",
    kind: "example",
  },
  // -------------------------------------------------------- Anchor constraints
  {
    title: "What does each Anchor constraint on this struct actually enforce?",
    body: "Anchor's `#[account(...)]` attributes are precise and auditors should recite them cold: `init` creates the account (payer, space, rent) and requires it NOT already initialized; `init_if_needed` same but skips if the discriminator already exists (reinit-safe since Anchor 0.25, but space/payer semantics still bite); `seeds` + `bump` re-derives the PDA and compares the address; `has_one = x` asserts `stored_account.x == ctx.accounts.x.key()`; `constraint = expr` is a raw boolean assertion — it checks exactly what you wrote and nothing more; `owner = program_id` asserts account owner (for external-program accounts); `address = PUBKEY` asserts the key itself; `close = dest` drains lamports to dest, zeroes data, and writes the CLOSED discriminator; `realloc` resizes (needs `realloc::payer`, `realloc::zero` policy). What's NOT enforced unless written: signer status, mint/token-account linkage, duplicate-account inequality, business invariants.",
    category: "Anchor constraints",
    kind: "fact",
  },
  {
    title: "What's missing from this Anchor account struct?",
    body: "A fast Anchor review heuristic: for each field in `#[derive(Accounts)]`, walk a checklist. (1) Is the account TYPE strict — `Account<'info, T>` / `Signer` / `Program` — or a bare `AccountInfo`/`UncheckedAccount` with a `/// CHECK` comment that just waves at validation? (2) If it gates authority, is it `Signer` AND bound by `has_one`/seeds to stored state? (3) If it's a PDA, are seeds complete and bump pinned? (4) Token accounts: is the mint asserted (`token::mint`) and the authority (`token::authority`)? (5) Mutability: `mut` present where writes/CPIs need it — and absent where they don't (extra `mut` widens attack surface via duplicate-mutable bugs)? (6) Close/realloc present — does the destination/payer get validated? Most real Anchor findings are a missing line in this struct, not complex logic.",
    category: "Anchor constraints",
    kind: "layout",
  },
  {
    title: "Does init_if_needed or realloc reopen a reinitialization attack?",
    body: "Reinitialization = resetting an existing account's state by re-running init logic. Raw programs are nakedly vulnerable: if `initialize` doesn't check that the account is already initialized (discriminator/flag), anyone rewrites the authority field. Anchor's `init` rejects already-initialized accounts, and `init_if_needed` since v0.25 checks the discriminator — but gaps remain: an attacker who can CLOSE the account (via the program's own `close` path, or lamport-draining in raw code) can then re-create it fresh through `init_if_needed` with attacker-chosen fields. `realloc` to a larger size on an account whose data the program reads via `load_init`-adjacent logic can desync zero-copy layouts. Rule: treat (close path) + (init_if_needed path) as a compound attack surface; if a closed account can be re-inited, the re-init must re-derive everything trust-relevant from seeds, not from caller arguments.",
    category: "Anchor constraints",
    kind: "pitfall",
  },
  {
    title: "Are zero-copy AccountLoader semantics being handled correctly?",
    body: "Zero-copy accounts (`#[account(zero_copy)]`, `AccountLoader<'info, T>`) skip deserialization — the account data IS the struct via `bytemuck`. Sharp edges: you must use `load()`, `load_mut()`, or `load_init()` and pick correctly — `load_init` on an already-live account or `load()` on a fresh one panics/behaves wrong; fields must be plain-old-data (no `Pubkey` wrappers that bytemuck can't handle is fine — `Pubkey` is POD, but `Vec`/`String` are forbidden, forcing fixed arrays and manual length tracking); alignment and `repr(C)` mistakes corrupt layout; the discriminator is checked by the loader but DUPLICATE zero-copy accounts of different types with colliding interpretation are on you; and mutating through `load_mut` without marking `mut` fails silently at the tx level. Audit: check every `AccountLoader` for the right load flavor, and grep for manual offset reads on zero-copy data.",
    category: "Anchor constraints",
    kind: "fact",
  },
  {
    title: "Is this UncheckedAccount's CHECK comment lying?",
    body: "`/// CHECK:` comments above `UncheckedAccount`/`AccountInfo` fields are where Anchor audits go to die. The pattern to hunt: a `/// CHECK: validated in the instruction body` claim where the body checks nothing (or checks it on a different code path), or validates only on success paths while an early `?` return skipped it. Legitimate uses exist (purely-written system accounts, fee-payer-only accounts), so don't auto-flag — instead verify: owner checked? key compared to stored state or constant? signer status asserted if authority-like? data read at all (if yes, full deserialization safety needed)? Also check `Box<Account>` vs `Account` equivalence isn't assumed across struct versions. As of early 2026, Anchor lint tooling catches some bare uses, but semantic verification — that the manual checks match what the type system would have enforced — remains manual review.",
    category: "Anchor constraints",
    kind: "pitfall",
  },
  // --------------------------------------------- Arithmetic and token math
  {
    title: "Does Rust release-mode wrapping hide overflow in this program?",
    body: "Rust release builds wrap on integer overflow silently (two's complement) unless `overflow-checks = true` is set — and Anchor's `anchor init` template DOES enable it in `[profile.release]`, but hand-rolled programs, modified templates, and dependency crates doing their own arithmetic often don't. In BPF/SBF builds, a wrapping `u64` in balance math = classic underflow-mint: `balance - amount` where `amount > balance` wraps to a huge number if the check was `>=` on a different variable or missing. Rule: use `checked_add/sub/mul` with explicit errors for all value math regardless of profile flags (flags are a safety net, not the control); watch `as u64`/`as u128` casts that truncate (e.g., `u128` intermediate cast back to `u64`); and verify `cargo build-bpf`/`build-sbf` actually inherits the workspace profile. Detection signal: raw `+`/`-`/`*` on lamports, token amounts, or shares.",
    category: "Arithmetic and token math",
    kind: "rule",
  },
  {
    title: "Is share/exchange-rate math exploitable by first-depositor inflation?",
    body: "Solana vaults and lending pools implement the same shares pattern as EVM vaults and inherit the same bug: `shares = deposit * total_shares / total_assets`. First depositor donates directly to the asset account (SPL transfer straight to the vault token account — nothing stops this), inflating `total_assets` so the next depositor's share calculation rounds down to zero or near-zero, then the attacker redeems their majority shares for everything. Solana-specific wrinkle: because anyone can transfer tokens to any token account, the \"donation\" vector needs no protocol interaction at all — vaults MUST account for assets via internal accounting fields or a virtual offset, not raw `token_account.amount`, or enforce a minimum initial deposit/mint dead shares. Detection signal: exchange-rate computed from live token balances; division without `mul_div`-style precision; rounding direction not favoring the protocol.",
    category: "Arithmetic and token math",
    kind: "example",
  },
  {
    title: "Are token decimals and lamport scales conflated anywhere?",
    body: "Solana value math spans at least three scales: lamports (9 decimals), token base units (mint-defined `decimals`, commonly 6 for USDC, 9 for SOL-wrapped, anything for attacker mints), and Pyth-style prices (value * 10^expo, expo NEGATIVE). Bugs: charging a \"1 token\" fee computed as `1_000_000` against a 9-decimal mint; converting Pyth price to token amount with `10u64.pow(price.expo as u32)` — which panics on negative expo instead of dividing; assuming `wsol` and `sol` lamport equality mid-CPI without accounting for rent in the wrapped account; and Token-2022 interest-bearing mints whose UI amount ≠ stored amount. Rule: every conversion between two scales gets a written invariant (\"amount_x = amount_y * 10^(dx-dy)\") and checked math; read `decimals` from the validated mint account, never from instruction args.",
    category: "Arithmetic and token math",
    kind: "pitfall",
  },
  {
    title: "Is the Pyth/Switchboard price fresh, confident, and the right feed?",
    body: "Oracle findings on Solana cluster in four checks. (1) STALENESS: `price.get_price_no_older_than(&clock, max_age)` — using the deprecated unchecked getters accepts hours-old prices. (2) CONFIDENCE: Pyth publishes `conf` alongside price; high-volatility or manipulated windows widen it — protocols that ignore `conf` (require e.g. `conf/price < 1-2%`) trade on garbage. (3) FEED IDENTITY: the price account's key must equal the expected feed (stored in config) — a wrong-but-valid Pyth account for a correlated or fake feed passes deserialization fine; also verify `owner == pyth_program`. (4) EMA vs spot misuse: `ema_price` for liquidations can lag or be gamed differently than spot. Switchboard equivalents: `AggregatorAccountData` staleness via `latest_confirmed_round` timestamps. As of early 2026, Pyth push (Solana-mainnet price-service accounts) and pull patterns coexist — check which model the program assumes.",
    category: "Arithmetic and token math",
    kind: "rule",
  },
  {
    title: "Can MEV on Solana exploit this transaction flow?",
    body: "Solana MEV differs from EVM: historically no public mempool, so classic sandwiching required spam/leader-based strategies; since Jito (~2022 onward) out-of-protocol block-engine auctions and bundles enable atomic backruns and sandwich-style ordering via tips, and as of early 2026 Jito tips and priority fees (compute-unit price) dominate ordering. Protocol-level exposures: single-tx oracle-update + action flows where an attacker bundles their trade immediately after a price update (mitigate with staleness tolerance and confidence checks, or commit-reveal); liquidations sniped by bundled backruns (acceptable, but check incentive math); AMM swaps without slippage bounds (`minimum_out = 0` is a finding every time); and dutch-auction/auction-settlement instructions callable by anyone where the keeper extracts the spread. Audit question for every price-sensitive instruction: \"who profits from ordering this transaction, and what bounds did the user set?\"",
    category: "Arithmetic and token math",
    kind: "fact",
  },
  // ------------------------------------------------------------- Real incidents
  {
    title: "How did the Wormhole $326M exploit actually work?",
    body: "Wormhole (Feb 2022, ~$326M / 120k wETH) is the canonical Solana sysvar-verification failure — NOT an EVM-style bug. The bridge's `verify_signatures` instruction was supposed to read secp256k1 signature-verification results written by the native secp256k1 program into the INSTRUCTIONS SYSVAR account. The vulnerable code accepted a sysvar account passed by the caller without verifying it was the genuine instructions sysvar address (the deprecated `load_instruction_at` path trusted the account). The attacker passed a fake account they owned, populated with spoofed \"secp256k1 program verified these guardian signatures\" output, creating a forged `SignatureSet`. `post_vaa` then accepted it, `complete_wrapped` minted 120,000 wETH on Solana unbacked by locked ETH. Lesson: every account standing in for system truth must be address-verified — and \"the runtime checks sysvars now\" doesn't cover program-level trust in account contents.",
    category: "Real incidents",
    kind: "example",
  },
  {
    title: "How did Cashio's missing collateral validation enable infinite mint?",
    body: "Cashio (March 2022, ~$48M, CASH stablecoin depegged to zero) is the canonical fake-collateral / incomplete-validation bug. Minting CASH required depositing Saber LP tokens as collateral through a \"crate\" (collateral basket). The validation chain checked the crate token's mint but failed to validate the full dependency graph — specifically, it never verified that the Saber swap underlying the LP token was the legitimate, expected one (the `saber_swap_arrow` / underlying mint relationship went unchecked). The attacker created a worthless new token, built a fake Saber pool around it, wrapped it into a crate that passed the partial checks, deposited this valueless collateral, and minted billions of CASH, then dumped it into real liquidity. Lesson: on Solana, validating ONE link in an asset's provenance chain is validating nothing — walk mint → token account → LP → underlying pool to canonical addresses.",
    category: "Real incidents",
    kind: "example",
  },
  {
    title: "How did Crema Finance lose $8.8M to a fake account?",
    body: "Crema Finance (July 2022, ~$8.8M) is the canonical unverified-oracle-account attack on Solana. Crema is a concentrated-liquidity AMM whose flash-loan fee accounting relied on a \"tick\" account — the current price tick — passed in by the caller. The program failed to verify that the supplied tick account was the genuine, program-derived account (owner and address validation missing). The attacker created their own account with fabricated tick data, took a flash loan, and the spoofed tick made the protocol compute near-zero fees / accept the manipulated price state, letting them repay cheaply and drain the difference across pools; they later negotiated and returned most funds for a bounty. Lesson: any account carrying pricing/accounting truth must be either a program-derived PDA with checked seeds or address-pinned in stored config — \"caller supplies the oracle\" is a red flag on its own.",
    category: "Real incidents",
    kind: "example",
  },
  {
    title: "How did Mango Markets get drained via oracle manipulation?",
    body: "Mango Markets (October 2022, ~$114M, Avraham Eisenberg — later convicted of fraud) is the canonical oracle-manipulation-of-illiquid-collateral case, and it's economic, not a code bug. MNGO was a thin-liquidity governance token usable as collateral on Mango, with its mark price derived from spot prices on exchanges where MNGO barely traded. The attacker funded two accounts, built a large MNGO perpetual long between them, then aggressively bought MNGO on the external venues feeding the oracle, pumping the spot price ~10x in minutes. The inflated collateral value let one account \"borrow\" (withdraw) essentially all liquid assets on the platform; the position was never going to be liquidatable at real prices. Lesson for Solana auditors: collateral eligibility, oracle source liquidity, borrow caps per-asset, and price-impact assumptions are SECURITY parameters — review them as code, not tokenomics.",
    category: "Real incidents",
    kind: "example",
  },
  {
    title: "What does the Slope wallet hack teach protocol auditors?",
    body: "Slope (August 2022, thousands of Solana wallets drained, ~$4-8M across users) was NOT a program exploit: Slope's mobile wallet logged users' plaintext seed phrases to its Sentry telemetry backend; anyone with access to that logging pipeline could reconstruct keys. It matters to this brain because the same lesson generalizes to protocol operations: key custody and operational hygiene dominate Solana loss events even when programs are correct — upgrade authorities on hot keys, multisigs with co-located signers, CI machines holding deployer keys. When auditing a Solana protocol, enumerate the OFF-CHAIN key surface: program upgrade authority, PDA admin multisigs, oracle update keys, crank/keeper keys with spending power, and any backend that touches serialized keypairs. A formally perfect program with its upgrade key in a GitHub Action secret is a critical finding, not an informational one.",
    category: "Real incidents",
    kind: "fact",
  },
  // ---------------------------------------------- Tooling and audit workflow
  {
    title: "What does cargo-audit catch in a Solana codebase?",
    body: "`cargo audit` (RustSec advisory DB) flags known-vulnerable dependency versions — for Solana work the high-signal hits are `solana-program`, `anchor-lang`/`anchor-spl`, `spl-token`/`spl-token-2022`, and borsh versions with deserialization advisories. Historical example: older `solana-program` versions lacked sysvar owner hardening; old anchor versions predate the `init_if_needed` reinit fix (0.25) and various discriminator/close fixes — pinning a stale anchor is itself a finding. Also run `cargo deny` for license/ban checks and check `Cargo.lock` is committed (programs are deployed from lockfiles; a floating dep means the on-chain build may differ from the audited one). Limit: cargo-audit knows nothing about YOUR logic — it catches maybe 5% of real Solana findings. Treat it as hygiene gating CI, and pair with `solana-verify` / verifiable builds to confirm the deployed binary matches audited source.",
    category: "Tooling and audit workflow",
    kind: "rule",
  },
  {
    title: "How do you fuzz a Solana program with Trdelnik or Trident?",
    body: "Ackee's fuzzing tools are the Solana-native options as of early 2026: Trdelnik (older, built on anchor-client + honggfuzz) and Trident (newer, actively developed, AFL/libfuzzer-backed with account-state-aware fuzzing). The value is NOT random input throwing — it's INVARIANT-DRIVEN: you declare properties (\"sum of all vault token balances >= total shares * rate\", \"no instruction sequence decreases admin balance without admin signature\", \"PDA X can only be initialized once\") and the fuzzer sequences random instruction calls with realistic account snapshots to violate them. Trident can derive account contexts from your Anchor IDL, dramatically cutting harness-writing time. Practical setup: extract pure logic into a testable crate, write invariants as Rust functions over account state, run fuzzing in CI with corpus persistence. What fuzzing finds: arithmetic edge cases, unexpected instruction orderings (init-close-reinit), and duplicate-account aliasing you didn't model.",
    category: "Tooling and audit workflow",
    kind: "fact",
  },
  {
    title: "How do you write a PoC exploit with solana-program-test and banksClient?",
    body: "`solana-program-test`'s `ProgramTest` spins up an in-process BPF runtime — the standard PoC harness. Skeleton: `let mut pt = ProgramTest::new(\"my_program\", program_id, processor!(entry));` — then `pt.add_account(attacker_pubkey, Account { lamports, owner: system_program::ID, .. })` to stage the attacker's fake accounts (this is where you prove the owner-check bug: you fabricate the malicious account the runtime would let through), add real mints/token accounts via `spl_token` instructions in a setup tx, then `let (mut banks_client, payer, recent_blockhash) = pt.start().await;` and send your exploit `Transaction` signed with chosen keys, asserting post-state. For a finding writeup, the PoC must show: vulnerable instruction called with attacker-controlled accounts, state before/after, and value extracted. Faster modern alternatives: LiteSVM (in-process SVM, much quicker than program-test) and Mollusk (Anza's minimal harness) — both fine for PoCs as of early 2026.",
    category: "Tooling and audit workflow",
    kind: "example",
  },
  {
    title: "What does anchor's built-in checking NOT cover?",
    body: "Anchor's account constraints eliminate maybe 60% of historical Solana bug classes (owner, discriminator, seeds, signer-as-type) — auditors must know the residue. Anchor does NOT check: business-logic invariants (share math, fee rounding, liquidation health); duplicate mutable accounts unless you write the inequality constraint; that a token account's MINT is the expected one (type only proves \"a token account\"); remaining_accounts at all; CPI program targets beyond typed `Program` fields; oracle freshness/confidence; overflow inside your `#[program]` logic (profile flag aside); Token-2022 extension behavior; and cross-program state composition. Also note `anchor build` runs the IDL generation and `cargo check`-level lints, and `anchor test` defaults to local validator — none of this simulates adversarial account sets. Workflow: after the constraint-layer review passes, switch to attacker-model review assuming every account not address-pinned is hostile.",
    category: "Tooling and audit workflow",
    kind: "rule",
  },
  {
    title: "What does manual review catch that Solana tooling misses?",
    body: "Every tool above operates below the business-logic layer; the highest-severity Solana findings are usually economic/design bugs no linter knows about. Manual-review checklist that consistently pays: (1) value-conservation invariants per instruction — where does every lamport/token unit enter and leave; (2) permission matrix — who can call what, and what can a compromised but legitimate key do (centralization findings); (3) economic attack modeling — oracle manipulation cost vs extractable value, flash-loan-funded sequences (Solana's atomic multi-instruction txs make single-block composability attacks free of execution risk); (4) cross-program trust — what breaks if an integrated program (Saber-style LP, Pyth, another vault) is malicious or manipulated, per Cashio; (5) spec-vs-code drift — docs promising \"only admin can pause\" while seeds allow anyone to derive the pause authority. Write invariants BEFORE reading code, then hunt violations.",
    category: "Tooling and audit workflow",
    kind: "rule",
  },
  {
    title: "How do you verify the deployed program matches audited source?",
    body: "Solana programs are upgraded BPF blobs; source-to-binary divergence is a real attack path (malicious upgrade, compromised CI). Verification stack as of early 2026: use `solana-verify` / Ellipsis verifiable-build tooling, which rebuilds from source in a pinned Docker image and compares the resulting binary hash against the on-chain program account — OtterSec's explorer surfaces this status publicly. Check too: `upgrade_authority` on the program data account (is it a multisig/governance, an EOA, or burned — `set-upgrade-authority --final` for immutable programs); whether `ProgramData` upgrade history shows upgrades AFTER the audit commit; and `solana program show` buffer accounts lingering with authority. For Anchor programs, `anchor verify` wraps the flow. Report finding shapes: unverifiable build = informational-to-medium; unverifiable + live upgrade authority on a hot key = high centralization risk.",
    category: "Tooling and audit workflow",
    kind: "fact",
  },
  // ------------------------------------------------- Account model attacks
  {
    title: "What happens when one account fills two roles in the same instruction?",
    body: "Account aliasing beyond simple duplicates: in a liquidation-style instruction, an attacker passes the SAME account as both `collateral_account` and `debt_account`. The program burns tokens from \"debt\" and mints/transfers to \"collateral\" — but both roles are one account, so the net effect depends on instruction order and cached state: burn-then-mint can leave the attacker with freshly minted tokens and no real debt reduction, or the debit and credit are both computed from the same pre-state and both applied, creating value from nothing. Rule: any instruction where two mutable accounts play different trust roles (collateral vs debt, source vs destination, vault vs fee) must assert inequality — Anchor: `constraint = collateral.key() != debt.key()`. When iterating liquidatable positions via `remaining_accounts`, enforce the same uniqueness discipline per entry, since Anchor applies zero checks to tail accounts.",
    category: "Account model attacks",
    kind: "pitfall",
  },
  {
    title: "Is reading lamports from remaining_accounts dangerous by itself?",
    body: "No — and confusing read vs write here produces both false positives and missed criticals. READING `account.lamports()` or data from an unvalidated `remaining_accounts` entry cannot move value; the risk is decision corruption: fee logic, caps, or eligibility computed from an attacker's fake balances — an input-validation finding, not a drain. Actual DRAIN requires write authority: only an account's OWNER program can debit its lamports or mutate its data, so your program can only lose lamports from accounts it owns (PDAs, vaults) via `**lamports.borrow_mut()`, a system-transfer CPI it signs, or a close path. The critical pattern: a writable protocol-owned account in the tail, closed or transferred to a caller-supplied recipient without checking that recipient against stored state. Audit split: reads → validate provenance of anything influencing logic; writes/closes → validate recipient and authority, every time.",
    category: "Account model attacks",
    kind: "fact",
  },
  {
    title: "Why is a hardcoded rent-exempt threshold a bug?",
    body: "Rent-exemption amounts are not constants: they depend on account data length AND the cluster's rent parameters (`lamports_per_byte_year`, exemption threshold), which governance can change. A program hardcoding e.g. `const RENT_MIN: u64 = 890_880` (the classic 165-byte token-account figure) embeds two failure modes: if cluster rent parameters change, the hardcoded floor is wrong — accounts the program considers \"safe\" fall below the real exemption minimum and become fee-vulnerable or purgeable, and any protection logic gating on the stale constant silently breaks; and if account sizes migrate (Token-2022 extension accounts are larger), the constant was wrong from day one. Rule: always compute at runtime — `Rent::get()?.minimum_balance(data_len)` or Anchor's rent sysvar — using the CURRENT account length. Audit signal: any lamport literal compared against a balance, or a `minimum_balance` result cached in state without a refresh path.",
    category: "Account model attacks",
    kind: "rule",
  },
  {
    title: "What's wrong with closing an account by zeroing its lamports?",
    body: "Raw-program close recipes fail in two directions. Setting `**account.lamports.borrow_mut() = 0` WITHOUT transferring the lamports to a recipient burns them — value is destroyed (deducted from total lamport supply), not stolen, so it's loss-of-funds for the protocol rather than theft. Meanwhile, transferring lamports but NOT zeroing data or reassigning the owner leaves a zombie account: zero balance but intact data and discriminator, which `init_if_needed`-style flows and discriminator-only checks may treat as still initialized — the classic reinit springboard. The correct manual close is three steps: transfer the FULL lamport balance to a validated recipient, `realloc(0)` / zero the data, and `assign` the account back to the system program. Anchor's `close = recipient` does all three plus writes the CLOSED discriminator (defense against resurrection within the same tx). Audit: any lamport-zeroing or close emulation missing a step is a finding; the recipient must come from stored state, not caller input.",
    category: "Account model attacks",
    kind: "rule",
  },
  // ------------------------------------------------ Signer and authority checks
  {
    title: "What does `#[account(signer)]` / Signer<'info> actually prove?",
    body: "Exactly one thing: the transaction was signed by the private key for that account's public key. It says NOTHING about the account's owner, data, mutability, or relationship to your program — a `Signer` can be a zero-data system-program account, an account owned by a hostile program, or a program account itself. So `signer` alone never substitutes for an owner check (whose data are you reading?), a key match against stored state (`has_one = authority`), or a PDA derivation. The classic failure shape: `authority: Signer<'info>` with no binding to stored state — anyone signs and becomes \"authority\". Conversely, note what a signer can't be: PDAs have no private key and can never satisfy a runtime signer check outside `invoke_signed`. Match the check to the threat: a signature proves key control, not permission, data integrity, or ownership.",
    category: "Signer and owner checks",
    kind: "fact",
  },
  {
    title: "Can a PDA ever pass an is_signer check?",
    body: "No — PDAs have no private key, so the runtime can never mark a PDA account `is_signer` from an external transaction. Two consequences auditors must hold simultaneously. First, the bricking bug: an authority-update or admin instruction requiring `authority.is_signer` where the stored authority IS (or may be rotated to) a PDA will always fail — the protocol locks itself out; a liveness finding, common when \"multisig-safe\" signer requirements meet PDA-governed configs. Second, the inverse rule: a program must never RELY on a PDA's signature as an authentication factor for its own instructions — PDA \"signatures\" exist only inside `invoke_signed`, authorized by the signing program's own logic. So instructions gated on PDA authority must authenticate via SEED VERIFICATION (`seeds` + `bump` re-derivation against stored state), not signer checks; if a design demands `is_signer` from an authority that could be a PDA, the design — not the check — is wrong.",
    category: "Signer and owner checks",
    kind: "pitfall",
  },
  {
    title: "Does `require!(account.owner == &my_program)` prove permission?",
    body: "No — owner and signer checks answer different questions, and swapping them is a top-ten Solana finding. `owner == program_id` proves the account's DATA is controlled by your program, so deserializing it as your state type is meaningful: it validates the DATA SOURCE. It says nothing about WHO is calling. Permission requires a signer check bound to stored state: `authority.key() == state.authority && authority.is_signer` (Anchor: `Signer<'info>` + `has_one`). The failure shape: an admin instruction checks the config account's owner, reads `config.admin`, compares it to a passed `admin` account's key — but never requires `admin` to sign; anyone passes the real admin's pubkey (pubkeys are public!) and executes admin actions. Mirror-image mistake: checking the caller's signature but never the state account's owner, letting attacker-crafted fake state drive privileged logic. Every privileged instruction needs BOTH.",
    category: "Signer and owner checks",
    kind: "rule",
  },
  // ------------------------------------------------------------ PDAs and bumps
  {
    title: "Can two PDAs collide when seeds aren't domain-separated?",
    body: "A PDA is just `hash(seeds || program_id || bump)` — pure math with no registry. If a program derives conceptually different accounts from overlapping or attacker-controlled seeds, collisions and hijacks follow. Failure shapes: two roles derived from the same seed set (`find_program_address(&[b\"authority\"])` for both a config authority and a vault authority → one address, confused privileges); seeds built from user-supplied strings/keys with no domain prefix, so an attacker crafts inputs that land on a victim's expected address; and code that never re-validates derivation inputs, trusting a passed account because \"it's a PDA of ours\". Rule: every PDA role gets a unique hardcoded seed prefix (`b\"vault\"`, `b\"config\"`, `b\"stake\"`); all variable seeds come from validated accounts, never raw instruction bytes; and the program re-derives and compares the address (Anchor `seeds` + `bump`) on every use.",
    category: "PDAs and bumps",
    kind: "rule",
  },
  {
    title: "Is a treasury PDA that never signs still safe receiving lamports?",
    body: "Often yes — receiving value is inherently safer than spending it, and the audit bar differs per direction. A treasury/vault PDA that only RECEIVES lamports or tokens needs no signer check (it can't sign anyway); what it needs is ADDRESS VALIDATION: the recipient must be re-derived from its seeds (Anchor `seeds` + `bump`) or pinned to a hardcoded/stored address, so deposits can't be redirected to an attacker's lookalike. Hijack requires spoofing the derivation: if any seed comes from caller input without validation, the attacker derives a \"treasury\" whose spending path they control. The spending direction is where full rigor applies: debiting the PDA's lamports (only your program, as owner, can) or moving its tokens via `invoke_signed` demands authority checks, recipient validation, and usually governance gating. Audit rule: receive-only PDA → verify derivation integrity (medium if missing); spend path → verify authority + destination (critical if missing).",
    category: "PDAs and bumps",
    kind: "fact",
  },
  // ------------------------------------------------ CPI and program confusion
  {
    title: "How should arbitrary CPI targets be constrained?",
    body: "When an instruction must CPI into a caller-supplied program, the ONLY safe pattern is an explicit whitelist: compare the passed program id against a fixed, compiled-in set of allowed program addresses (constants, or a program-owned config account governed by admins) and reject anything else. Heuristics fail: checking that the program is executable, that it's \"well-known\", that its return data deserializes, or that it reports success all pass for a malicious mimic implementing the same interface and lying. With `invoke_signed` the stakes double — a whitelist is the difference between your PDA signing a token transfer and signing whatever an attacker encodes. Rule: `require!(ALLOWED_PROGRAMS.contains(program_info.key))` before every dynamic `invoke`; keep the list minimal, version-pinned, and upgrade-governed; and still validate every account passed to the whitelisted call — a legitimate program with hostile accounts drains just as well.",
    category: "CPI and program confusion",
    kind: "rule",
  },
  {
    title: "Can a Token-2022 mint impersonate a classic SPL mint?",
    body: "Yes, if detection logic is naive — and version confusion cuts both ways. A program wanting ONLY classic SPL Token mints but checking nothing beyond \"deserializes as a Mint\" will accept a Token-2022 mint: both layouts share the base 82-byte mint prefix, so bare `Mint::unpack` succeeds, and a Token-2022 mint with NO extensions behaves identically in transfers — until someone later enables transfer fees, a hook, or a permanent delegate and the protocol's accounting breaks. Robust exclusion requires BOTH: pin `token_program.key() == spl_token::ID` (not `Interface<'info, TokenInterface>` — that type intentionally accepts both), AND verify the mint account's `owner == spl_token::ID` directly, since CPI-program pinning alone doesn't prove which program owns the passed mint. Conversely, programs intending Token-2022 support must branch on the mint's owner and parse the extension TLV data rather than assuming fixed account size. Audit signal: mint owner never compared to the token program id.",
    category: "CPI and program confusion",
    kind: "pitfall",
  },
  {
    title: "Does a CPI transfer automatically run a Token-2022 transfer hook?",
    body: "Yes. When a Token-2022 mint has the transfer-hook extension initialized, the Token-2022 program CPIs into the designated hook program on EVERY transfer of that mint — including transfers your program initiates via `transfer`/`transfer_checked`. Your code doesn't call the hook; the token program does, mid-transfer, with source, destination, mint, and amount. Security consequences: the hook is arbitrary program logic executing inside your transfer's call stack — a reentrancy-shaped surface (a hostile or buggy hook can observe or interfere with your state mid-instruction), and hooks can fail the whole transfer, a liveness/griefing vector for withdrawals and liquidations. If YOUR program is the hook program, you must validate everything: the caller is genuinely Token-2022, the mint is yours, and the extra-account metas match expectations. Audit rule: any program integrating Token-2022 mints must enumerate extensions (TLV parse), treat hook-bearing mints as untrusted callbacks, and prefer allowlists of known-extension mints.",
    category: "CPI and program confusion",
    kind: "fact",
  },
  // -------------------------------------------------------- Anchor constraints
  {
    title: "What does `#[account(mut)]` actually guarantee?",
    body: "`mut` is a WRITABILITY DECLARATION, not a write guarantee. It tells Anchor to require the account be passed as writable in the transaction (so the runtime acquires a write lock on it) and to serialize the — possibly unchanged — data back at the end. It enforces NOTHING about modification: a `mut` account may pass through the instruction completely untouched, and no rent, initialization, or content check is implied. Audit consequences: (a) unused-`mut` is a smell — it widens the tx's write-lock set (enabling duplicate-mutable-account aliasing and blocking parallelization) and often signals the author meant to add a check they forgot; (b) never infer \"this account was updated\" from `mut` alone — verify the actual write path; (c) conversely, any account written by the program OR mutated via CPI must be declared `mut` or the runtime rejects the write.",
    category: "Anchor constraints",
    kind: "fact",
  },
  {
    title: "What does realloc leave behind in the new bytes?",
    body: "Resizing an account does NOT reliably zero the grown region unless you ask: Anchor's `realloc` takes `realloc::zero = true/false`, and raw `AccountInfo::realloc(new_len, zero_init)` makes it an explicit parameter. If new space isn't zeroed, it contains stale bytes left in the account's memory region — an attacker who influences what previously occupied that space (or who controlled the account before realloc) can smuggle crafted data into fields the program later reads as legitimate state: fake owners, fake authorities, inflated counters. The second gap: `realloc` with no initialized/discriminator check can resurrect or reshape an account that was never properly initialized, letting an attacker define its contents wholesale. Rule: default to `realloc::zero = true` unless profiling proves the cost matters AND every new field is overwritten before any read; gate realloc behind the same owner + discriminator + authority validation as init; treat grow-and-interpret as an initialization path, not a resize.",
    category: "Anchor constraints",
    kind: "pitfall",
  },
  {
    title: "When does init_if_needed still reopen reinitialization?",
    body: "`init_if_needed` initializes only if the account appears uninitialized — and \"appears\" is the whole game. Since Anchor 0.25 it checks the account discriminator: an account with a valid discriminator is treated as initialized and init is skipped, closing the classic reinit-to-reset-authority exploit for Anchor-managed accounts. Residual risks remain: an account existing with the RIGHT discriminator but attacker-controlled contents (created via a separate weakly-validated instruction) sails through; a CLOSED account (lamports drained, discriminator zeroed) can be re-initialized through `init_if_needed` with fresh attacker-chosen fields — any close path combined with init_if_needed is a compound vector; and raw-program or pre-0.25 code checking only `lamports > 0` or a manual `is_initialized` flag is fully exploitable when the account exists under a different owner. Rule: after `init_if_needed`, re-verify stored authority/ownership fields against seeds — the discriminator alone is not a trust decision.",
    category: "Anchor constraints",
    kind: "pitfall",
  },
  // --------------------------------------------- Arithmetic and token math
  {
    title: "How should flash-loan-adjacent logic handle same-slot oracle prices?",
    body: "Solana's atomic multi-instruction transactions make the flash-loan-then-act sequence free of execution risk, so any price-sensitive instruction must refuse prices updated in the CURRENT slot. Concretely: check the oracle's publish slot (Pyth's `curr_slot`/`valid_slot` vs `Clock::get()?.slot`); if the price was written this slot, it may reflect manipulation staged earlier in the SAME transaction — funded by a flash loan taken in a prior instruction and repaid in a later one. Requiring the price to be at least one slot old (updated in a PRIOR slot) forces manipulation to persist across a slot boundary, where arbitrageurs and liquidators can attack it. Combine with standard Pyth hygiene: confidence-interval gating (`conf/price` bounded), a staleness ceiling, and feed-address pinning. Audit signal: liquidation, mint/redeem, or borrow instructions reading an oracle with no slot-age check — especially in programs that also offer flash loans or accept uncollateralized same-tx composition.",
    category: "Arithmetic and token math",
    kind: "rule",
  },
];
