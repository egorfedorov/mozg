export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ---------------------------------------------------------------- Reentrancy
  {
    title: "Is this withdraw function reentrant?",
    body: "The canonical vulnerable pattern: `function withdraw(uint amount) { require(balances[msg.sender] >= amount); (bool ok,) = msg.sender.call{value: amount}(\"\"); require(ok); balances[msg.sender] -= amount; }`. State is updated AFTER the external call, so a receiver contract's `receive()` re-enters `withdraw()` while the balance is still intact and drains the contract in a loop. Detection signal: any `call{value:}`, `transfer`, or `send` that precedes a state write to the same variable the call depends on. Fix: checks-effects-interactions (zero/decrement the balance before the call), or OpenZeppelin `ReentrancyGuard` (`nonReentrant` modifier), or pull-over-push so users claim funds instead of being sent them. This is exactly the 2016 The DAO bug (~3.6M ETH, led to the Ethereum hard fork).",
    category: "Reentrancy",
    kind: "rule",
  },
  {
    title: "How did cross-function reentrancy drain Cream Finance in 2021?",
    body: "Reentrancy guards that protect a single function fail when the attacker re-enters through a DIFFERENT function that reads the stale state. Cream Finance (August 2021, ~$18.8M) lost funds to the AMP token's ERC-777-style hook: `_tokensReceived` fired on transfer, letting the attacker re-enter a borrow function before the first borrow's collateral accounting settled, borrowing repeatedly against the same collateral. Detection signal: shared state (balances, collateral, exchange rates) mutated in function A and read in function B, where A makes an external call mid-update. A `nonReentrant` mutex covering all functions touching that state is the fix, not per-function guards. ERC-777 `transfer`/`transferFrom` hooks are reentrancy vectors even for \"safe-looking\" tokens — treat hook-capable tokens like external calls.",
    category: "Reentrancy",
    kind: "example",
  },
  {
    title: "What is read-only reentrancy and why do Curve pools have it?",
    body: "Read-only reentrancy: the callback target doesn't re-enter a state-mutating function; it calls a VIEW function that returns stale state mid-transaction. Classic case: Curve's `remove_liquidity` sends ETH (triggering a callback) before updating pool internals; during that window `get_virtual_price()` returns an inflated value. Protocols using Curve LP tokens as collateral (and reading `get_virtual_price` for pricing) could be exploited — this pattern forced many integrations to patch in 2022-2023 even though Curve itself was safe. Detection: your contract (or an integrated one) reads another protocol's view function for pricing while that protocol can hand control flow to an attacker (ETH transfers, token hooks). Fix: use reentrancy-aware price oracles, Curve's later `price_oracle`-style TWAP getters, or a reentrancy lock wrapper around the read.",
    category: "Reentrancy",
    kind: "fact",
  },
  {
    title: "Does nonReentrant protect against cross-contract reentrancy?",
    body: "No. OpenZeppelin's `ReentrancyGuard` only serializes calls within ONE contract instance. If contract A (guarded) calls contract B, and B calls back into a different guarded function of A, the guard works; but if the attacker re-enters a THIRD contract C that shares derived state with A (e.g., a pricing module, a vault A reads shares from), no guard helps. Real-world shape: vault share-price manipulations where the attacker re-enters the oracle/accounting contract, not the vault holding the guard. Audit approach: map the full call graph across protocol boundaries; any external call in a state-update window must be flagged even behind `nonReentrant`. Also note the gas footgun: `ReentrancyGuard` pre-5.x costs an extra SSTORE per guarded call; transient-storage guards (EIP-1153, post-Cancun) are cheaper — as of early 2026 OZ ships both variants.",
    category: "Reentrancy",
    kind: "pitfall",
  },
  {
    title: "Are ETH transfer() and send() still safe against reentrancy?",
    body: "`transfer()`/`send()` forward only 2300 gas, historically enough to log but not re-enter. After several hard forks changed opcode gas costs (Istanbul 2019 made SLOAD 800 gas; Berlin 2021 repriced cold/warm access), 2300 gas no longer guarantees a callback can't mutate state — and future repricing could break the assumption again. Consensys and OpenZeppelin have advised against relying on the 2300 stipend since 2019. Rule: never treat `transfer()` as a reentrancy defense; use checks-effects-interactions plus a guard regardless of which send primitive you use. Detection signal: code that deliberately chose `transfer()` with a comment like \"safe, only 2300 gas\" — that's an audit finding about intent, not about the line itself. Prefer `call{value:}` with CEI and a `nonReentrant` lock, since `transfer` also breaks multisig/contract wallets that need gas in `receive()`.",
    category: "Reentrancy",
    kind: "rule",
  },
  // ---------------------------------------------------------- Access control
  {
    title: "Why is tx.origin authentication always a finding?",
    body: "`require(tx.origin == owner)` authenticates the EOA that STARTED the transaction chain, not the immediate caller. Attack: trick the owner into calling a malicious contract (phishing site, airdrop bait); that contract calls the victim contract, `tx.origin` is still the owner, checks pass, funds move to the attacker. This is a standard medium/high finding with no legitimate use in modern Solidity. Fix: always use `msg.sender`; if you need meta-transaction sender identity, use ERC-2771 (`_msgSender()`) with a trusted forwarder, never `tx.origin`. Detection signal: grep `tx.origin` — any hit is reportable. Related pitfall: `tx.origin` used for \"contract vs EOA\" detection (`tx.origin == msg.sender`) breaks with smart wallets and account abstraction (ERC-4337 / EIP-7702 delegations), so don't rely on it for that either — as of early 2026, 7702 adoption makes this check actively wrong.",
    category: "Access control",
    kind: "rule",
  },
  {
    title: "How was the Ronin bridge actually compromised?",
    body: "Ronin (March 2022, ~$625M) was NOT a smart-contract bug — it was key management. The bridge validator set required 5 of 9 signatures; the attacker (Lazarus Group, per US Treasury) compromised 4 of Sky Mavis's validator keys via social engineering, plus 1 more through a stale allowlist: the Axie DAO validator had been given RPC signing access months earlier and the permission was never revoked. Lesson for auditors: multisig security is (threshold, key independence, operational hygiene), not just the contract. When auditing a bridge or upgradeable protocol, ask: who holds the admin keys, are they on one machine/org, is there a timelock, can a single compromised deployer rug everything. A 5-of-9 where one entity controls 5 keys is a 1-of-1. Detection signal: `onlyOwner` mint/upgrade/pause powers with an EOA or low-threshold multisig and no timelock — flag it as centralization risk even if the code is \"correct\".",
    category: "Access control",
    kind: "example",
  },
  {
    title: "What is an unprotected initializer in an upgradeable contract?",
    body: "Implementation contracts for proxies are deployed with EMPTY state; their logic contract's `initialize()` (replacing the constructor) is callable by anyone if left unprotected on the implementation itself. An attacker calls `initialize()` on the implementation, becomes its owner/admin, then `selfdestruct`s it or — worse — uses a `delegatecall` in an admin function to hijack every proxy pointing at it. This is how several real incidents unfolded and why OpenZeppelin's docs tell you to lock the implementation: call `_disableInitializers()` in the implementation's constructor. Detection signals: `initialize` functions without `initializer` modifier; missing `constructor() { _disableInitializers(); }` in upgradeable contracts as of OZ 4.x+; any `delegatecall` reachable from an admin function (parity-wallet-style). Severity: critical when the implementation has any privileged surface; informational if the implementation has no state-mutating admin functions at all.",
    category: "Access control",
    kind: "pitfall",
  },
  {
    title: "Is missing whenNotPaused on a state function a real bug?",
    body: "Only sometimes — report it as medium at most unless funds can actually move during the pause. The point of `Pausable` is incident response: when an exploit is detected, admin pauses and the attack surface freezes. If `deposit()`/`withdraw()` lack `whenNotPaused` while `emergencyPause()` exists, the pause is theater — the attacker keeps draining. That's a real finding. But flagging a view function or a cosmetic setter for missing `whenNotPaused` is noise. Detection signal: contract inherits `Pausable` and defines `pause()`/`unpause()` entry points; grep which external functions lack the modifier and check whether each moves value or state that an ongoing exploit would touch. Also check the inverse: functions that should work WHEN paused (e.g., emergency exit for users) but have `whenNotPaused` — some protocols deliberately allow `withdraw` during pause; decide from the spec, not from a linter.",
    category: "Access control",
    kind: "rule",
  },
  // -------------------------------------------- Oracle manipulation and MEV
  {
    title: "What checks does a safe Chainlink price feed need?",
    body: "Raw `latestAnswer()` is deprecated and unchecked `latestRoundData()` is a top-5 real-world oracle bug. Minimum: `(uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData(); require(answer > 0); require(updatedAt != 0 && block.timestamp - updatedAt <= heartbeat); require(answeredInRound >= roundId);` — plus a sequencer-uptime check on L2s (if the Arbitrum/Optimism sequencer just came back, `updatedAt` can be fresh but the price stale relative to L1; use the official SequencerUptimeFeed with a grace period). Also: hardcode the feed address per asset, verify the feed's `decimals()` instead of assuming 8, and never use Chainlink for low-liquidity long-tail assets it doesn't robustly cover. Detection signal: `latestRoundData` return values partially destructured with `updatedAt`/`answeredInRound` ignored — grep the destructure pattern.",
    category: "Oracle manipulation and MEV",
    kind: "rule",
  },
  {
    title: "How was the Euler flash-loan exploit executed (March 2023)?",
    body: "~$197M, and the root cause was a missing health check, not the flash loan itself. Euler's `donateToReserves` let users burn their eTokens without the protocol checking the donor's collateralization. Attacker: (1) flash-borrowed DAI, deposited to get eDAI; (2) leveraged up via `mint()` (self-collateralized borrow, Euler-specific); (3) donated a huge eToken balance, pushing their own account into liquidation territory; (4) self-liquidated from a second account at a discount; (5) repaid the flash loan and kept the difference. Lesson: ANY function that reduces a user's collateral or debt balance — donate, gift, socialize-loss — must re-run the account liquidity check. Detection signal: functions that decrease balances without calling the protocol's `checkLiquidity`/health-factor equivalent. The flash loan only provided capital; the bug would work for any whale. Don't report \"uses flash loans\" as a vulnerability — report the invariant the flash loan broke.",
    category: "Oracle manipulation and MEV",
    kind: "example",
  },
  {
    title: "Can an attacker manipulate Uniswap V2 spot reserves as a price oracle?",
    body: "Yes, trivially, and it has burned dozens of protocols. If a lending/market contract prices collateral with `pair.getReserves()` or computes `amountOut = reserveOut * amountIn / reserveIn` from the live pair, one flash-loaned swap skews reserves for the rest of the transaction: the attacker pumps the pool, borrows against the inflated \"price\", unwinds the swap, repays the loan. Detection signal: any pricing path that reads `getReserves()`, `balanceOf(pool)`, or a single-block `slot0`/spot tick without time weighting. Fix: Uniswap V2 cumulative-price TWAP (`price0CumulativeLast` sampled across blocks), Uniswap V3 `observe()` with a window (commonly 30 min), or Chainlink. Also check TWAP window length vs manipulation cost — a 1-block V3 TWAP is still manipulable by a whale willing to hold the skew for one block. Rule of thumb: if price can be moved within one transaction, it's not an oracle, it's an invitation.",
    category: "Oracle manipulation and MEV",
    kind: "fact",
  },
  {
    title: "How does exchange-rate manipulation attack ERC-4626 vaults?",
    body: "Two flavors. (1) Inflation/donation attack: first depositor mints 1 wei of shares, then donates a large amount of underlying directly to the vault; the share price jumps, so the next depositor's deposit rounds DOWN to 0 shares — attacker redeems their 1 share for ~half the victim's deposit. OpenZeppelin's fix: virtual shares/decimals offset (`_decimalsOffset`), effectively starting the vault at a non-trivial exchange rate; alternatively require a minimum first deposit minted to a dead address. (2) Reward-streaming manipulation: if `totalAssets()` counts vested rewards, an attacker sandwiches the vesting boundary. Detection signals: `totalAssets()` implemented as `asset.balanceOf(address(this))` (donation-susceptible), `convertToShares` rounding against the depositor, no decimals offset. Check that `deposit`/`mint`/`withdraw`/`redeem` round in the direction that favors the VAULT, and verify with a foundry invariant.",
    category: "Oracle manipulation and MEV",
    kind: "pitfall",
  },
  {
    title: "Should my protocol use DEX spot price for liquidation thresholds?",
    body: "No. Liquidation is the worst place for manipulable prices because the profit is automatic: attacker moves the price, triggers liquidations, captures the liquidation bonus, restores the price. Mango Markets (October 2022, ~$114M) is the canonical case — the attacker pumped the MNGO perpetual price across venues with their own capital (no flash loan needed), then borrowed against the inflated collateral and walked away; \"oracle\" here included the venue's own mark price. Detection signals: liquidation logic reading any same-transaction-derived price (spot AMM, order book mid, single-oracle with thin liquidity); missing bounds between two price sources (e.g., revert if internal price deviates >x% from Chainlink); liquidation bonus high enough to fund the manipulation cost. Defenses: robust oracle + deviation circuit breakers, delayed liquidation triggers, per-block borrow caps.",
    category: "Oracle manipulation and MEV",
    kind: "example",
  },
  {
    title: "Does this swap function need a slippage parameter?",
    body: "If `swap` is called with `amountOutMin = 0` (or a deadline of `block.timestamp`), yes — that's a finding. Without a min-out bound, any searcher sandwiches the transaction: front-run buy pushes the price up, victim buys at the top, back-run sell profits the difference, victim eats the loss. Detection signals: hardcoded `0` or `1` as `amountOutMin`/`sqrtPriceLimitX96`; `block.timestamp` passed as deadline (means \"whenever a builder includes it\" — a stale tx can execute minutes later at a worse price); slippage computed from SPOT price instead of quoted-with-tolerance. Fixes: require the caller to pass a real `amountOutMin` and a short absolute deadline; for protocol-internal swaps use an oracle check (`require(out >= expected * (10000 - maxSlippageBps) / 10000)`). The bug is usually in contracts that swap on behalf of pooled funds and skip computing a bound.",
    category: "Oracle manipulation and MEV",
    kind: "rule",
  },
  {
    title: "Is block.timestamp dependence a vulnerability?",
    body: "Depends what it drives. ~15 seconds of validator influence (post-Merge, proposers can nudge timestamps within protocol bounds) doesn't matter for a 7-day timelock but matters for: randomness, short auction endings, interest accrual rounding tricks, and \"first tx after timestamp X wins\" mechanics. Report severity by consequence: lottery payout seeded by `block.timestamp` = high; `require(block.timestamp >= lockEnd)` with a 30-day lock = informational at best, often a false positive to NOT report. Detection signals worth grepping: `block.timestamp %`, `keccak256(abi.encode(block.timestamp`, comparisons in tight windows (< a few minutes) that gate value transfer. Also remember `block.timestamp` is the sequencer's claim, not wall clock — on some L2s it updates in coarse steps. For on-chain randomness, use Chainlink VRF or commit-reveal; `block.prevrandao` is still biasable by the proposer within a block.",
    category: "Oracle manipulation and MEV",
    kind: "pitfall",
  },
  // ------------------------------------------------- Signatures and replay
  {
    title: "How did the Wormhole bridge lose $326M to a signature bug?",
    body: "February 2022, Solana side. Wormhole's `verify_signatures` instruction used a deprecated `secp256k1` verification wrapper that didn't validate it was reading the genuine `secp256k1` sysvar account — an attacker could pass a fake sysvar account containing whatever \"verified guardian signatures\" they wanted. With forged guardian approval, they submitted a valid-looking message to mint 120,000 wETH with no ETH locked on Ethereum. Jump Crypto later backstopped the 120k ETH. Lessons: (1) signature verification bugs are often in the PLUMBING (which account/sysvar is trusted), not the crypto; (2) on Solana, every account passed to an instruction must be validated against expected program IDs/addresses; (3) on EVM, the analogous bug is accepting a signer address/verifier contract as calldata. Detection signal EVM-side: `ecrecover` results compared to addresses derived from user-supplied data without domain separation or trusted-verifier pinning.",
    category: "Signatures and replay",
    kind: "example",
  },
  {
    title: "What makes an off-chain signature replay-proof?",
    body: "Four ingredients, and missing any one is a finding. (1) EIP-712 domain separator binding the signature to `chainId` + `verifyingContract` — without it, a mainnet signature replays on a testnet/fork or a sibling deployment. (2) A per-signer nonce stored on-chain (`usedNonces[signer][nonce] = true` or sequential `nonces[signer]++`) — without it, the same signed order/permit executes twice. (3) A deadline (`require(block.timestamp <= deadline)`) so stale signatures can't be front-run months later. (4) For airdrop/allowlist claims, bind `msg.sender` or the recipient into the signed payload, else anyone replays the proof with their own address. Detection signals: `ecrecover` without a nonce mapping; EIP-712 domain missing `chainId` (breaks on forks — chainId should be read live, not hardcoded at deploy); permit-style functions without deadline. Classic victims: early airdrop contracts where one signature claimed for many, and bridges replaying messages across chains.",
    category: "Signatures and replay",
    kind: "rule",
  },
  {
    title: "What ecrecover pitfalls should an auditor check?",
    body: "Three recurring ones. (1) Signature malleability: for a valid `(r, s, v)`, the flipped `(r, n - s, v^1)` also verifies for the same signer. If your replay protection keys on the SIGNATURE bytes (e.g., `usedSignatures[sigHash]`) instead of a nonce, the malleated twin replays. OpenZeppelin's `ECDSA.recover` rejects high-s values; raw `ecrecover` does not — so either use OZ or check `s <= secp256k1n/2` yourself (that's what EIP-2 did at protocol level). (2) `ecrecover` returns `address(0)` on invalid input instead of reverting — `require(signer != address(0))` or, worse, an uninitialized/zero \"owner\" passing the check. (3) Precompile returns are unchecked when using inline assembly with `staticcall` — check the success flag and return size. Also remember `ecrecover` only proves EOA signatures; for contract wallets you need ERC-1271 `isValidSignature`, and permits must handle both paths.",
    category: "Signatures and replay",
    kind: "pitfall",
  },
  {
    title: "Is ERC-2612 permit() a front-running / DoS vector?",
    body: "Yes, in a specific benign-but-breaking way: `permit` signatures are public in the mempool, so anyone can submit your permit before your bundled `depositWithPermit` transaction; the permit then succeeds, and your transaction's own `permit()` call reverts on the already-used nonce, reverting the whole bundle. Protocols integrating permit should wrap it in try/catch: `try token.permit(...) {} catch {}` and then just call `transferFrom` — if the permit was already spent, allowance is already set. Detection signal: integrations that call `permit` unconditionally without a fallback. Second pitfall: tokens whose `permit` exists but is non-standard (DAI-style `permit` uses an `allowed` bool instead of a value); verify against the actual token, not the interface. Also note permit does not equal approval safety: a signed permit is an approval anyone can execute — treat leaked permits like leaked approvals.",
    category: "Signatures and replay",
    kind: "pitfall",
  },
  // -------------------------------------------- Arithmetic and rounding
  {
    title: "Where does integer division rounding actually lose money?",
    body: "Anywhere a division decides a payment. Rules: (1) Round AGAINST the user and FOR the protocol/vault — `shares = assets * totalSupply / totalAssets` must floor on deposit, and withdrawal asset amounts must floor too; a ceil in the wrong place is a slow drain. (2) Multiply before dividing: `a * b / c`, never `a / c * b`, or precision collapses to zero for small `a`. (3) Pick one fee convention: `amount * feeBps / 10000` subtracted differs by a wei from `amount * (10000 - feeBps) / 10000`. (4) First-depositor paths (`totalSupply == 0`) need explicit branches. (5) Solidity 0.8's checked arithmetic stops overflow but NOT precision loss — most real \"arithmetic\" findings post-0.8 are rounding direction and scale mismatches (mixing 6-decimal USDC with 18-decimal math), not overflow. Detection signal: grep divisions that feed `transfer` amounts or share mints; trace rounding direction.",
    category: "Arithmetic and rounding",
    kind: "rule",
  },
  {
    title: "Why does decimals() handling break cross-token vaults?",
    body: "Protocols hardcoding 18 decimals (or assuming `price * amount` is normalized) break the moment USDC/USDT (6 decimals), WBTC (8), or a weird-decimal token enters. Symptoms: a vault that values 1 USDC at 10^12x its worth, or a borrow cap that's meaningless per-asset. Fix pattern: normalize every amount to a canonical precision at the boundary: `normalized = amount * 10**(18 - tokenDecimals)` (cache `10**IERC20Metadata(token).decimals()` at registration), and scale oracle prices by the feed's own `decimals()` — Chainlink USD feeds are usually 8, ETH feeds 18, and mixing them silently is a classic. Detection signals: constants like `1e18` applied to token amounts; missing `decimals()` calls entirely; `try token.decimals()` fallbacks defaulting to 18 without justification. Also: `decimals()` is OPTIONAL in the ERC-20 spec; decide and document the fallback. Audit test: run the whole foundry suite with a 6-decimal mock token.",
    category: "Arithmetic and rounding",
    kind: "rule",
  },
  {
    title: "Is unchecked math ever safe to leave in the code?",
    body: "Yes — deliberately, in two spots: loop counters (`for (uint i; i < n; ) { ...; unchecked { ++i; } }`, standard since 0.8 to save gas) and provably-bounded subtraction (after `require(a >= b)`, `unchecked { c = a - b; }`). Don't report gas-optimized `unchecked` blocks as vulnerabilities; instead verify the bound that justifies each one. What IS reportable: `unchecked` wrapping user-controlled values (token amounts, timestamps added to deadlines) where overflow wraps small and bypasses a later check — pre-0.8 the classic was `balances[msg.sender] -= amount` underflowing to a huge balance (the 2018 batchOverflow/BeautyChain-style bugs were this class in multiplication). Detection signal: `unchecked` blocks containing user inputs or external-call-adjacent arithmetic; also `type(uint256).max` sentinel allowances reused in arithmetic (many protocols treat max allowance as infinite — reuse poisons accounting).",
    category: "Arithmetic and rounding",
    kind: "fact",
  },
  {
    title: "How do fee-on-transfer tokens break deposit() accounting?",
    body: "If `deposit(uint amount)` does `token.transferFrom(msg.sender, address(this), amount)` and then credits the user `amount` shares, any deflationary token (Safemoon-style, or USDT if its fee switch ever flips) delivers LESS than `amount` — the vault credits shares it never received assets for, and the last withdrawers eat the shortfall. Fix: measure actual received: `uint before = token.balanceOf(address(this)); token.safeTransferFrom(...); uint received = token.balanceOf(address(this)) - before;` and account with `received`. Detection signal: `transferFrom` followed by accounting that trusts the calldata `amount`. Same class: rebasing tokens (stETH, AMPL) make stored balances stale — either wrap them (wstETH pattern) or disallow them with an explicit token allowlist. Also check the inverse on withdrawals: tokens that take a fee on `transfer` make `withdraw(x)` deliver less than x. A good audit deliverable includes an explicit \"supported token assumptions\" section listing these constraints.",
    category: "Arithmetic and rounding",
    kind: "pitfall",
  },
  // ------------------------------------------- Upgradeability and proxies
  {
    title: "What is a storage collision in upgradeable contracts?",
    body: "Proxy and implementation share one storage layout (the proxy's). If the new implementation declares variables in a different order or inserts a new one in the middle, every existing slot is reinterpreted — an address becomes a balance, an admin becomes a token. Real incident class: the Audius governance takeover (2022) traced to proxy/initialization misconfiguration, letting the attacker re-initialize and seize admin. Rules: append-only variables in upgradeable contracts; never reorder or change types; use storage gaps (`uint256[50] private __gap`) in base contracts meant for inheritance; namespaced storage (ERC-7201, `keccak256` \"diamond-style\" slots) for libraries. Detection signals: diff the flattened storage layout between versions — `openzeppelin-upgrades` plugins do this automatically (`validateUpgrade`, `storageLayout` in build info); manual audits should dump `solc --storage-layout` for both versions and compare. Also flag `delegatecall` to a user-supplied address anywhere — that plus storage control is instant full compromise.",
    category: "Upgradeability and proxies",
    kind: "rule",
  },
  {
    title: "How dangerous is delegatecall to a user-supplied address?",
    body: "Critical, unconditionally — it's the single most dangerous pattern in Solidity. `delegatecall` executes foreign code in YOUR storage context: the callee can rewrite any slot, including the implementation pointer or owner. Parity multisig hack #2 (November 2017, ~$150M frozen forever): the library contract had an unprotected `initWallet`; the attacker initialized themselves as owner of the shared library and called `kill` (`selfdestruct`), bricking every wallet that `delegatecall`ed into it. Detection signals: `delegatecall` where the target comes from calldata, storage writable by non-admins, or a registry that can be updated without timelock; also library contracts with `selfdestruct` anywhere reachable. Fixes: hardcode/whitelist delegatecall targets; never expose a public function that delegatecalls arbitrary addresses; on the target side, no `selfdestruct` and locked initializers. In reports, one foundry test that overwrites slot 0 through the delegatecall is enough to prove critical severity.",
    category: "Upgradeability and proxies",
    kind: "example",
  },
  {
    title: "What should I check in the proxy admin and upgrade flow itself?",
    body: "Beyond code: (1) Who is `ProxyAdmin`/owner — EOA, multisig, or governor? EOA + instant upgrade = flag as centralization risk with concrete impact (\"owner can replace implementation and drain all user funds in one transaction\"). (2) Timelock: is there a delay between proposing and executing an upgrade so users can exit? (3) The upgrade PATH: does `upgradeToAndCall` let the admin atomically call `initialize` on the new implementation with attacker-chosen args? (4) Selector clashing in transparent proxies: a proxy function and implementation function with the same 4-byte selector cause silent misrouting. (5) For UUPS: the upgrade function lives in the IMPLEMENTATION — verify `upgradeToAndCall` is role-gated AND exists in the new implementation, or the proxy is bricked; simulate the upgrade in a fork test and assert balances/roles survive. Tooling: `@openzeppelin/upgrades-core` `validateUpgrade` catches layout breaks and unsafe `delegatecall`/`selfdestruct` — run it in CI, as of early 2026 it's the standard gate.",
    category: "Upgradeability and proxies",
    kind: "rule",
  },
  // --------------------------------- Token quirks and integration hazards
  {
    title: "Why does my code fail on USDT but work on every test token?",
    body: "Because USDT (mainnet) violates the ERC-20 return-value convention: its `transfer`/`transferFrom`/`approve` return nothing instead of `bool`. A contract doing `require(token.transfer(...))` compiled against `IERC20` reverts on the missing return data. Fix: OpenZeppelin `SafeERC20` (`safeTransfer`, `safeTransferFrom`, `forceApprove`), which tolerates both conventions. Related USDT quirks worth checking in an audit: (1) `approve` reverts when changing a non-zero allowance to another non-zero value — use `forceApprove` (OZ 5.x) or approve(0) first; (2) USDT is upgradeable and has a fee-on-transfer switch (currently off — don't assume it stays off); (3) USDT/USDC are blacklistable — a protocol that can't handle a blacklisted user can brick withdrawals for everyone (consider pull patterns). Detection signals: raw `IERC20(token).transfer(...)` with require; `approve(spender, x)` called twice without zeroing. Rule: any integration targeting mainnet stables must be tested against forked mainnet USDT, not a mock.",
    category: "Token quirks and integration hazards",
    kind: "rule",
  },
  {
    title: "Are ERC-777 and ERC-1363 tokens dangerous to integrate?",
    body: "They add transfer-time hooks — `tokensReceived` (777) / `onTransferReceived` callbacks (1363) — which hand control flow to the recipient mid-transfer. That's a reentrancy vector inside what looks like a simple `transfer`: Cream Finance's 2021 exploit rode exactly this. Even without 777, remember ERC-20 `transfer` to a contract is fine (no hook), but `safeTransferFrom` in ERC-721/1155 DOES callback (`onERC721Received`) — NFT vault accounting updated after the safeTransfer is reentrant. Detection signals: state changes after ANY token transfer call; integrations that assume \"it's just an ERC-20\" without checking the token's actual code; `ERC777`/`ERC1820` registry lookups in dependencies. Fixes: treat every token movement as an external call (CEI + reentrancy guard), or restrict to an allowlist of known token implementations. For reports: hook-enabled tokens are a medium unless you show the concrete reentrancy path to value loss — then it's high. Always build the PoC.",
    category: "Token quirks and integration hazards",
    kind: "pitfall",
  },
  {
    title: "How do unbounded loops over dynamic arrays become DoS bugs?",
    body: "Two ways. (1) Gas-griefing growth: a function iterates `for (uint i; i < users.length; i++)` to distribute rewards or compute totals; anyone can register (permissionless `join()`), so the array grows until the loop exceeds block gas limit and the function is permanently uncallable — funds locked. This is a real incident class (early yield aggregators, GovernMental-style payout contracts). (2) External calls in a loop: `for (...) { users[i].call{value:...}(\"\") }` — one reverting recipient DoSes everyone (that's why pull-over-push exists). Detection signals: loops over arrays that grow via permissionless calls; `push` without an upper bound; loops containing external calls or token transfers; `delete array` on huge arrays (still O(n) on some paths). Fixes: pagination (`claimable(start, end)`), pull-over-push claims, Merkle-distributor airdrops (O(1) claim with proof), enumerable-set caps. In reports, prove it: a foundry test that fills the array until `distribute()` runs out of gas turns a \"theoretical\" medium into a solid high.",
    category: "Token quirks and integration hazards",
    kind: "rule",
  },
  {
    title: "What should I check about selfdestruct and forced ETH?",
    body: "`selfdestruct` has two audit-relevant faces. (1) Presence in any library/implementation contract = finding (Parity freeze); post-Cancun (EIP-6780), `selfdestruct` only actually deletes the contract if called in the same transaction that created it, but it STILL force-sends its ETH balance — so the semantic you must audit is the forced-send. (2) Forced ETH as an attack: any contract can receive ETH via `selfdestruct` from a sacrificial contract or via coinbase payments, so accounting like `require(address(this).balance == totalDeposits)` or reward math keyed off raw `balance` can be broken by a dust donation — same class as the vault donation attack. Detection signals: `address(this).balance` used in equality checks or share pricing (use an internal accounting variable instead); `selfdestruct`/`suicide` opcode anywhere; missing `receive()` with logic assuming ETH can't arrive. Note as of early 2026: post-EIP-6780, \"selfdestruct doesn't work anymore\" is a common FALSE claim — the forced-ETH vector survives.",
    category: "Token quirks and integration hazards",
    kind: "fact",
  },
  {
    title: "Are unchecked low-level call returns worth reporting?",
    body: "Yes, when value or logic depends on the call succeeding. `addr.call{value: x}(\"\")` returns `(bool ok, bytes)` — if the return is ignored and the call fails (out of gas, reverting receiver), the contract continues as if the ETH was sent: accounting says paid, receiver got nothing. Same for `token.call(abi.encodeWithSignature(\"transfer(...)\"))` without checking return data. Detection signal (grep): `\\.call\\{` and `.call(` lines whose results aren't captured or required; also `abi.encodeWithSignature` with hand-typed signatures (typo in the string = silent failure, no compiler check — prefer `abi.encodeCall`). Severity calibration: ignored return on a user-initiated refund = medium/high (user loses funds); ignored return on a best-effort call with no accounting = low/info. Related: `try/catch` that catches but swallows all failures including your own bugs — catch specific revert reasons or log and re-throw. Solidity's high-level ERC-20 calls revert properly; the danger zone is assembly and low-level calls.",
    category: "Token quirks and integration hazards",
    kind: "pitfall",
  },
  // -------------------------------------- Audit workflow and tooling
  {
    title: "How do I run slither effectively on a new codebase?",
    body: "Basics: `slither .` (or `slither --compile-force-framework foundry` in a foundry repo). High-value detectors: `reentrancy-eth`, `reentrancy-no-eth`, `unchecked-transfer`, `tx-origin`, `uninitialized-state`, `arbitrary-send-eth`, `suicidal`, `controlled-delegatecall`. Useful extras: `slither . --print human-summary` (complexity + auth surface overview), `--print contract-summary`, `slither-check-upgradeability proxy.sol impl.sol` for proxy diffs, and `slither . --triage-mode` to persist dismissals. Honest limits: slither's reentrancy detector over-reports on `nonReentrant` functions (learn to triage fast); it can't see cross-protocol state (oracle staleness, LP pricing) or economic attacks (flash loans, rounding direction). Workflow: run it first for a cheap bug list, triage every finding to true/false positive in one pass, then spend human time on the economic layer slither can't model. Pin the version in CI — detector output churns between releases (as of early 2026, 0.10.x line).",
    category: "Audit workflow and tooling",
    kind: "fact",
  },
  {
    title: "What's the right foundry workflow for auditing a DeFi protocol?",
    body: "Four layers. (1) Unit: `forge test -vvv` against the repo's suite — check what's NOT tested. (2) Fuzz: property-style tests with `function testFuzz_deposit(uint256 amount)` and `bound()` inputs; run deep with `forge test --fuzz-runs 100000` before reporting \"tested.\" (3) Fork: `forge test --fork-url $MAINNET_RPC` against real USDT/oracles/pools — this is where token-quirk and integration bugs surface; use `vm.createSelectFork` and pin a block for reproducibility. (4) Invariant: `forge test --invariant-runs 256 --invariant-depth 30` with handlers. Practical flags: `--mt` to run one test, `forge coverage` to find untested branches, `forge snapshot` for gas regression, `cast call` for quick mainnet poking. Auditing tip: write your PoCs as foundry tests in the client's repo and attach them to findings — a runnable PoC that prints `stolen: 4123 ether` is worth more than two pages of prose. Also `forge inspect <Contract> storageLayout` for upgrade checks.",
    category: "Audit workflow and tooling",
    kind: "rule",
  },
  {
    title: "How do I write an invariant test for vault solvency?",
    body: "Pattern: a handler contract wraps every state-changing entry point and the fuzzer calls them randomly: `function invariant_solvency() external { assertGe(token.balanceOf(address(vault)), vault.totalOwed()); }`. For an ERC-4626 vault, the core invariants: (1) `totalAssets() >=` sum claimable by all shares (track ghost variables in the handler: sum of shares minted per actor, sum withdrawn); (2) `convertToAssets(totalSupply()) <= totalAssets() + rounding tolerance`; (3) no actor can end a run with more assets than (deposited - withdrawn + donations it made). Setup details that matter: `targetContract(address(handler))` so fuzzing hits only your handlers; `targetSelector` to exclude or deliberately include admin functions; bound inputs with `bound(x, 1, 1e30)` to avoid trivial reverts; use ghost accounting (`ghost_totalDeposited`) because on-chain getters are what you're testing. Run deep: `--invariant-runs 512 --invariant-depth 50 --invariant-fail-on-revert false` — and when it breaks, `forge` prints the exact call sequence; shrink it into the finding PoC.",
    category: "Audit workflow and tooling",
    kind: "layout",
  },
  {
    title: "When should I use echidna or mythril instead of slither/foundry?",
    body: "Echidna: property fuzzer for EVM; write `function echidna_never_insolvent() public returns (bool) { return token.balanceOf(address(vault)) >= vault.totalOwed(); }` and run `echidna . --contract EchidnaTest --config echidna.yaml`. It explores weirder sequences than hand-written handlers; weaker than foundry at developer ergonomics, better at long-horizon stateful search. Use it to attack invariants foundry invariant-testing can't express easily (cross-contract, many actors). Mythril: symbolic execution — `myth analyze contract.sol` finds reachable assertion failures, integer issues, and some access-control paths without writing tests; expect slow runs and false positives on anything non-trivial; good for small critical components (signature verifiers, math libs). Medusa (echidna successor in Go) is worth knowing as of early 2026. Honest division of labor: slither = static smoke screen (minutes), foundry = your PoC and regression engine, echidna/medusa = adversarial stateful search (hours), mythril/halmos = bounded formal-ish check on small targets. No tool finds oracle manipulation designs — that's reading.",
    category: "Audit workflow and tooling",
    kind: "fact",
  },
  {
    title: "How should I read an unfamiliar codebase in the first hours of an audit?",
    body: "Trust boundaries first, code second. (1) Draw the actor map: EOAs, keepers, oracles, admins, other protocols — then mark every external function with who can call it and what value flows. Anything `onlyOwner` touching user funds is a centralization note; anything permissionless moving value is where exploits live. (2) Map the money paths: deposit → where do assets sit → who can move them → withdraw. Follow the balance, not the function names. (3) List integration assumptions: which tokens, which oracle, which chain — each assumption is a checklist item (decimals, hooks, staleness, blacklist). (4) Read admin/upgrade paths completely — small and disproportionately catastrophic. (5) Only then read core logic line-by-line, with slither output beside you. Keep a \"questions for the devs\" list — undocumented invariants (\"totalAssets never decreases except on loss events\") are gold; if the devs can't state their invariants, that itself is a finding about spec quality.",
    category: "Audit workflow and tooling",
    kind: "layout",
  },
  {
    title: "How do I write a finding that a client will actually fix?",
    body: "Structure: title (imperative + impact, e.g. \"Missing staleness check on Chainlink feed allows liquidations at outdated prices\"), severity with justification, affected code (file:line), description, impact in money terms, runnable PoC, recommendation with actual code. Severity calibration: Critical = direct loss of user funds exploitable now; High = loss under plausible conditions; Medium = loss requiring specific states/timing, or griefing; Low = best practices, gas, minor deviations. The two things juniors skip: (1) quantified impact — \"attacker steals up to X% of TVL, ~$N at current balances\" beats \"funds at risk\"; (2) a fix the devs can paste — show the corrected require statement, don't say \"add validation.\" State assumptions (\"assumes keeper latency ≤ 1 block\") so the client can accept risk explicitly instead of arguing severity. If your fix redesigns the protocol, also offer the minimal mitigation.",
    category: "Audit workflow and tooling",
    kind: "rule",
  },
  {
    title: "What separates a $5k audit report from a $50k one?",
    body: "The $5k report is slither output with prose around it: known-pattern findings, no PoCs, severity inflation to look busy. The $50k report contains things tools can't produce: (1) a bespoke economic attack with numbers — a flash-loan path through the protocol's own math, simulated on a mainnet fork with a profit figure; (2) invariant violations the devs didn't know were invariants (\"your health factor can go negative mid-liquidation because...\"); (3) integration risk analysis across real deployments — actual oracle heartbeats, actual pool liquidity vs position size, actual multisig signers; (4) honest triage — false positives dismissed explicitly, so real findings aren't diluted; (5) fix review — a second pass verifying patches didn't introduce new bugs. Buyers pay for adversarial simulation and judgment, not checklists. If every finding could have come from a linter, the client notices. One deep, correct high-severity finding with a working fork PoC beats twenty lint-level mediums.",
    category: "Audit workflow and tooling",
    kind: "fact",
  },
  {
    title: "Which common 'findings' are actually false positives I shouldn't report?",
    body: "Report-silencers that mark you as junior: (1) \"Floating pragma\" on a repo pinned by the build config — informational at best. (2) \"`block.timestamp` can be manipulated by miners\" on a 30-day timelock. (3) Slither's `reentrancy-eth` on a function already guarded by `nonReentrant` with correct CEI — triage it, don't paste it. (4) \"Missing zero-address check\" on a setter where zero is harmless or intended. (5) \"Centralization: owner can pause\" — pausing is the mitigation; report only when pause/upgrade powers can take user FUNDS. (6) Gas optimizations presented as vulnerabilities. (7) \"No events emitted\" on trivial setters. (8) Solidity version not latest — only matters if a specific compiler bug applies. (9) \"Unchecked return value\" where failure is impossible or irrelevant. Rule of thumb: every finding needs an attack path to real loss or a spec violation articulable in one sentence with numbers; otherwise it belongs in the informational appendix.",
    category: "Audit workflow and tooling",
    kind: "pitfall",
  },
];
