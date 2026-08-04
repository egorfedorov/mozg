export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ── Prohibited terminology ──────────────────────────────────────────────
  {
    title: "Which gambling words are flat-out banned on stake.us?",
    body: "As of early 2026, the Stake Engine social-mode spec requires these replacements in every player-facing string before a game ships on stake.us: bet → play, bets → plays, betting → playing, total bet → total play, stake → play amount, wager → play, gamble → play, cash → coins, money → coins, currency → token, deposit → get coins, withdraw → redeem, buy → play, purchase → play, bonus buy → bonus/feature, buy bonus → get bonus, bought → instantly triggered, rebet → respin, cost of → can be played for, at the cost of → for. Any occurrence in rules, UI, or imagery blocks approval. Verify against the current social-mode docs before release — the table gets updated.",
    category: "Prohibited terminology",
    kind: "rule",
  },
  {
    title: "How do I rewrite 'pays out' and payout language for sweeps mode?",
    body: "The approved payout-family replacements are: pay → win, pays → wins, paid → won, pay out → win/won, paid out → won, pays out → win, payer → winner, profit → net gain, pay table → win table, and \"be awarded to player's accounts\" → \"appear in player's accounts\". One known drift: older guidance mapped credit → balance, while the current Stake Engine table says credit → coins — prefer the current official table and re-check it per release. After any replacement, re-read the sentence: tense and plurality must still work (\"all wins are won\" is a failure), and the mechanic meaning must survive. Never leave a half-converted sentence because the phrase still scans.",
    category: "Prohibited terminology",
    kind: "rule",
  },
  {
    title: "Does the banned-words rule cover plurals, verb forms and casing?",
    body: "Yes. The audit must match exact terms plus common variants: singular/plural (bet/bets), verb forms (betting, wagered), hyphenated forms (re-bet), title-case labels (Total Bet), and all-caps UI (BUY BONUS). Two non-obvious entries people miss: \"win feature\" → \"play feature\", and the responsible-gambling pair \"loss limit\" → \"stop limit\" and \"loss streak\" → \"miss streak\". Grep case-insensitively across locale JSON, config files, and hardcoded frontend literals, then eyeball each match in context — substring matches like \"bet\" inside \"alphabet\" or \"global\" are false positives you must exclude manually rather than blindly replacing.",
    category: "Prohibited terminology",
    kind: "rule",
  },
  {
    title: "I replaced all HUD labels but still failed social-mode approval — why?",
    body: "The classic failure is replacing only the HUD while game rules, paytable text, info modals, bonus summaries, replay overlays, or error states still carry restricted wording. Reviewers read the rules modal. A second failure mode is mixing compliant and non-compliant wording on the same screen — one button saying Play while the win banner says Total Bet is an automatic flag. Audit by surface, not by file: HUD labels, CTA buttons, modals, rules, paytable, feature descriptions, replay overlays, bonus summaries, error states, promo/liveops surfaces. Every surface must use the identical compliant phrase for the same feature family.",
    category: "Prohibited terminology",
    kind: "pitfall",
  },
  {
    title: "Can banned words hide inside images, logos or button art?",
    body: "Yes, and this is a frequent rejection reason. The restricted-terms rule applies to text embedded in splash art, buttons rendered as images, feature banners, symbol labels, help panels, and any static art used in-game — not just localization strings. If a button label is baked into a PNG and says \"BUY BONUS\", the asset itself must be redone; swapping the alt text or a neighboring DOM label does nothing. During audit, list every image that contains text, transcribe it, and run the same replacement table over the transcription. Call out asset changes explicitly in your rewrite plan so art and code land in the same build.",
    category: "Prohibited terminology",
    kind: "pitfall",
  },
  {
    title: "Show me approved before/after rewrites for common slot copy.",
    body: "Stable, review-passing rewrites from the Stake Engine social-mode guidance: \"Place your bets\" → \"Come and play\" or \"Join in the game\". \"This feature can be bought\" → \"This feature can be instantly triggered\". \"The bonus can be purchased for X\" → \"The bonus can be played for X\". \"Winnings are paid to the player\" → \"Wins appear in the player's account\". \"Total Bet: 10\" → \"Total Play: 10\". \"Buy Bonus\" button → \"Get Bonus\". Keep the same replacement for the same feature everywhere — if the button says Get Bonus, the rules must not say the feature is \"played for\" somewhere and \"instantly triggered\" elsewhere unless context genuinely differs.",
    category: "Prohibited terminology",
    kind: "example",
  },
  {
    title: "Why did my find-and-replace compliance pass produce broken copy?",
    body: "Blind substitution breaks grammar, brevity, and meaning. Typical damage: tense mismatches (\"you play 100 coins on that spin\" where the past-tense mechanic is now unclear), plurals (\"play/s\" left literally in UI), buttons that overflow their width because \"play amount\" is longer than \"stake\", and worst of all, replacements that change the mechanic meaning — e.g. rewriting a genuine purchase of Gold Coins as \"play\" in the cashier flow, where purchase wording is actually required. Rewrite per surface, then re-check tense, plurality, headline tone, and button width. Short is good, but never shorten until the mechanic becomes unclear.",
    category: "Prohibited terminology",
    kind: "pitfall",
  },
  {
    title: "How do I structure a social-mode compliance audit before submission?",
    body: "Run it as a fixed pass: (1) enumerate every player-facing text surface — HUD, buttons, modals, rules, paytable, feature descriptions, replay overlays, bonus summaries, error states, promo surfaces; (2) grep each surface for the full restricted table including plurals, verb forms, hyphenation and casing; (3) replace using the official table, preferring the stable phrase over invented edgy alternatives; (4) re-read each result for grammar and mechanic meaning; (5) transcribe and audit text baked into images; (6) confirm one consistent compliant phrase per feature family across all screens. Sign off only when no surface reads from an un-audited source, including config-driven copy.",
    category: "Prohibited terminology",
    kind: "rule",
  },
  // ── Sweepstakes model rules ─────────────────────────────────────────────
  {
    title: "What's the actual copy difference between a real-money casino and stake.us?",
    body: "Real-money casino copy (stake.com) can say bet, stake, wager, deposit, withdraw, cash, jackpot, and win money freely. Social-casino copy (stake.us, triggered by the social=true URL parameter) must strip every gambling term and frame everything as play with virtual coins: bet → play, money → coins, withdraw → redeem. The same game binary typically serves both: the RGS sends social=true and the frontend switches to the sweeps_en locale set. There is no special language code for social mode — the lang parameter arrives as usual (en, ru, etc.) and you route wording off the social flag, not the language.",
    category: "Sweepstakes model rules",
    kind: "fact",
  },
  {
    title: "What is AMOE and why does every sweepstakes casino need it?",
    body: "AMOE is the Alternate Method of Entry — the legal backbone that makes a sweepstakes promotion not an illegal lottery in the US. Because a lottery is prize + chance + consideration (payment), removing consideration keeps it legal: players must be able to obtain the redeemable currency (Stake Cash) free of charge, typically via mail-in entry and free daily/login bonuses. Practical copy consequence: \"No purchase necessary\" must appear in the promotion rules and T&Cs, the free entry route must be real and documented, and marketing must never state or imply that buying improves winning chances. This area drifts with state law — have counsel verify current requirements as of early 2026.",
    category: "Sweepstakes model rules",
    kind: "rule",
  },
  {
    title: "How do I write about Gold Coins vs Stake Cash without breaking the model?",
    body: "Social casinos run a dual currency. Gold Coins (GC) are play-for-fun: copy must never attribute monetary value or redeemability to them — say \"get coins\", never \"worth $X\". Stake Cash (SC) is the promotional sweepstakes entry that can be redeemed for prizes. The critical wording rule: players never buy SC. SC is received free — bundled with optional GC purchases, via promotions, or via AMOE — and copy must reflect that (\"get 5 free Stake Cash with this coin bundle\", not \"buy Stake Cash\"). Describing a direct SC purchase collapses the sweepstakes model into gambling and is a serious compliance error.",
    category: "Sweepstakes model rules",
    kind: "fact",
  },
  {
    title: "Can I say 'win real money' or 'jackpot' on stake.us?",
    body: "No to \"win real money\": social-mode copy must avoid claiming players win money or cash. The approved framing is that Stake Cash can be redeemed for prizes — use \"redeem\", never \"cash out\" (withdraw → redeem in the table). \"Jackpot\" is not on the official Stake Engine restricted list as of early 2026, but conservative studios avoid it in sweeps copy because it implies a gambling payout; \"top prize\", \"grand prize\" or \"max win\" are the safe phrasings. Check the current platform list before shipping — terms get added, and a term tolerated in one quarter's review can be flagged in the next.",
    category: "Sweepstakes model rules",
    kind: "rule",
  },
  {
    title: "Where must 'no purchase necessary' disclosure actually appear?",
    body: "At minimum: the full promotion/sweepstakes rules (T&Cs page), any promo or liveops surface advertising Stake Cash or prizes, and the purchase flow for Gold Coin bundles. The standard wording is along the lines of \"No purchase necessary to play or win\" plus a pointer to the free entry method and the full rules. Bonus banners, tournament chips, and drops-style widgets all count as promo surfaces — a compliant rules page does not rescue a promo banner that omits the disclosure. Also keep the claim \"purchase does not increase chances of winning\" consistent everywhere; a promo implying buyers get better odds contradicts the model.",
    category: "Sweepstakes model rules",
    kind: "rule",
  },
  {
    title: "How should bonus and promo copy differ between stake.com and stake.us builds?",
    body: "Same mechanic, different vocabulary. A stake.com banner may say \"Deposit $50, get 50 free spins — wager 40x\". The sweeps equivalent must strip every gambling verb: deposit → get coins, purchase → play framing only for the GC bundle, and bonus buy → get bonus inside the game. Promo copy on stake.us also needs the no-purchase-necessary disclosure nearby and must never tie winning odds to purchases. Watch hyphenated and compound terms in promo art: \"cashback\", \"reload bonus\", and \"bet boost\" all contain restricted roots — rewrite as coin-back / top-up bonus style phrasing or drop the concept. Transcribe banner image text and audit it like any other string.",
    category: "Sweepstakes model rules",
    kind: "rule",
  },
  // ── Jurisdiction gating ─────────────────────────────────────────────────
  {
    title: "Which US states does a sweepstakes casino typically have to block?",
    body: "As of early 2026, stake.us-style platforms commonly exclude players from Washington, Nevada, Idaho, Michigan, Kentucky, New York, and Vermont; some operators add more (state lists drift as legislatures and regulators move on sweepstakes models — several states issued cease-and-desists or new statutes recently). Treat the list as configuration, not code: keep excluded states in one data file, version it, and re-verify against the operator's current terms before every release. Enforcement is the operator's job at account level, but game submissions may be asked to demonstrate the block. Never hardcode a stale list copied from a forum post.",
    category: "Jurisdiction gating",
    kind: "rule",
  },
  {
    title: "Is geo-IP alone enough to enforce state blocking?",
    body: "No. Practice-derived enforcement is layered: (1) geo-IP check at registration and each login to refuse excluded-state connections; (2) KYC document verification — government ID plus proof of address — before any prize redemption, which catches VPN users who slipped past IP checks; (3) explicit state/address attestation in the signup flow and T&Cs acceptance; (4) re-verification triggers when account details change. Blocking must happen at the account/session level, not by hiding a page — a determined user loading the game URL directly from an excluded state should still be refused. Redemption is the hard checkpoint: no SC redemption without passed KYC.",
    category: "Jurisdiction gating",
    kind: "rule",
  },
  {
    title: "What age gate do social casinos need, and is 18+ always enough?",
    body: "The common minimum is 18+, enforced with a date-of-birth gate before play plus an age attestation in the T&Cs, and re-confirmed during KYC before redemption. But 18+ is not universal: some jurisdictions and platform policies push social-casino products to 21+, and app-store age ratings can independently force stricter presentation. As of early 2026 the safe default is 18+ with a config flag per jurisdiction — verify the operator's current terms and each target state's rule before launch. The age gate should block, not nag: a failed or skipped date-of-birth check must not allow coin purchases or SC play.",
    category: "Jurisdiction gating",
    kind: "fact",
  },
  {
    title: "How does a Stake Engine game know it's running in sweeps/social mode?",
    body: "The RGS passes a URL query parameter: social=true for social-casino contexts (stake.us) and social=false otherwise. The lang parameter is still sent normally (en, ru, es...) — there is no special social language code. Per current guidance, when social=true the game should render English with the restricted-phrase replacements regardless of the lang value; other languages can be ignored in social mode. The standard localization pattern is parallel locale files prefixed sweeps_ (sweeps_en, sweeps_es): social=false selects the base locale, social=true selects the sweeps variant. Route every text lookup through that switch — including config-driven copy.",
    category: "Jurisdiction gating",
    kind: "rule",
  },
  {
    title: "I built sweeps_en but gambling words still showed on stake.us — why?",
    body: "Almost always a routing or coverage bug, not a translation bug. Common causes: some screens read from the default locale because their lookup wasn't wired into the social switch; config-driven strings (gameInfoConfig, modal configs, bonus descriptions) live outside the locale files and were never split; hardcoded frontend literals bypass i18n entirely; or the sweeps file drifted stale after a base-locale copy update. Audit explicitly for non-locale translation gaps — missing player-facing translations in any supported locale are release blockers even if English renders perfectly. Prefer sparse sweeps files that inherit unchanged keys so base changes can't silently reintroduce banned words.",
    category: "Jurisdiction gating",
    kind: "pitfall",
  },
  {
    title: "Do I need compliant wording in every supported language, or just English?",
    body: "Every supported locale, in the general case: jurisdiction-safe wording must exist in each language the game ships, and mixed-language screens count as compliance failures because they make the restricted-wording audit incomplete. The specific stake.us carve-out is that social=true renders English with replacements regardless of lang, so the sweeps variant in practice concentrates on sweeps_en — but if your game lists es or pt as supported in social mode, those sweeps locales must be complete too, including config-driven content like gameInfoConfig and hardcoded UI strings. Never sign off a game as compliant while info modals or paytable copy remain untranslated for a listed locale.",
    category: "Jurisdiction gating",
    kind: "rule",
  },
  // ── Paytable and rules copy ─────────────────────────────────────────────
  {
    title: "What exactly must the rules/paytable modal contain for Stake Engine approval?",
    body: "The frontend requirements demand: a detailed description of all game rules reachable from the UI; the RTP of the game and of each mode if multiple modes exist; the maximum win amount for each mode, clearly displayed; payout amounts for all symbol combinations; every obtainable value for special symbols (cash prizes, multipliers); explicit trigger conditions for feature modes (e.g. \"3 Scatters award 10 free spins; 4 Scatters award 15 spins\"); and the cost of each mode plus what the purchase actually does. Also required: a short UI guide describing what each button does. Missing any item is an approval blocker — reviewers literally playtest the game against the rules text.",
    category: "Paytable and rules copy",
    kind: "rule",
  },
  {
    title: "Is a legal disclaimer mandatory in the game info popup?",
    body: "Yes — games submitted without a disclaimer in the rules/info popup do not pass Stake Engine approval. It must be reachable at all times during gameplay, typically via the i or ? button; it need not be on every screen. The disclaimer must cover seven points: malfunctions void all wins and plays; a consistent internet connection is required; on disconnection, reload the game to finish uncompleted rounds; the expected return is calculated over many plays; the display is illustrative and not representative of any physical device; winnings are settled from the Remote Game Server response, not from browser events; and a trademark/copyright notice. Custom wording is allowed if all seven points survive.",
    category: "Paytable and rules copy",
    kind: "rule",
  },
  {
    title: "Give me the exact approved disclaimer template text.",
    body: "The official Stake Engine template (safe to paste verbatim into your rules/info popup): \"Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser. TM and © 2025 Stake Engine.\" Update the copyright year/holder for your studio. For social mode, note this template already avoids restricted terms — don't introduce \"payout\" or \"bet\" when editing it.",
    category: "Paytable and rules copy",
    kind: "example",
  },
  {
    title: "What RTP range and math disclosures does Stake Engine accept?",
    body: "Calculated RTP must land within 90.0%–98.0%. For multi-mode games, every mode's RTP must sit within 0.5% of the others (a 97.0% base game means all modes between 96.5% and 97.5%). The maximum win must be realistically obtainable — typically more frequent than 1 in 10,000,000 depending on payout size — and must match what the rules promise per mode. Non-zero-win hit rate should be more frequent than 1 in 20 bets. Reviewers also check win-range continuity: no gaps where intermediate wins between small payouts and max win are unobtainable, and zero-weight or non-paying results must not dominate the simulation set (90,000 dead results in 100,000 sims is cited as rejection grounds).",
    category: "Paytable and rules copy",
    kind: "fact",
  },
  {
    title: "My rules text says one thing and the game does another — will reviewers catch it?",
    body: "Yes, and it's an explicit rejection path. The approval team playtests the game against its own rules: they verify payout combinations pay as documented, check that each mode's cost is correctly represented in the rules, and confirm the maximum win matches the rules description per mode. Common mismatches that get caught: rules describing an older paytable revision, feature-trigger counts changed in math but not in copy (\"3 Scatters award 10 spins\" when the build awards 8), and mode costs listed in base-game units while the UI shows a multiplier. Treat rules copy as part of the math change process — any paytable, trigger, or mode-cost edit must update the rules text in the same commit.",
    category: "Paytable and rules copy",
    kind: "pitfall",
  },
  // ── Responsible gambling ────────────────────────────────────────────────
  {
    title: "What responsible-gambling messaging does a social casino need?",
    body: "Even without real-money wagering, social casinos are expected to ship RG surfaces: a responsible-play page or modal linked from the game/lobby, self-exclusion and account-limit options, and neutral messaging that never encourages chasing losses. For stake.us wording specifically, RG terms are in the restricted table: \"loss limit\" → \"stop limit\" and \"loss streak\" → \"miss streak\" — so your limits UI needs the sweeps vocabulary too. Avoid copy that frames play as income (\"profit\" → \"net gain\") or that pressures continued play after losses. Requirements here drift by state and platform policy — as of early 2026, verify the operator's current RG page and link targets rather than inventing your own.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "What autoplay and session-control rules apply to slot submissions?",
    body: "Stake Engine frontend requirements: if an autoplay feature exists, the player must explicitly confirm the autoplay action — games are not allowed to place consecutive bets with one click and no confirmation. The spacebar must be mapped to the bet/play button (in sweeps wording, the play button). The UI must include an option to disable sounds. Balance must always be displayed, and final win amounts must be clearly shown for non-zero results — if a round contains multiple winning actions, the displayed amount must incrementally count up to the final payout multiplier. In social mode, autoplay settings panels must use stop limit / miss streak wording instead of loss limit / loss streak.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "What makes slot art 'appealing to minors' and get flagged?",
    body: "The cross-industry rule (regulators, app stores, and platform review teams all enforce a version of it): no content whose primary appeal is to children — cartoon mascots styled like kids' media, fairy-tale/toy aesthetics, childish characters on game tiles, splash screens, or promo art. Practical consequences for slot studios: mascot characters must read as adult-oriented (pirates, vampires, adventurers pass; nursery-style animals and Saturday-morning-cartoon styles get flagged), and the 18+/21+ age-gate presentation must be consistent with the art. There is no single statute to cite — enforcement is policy-driven and subjective — so when a theme is borderline, pre-clear the key art with the platform before building the symbol set around it.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "Which always-on UI elements does approval check regardless of game mode?",
    body: "The Stake Engine frontend checklist requires, for every game: current balance displayed at all times; the ability to change bet size, supporting every bet level returned in the RGS authenticate response; final win amounts clearly shown for non-zero results; a sound on/off control; spacebar mapped to the main bet/play button; a UI guide explaining button functions; mobile view support with all UI usable during screen scaling; and popout (mini-player) support without visible board distortion. Also checked: the network tab must show no errors and no game information being logged — strip debug logging of round data before submission. These apply identically to social and real-money builds.",
    category: "Responsible gambling",
    kind: "rule",
  },
  // ── Store and platform submissions ──────────────────────────────────────
  {
    title: "What must a Stake game tile NOT contain?",
    body: "Tiles are rejected for: wording or multipliers baked into the background or foreground imagery (text is a separate title layer added by the Tile Editor — \"2000x\" or the game name rendered into the art is an automatic reject); dark backgrounds or dark edges that blend into the Stake platform background — the background must be brighter than the site; and low-contrast, dull imagery. Positive requirements: bright, engaging background and foreground; the foreground character/symbol enlarged to fill as much of the key focus area as possible, aligned to the editor's red guideline box. This aligns with the broader industry rule: never bake promo text, multipliers, or wording into tile art.",
    category: "Store and platform submissions",
    kind: "rule",
  },
  {
    title: "How is a Stake Engine game tile actually composed and what are the text limits?",
    body: "Tiles are built in the dashboard Tile Editor from layers: a background image (high-res PNG/JPG, adjustable with a Lighten/Darken slider and brightness analysis warning), a foreground element (high-res PNG with transparency, drag-positioned and scaled), a gradient overlay, and a title text layer. Gradient rules: pick a prominent color already in the art, keep it light, and avoid bright yellows/greens/blues that kill text legibility. Text rules: title must fit within the height guide, fill as much of the text-box width as possible, and use a maximum of 2 text sizes (e.g. large game name, smaller subtitle). Provider logo is set once in Team Settings → Branding (PNG/JPG/GIF, up to 10 MB, square ratio recommended) and applied to all tiles automatically.",
    category: "Store and platform submissions",
    kind: "fact",
  },
  {
    title: "Do screenshots, splash art and in-game banners have their own compliance rules?",
    body: "Yes — the same restricted-terms audit applies to every static visual: screenshots, splash art, feature banners, and promo images must contain no prohibited gambling words for social mode and no misleading multipliers or claims. Separately, Stake Engine requires unique audio and visual assets: backgrounds, symbols, or animations shipped with the web-sdk sample games are explicitly not approved for publication — sample-game art is a known rejection trigger. Also verify asset delivery: all images and fonts must load from the Stake Engine CDN, with no hidden runtime dependency on an external CDN or your own server, because the build must be fully static.",
    category: "Store and platform submissions",
    kind: "rule",
  },
  {
    title: "What technical display requirements silently block game approval?",
    body: "Four recurring technical blockers from the frontend requirements: (1) popout/mini-player support — the game must render in Stake's small background modal without the board being visibly distorted; (2) mobile support on common devices with all UI functionality usable during screen scaling — test pinch/resize, not just one breakpoint; (3) fully static build shape — no hidden CDN or runtime dependency, all assets from the Stake Engine CDN; (4) a clean network tab — no console errors and no game information (round results, math data) logged. None of these appear in the wording checklist, so teams that only fix copy get bounced on a technical pass they never tested.",
    category: "Store and platform submissions",
    kind: "pitfall",
  },
  {
    title: "My game has a fastplay/turbo mode — what gets it rejected?",
    body: "The explicit fastplay rule: win amounts, winning symbol combinations, and pop-up information must remain legible to the player even at fastplay speed. Reviewers enable the mode and watch whether a human can still register what was won and why. Common failures: count-up animations skipped so wins flash for one frame, win-breakdown popups auto-dismissed, and symbol-highlight frames dropped at high speed. The safe pattern is to shorten tween durations but keep every information state — final win display, winning-line highlight, and any informational popup — on screen for a fixed minimum readable time, regardless of speed setting. Test fastplay together with autoplay, since players stack them.",
    category: "Store and platform submissions",
    kind: "pitfall",
  },
  {
    title: "What languages and currencies will the approval team test my game with?",
    body: "The frontend requirements state the game will be tested with various combinations of currencies and languages — not just your showcase locale. Practical consequences: number and currency formatting must come from the RGS-provided currency, every listed language must render fully (mixed-language screens are compliance failures), and layout must survive long translations (German rules text, ru UI labels) without clipping buttons or overflowing the paytable. The player must also be able to use all bet levels returned in the RGS authenticate response — if auth returns levels your UI can't select, that's a blocker. Run your own matrix pass over every locale × currency pair you claim to support before submitting.",
    category: "Store and platform submissions",
    kind: "fact",
  },
  {
    title: "What RTP and math disclosures does Stake Engine require for approval?",
    body: "The math requirements set the accepted RTP band at 90.0–98.0%, with at most 0.5% RTP variance between modes, and the max win must be genuinely obtainable (at least 1-in-10,000,000 probability in simulation). Disclosure obligations that submissions miss: (1) the RTP shown in the rules must match the certified math model exactly — not a marketing rounding; (2) if the game is configured with multiple RTP variants, ALL configured variants must be disclosed in the rules, not just the one you ship by default; (3) volatility and the max-win statement are separate mandatory disclosures — a volatility descriptor and the maximum win multiplier must appear alongside RTP, each as its own line, not buried in feature text. The examiner checks the rules modal against the math certificate line by line.",
    category: "Paytable and rules copy",
    kind: "rule",
  },
  {
    title: "The complete rules/paytable modal checklist — what reviewers tick off",
    body: "The modal must contain, as separately identifiable items: a full symbol paytable with every symbol's values at the current play level; complete rules for every feature and bonus (trigger conditions, retrigger rules, what carries over); RTP disclosure; a volatility disclosure as its own item — the most commonly missed element; a max-win / prize-cap statement as its own item; the malfunction-voids-plays clause ('malfunction voids all plays and pays' in money mode, sweeps-safe rewording in social mode); and the legal disclaimer block. Reviewers tick these off one by one, and 'the information exists somewhere in the game' does not count — it must be in the rules modal itself. Write the modal from this checklist, not from your game's feature list.",
    category: "Paytable and rules copy",
    kind: "rule",
  },
  {
    title: "How do I rewrite 'pays out 500x your bet' for sweeps mode?",
    body: "Approved rewrite: 'awards 500x your play amount' — or 'prize of 500x your play amount' when the context needs a noun. The transformation removes all three gambling markers (pays out → awards, bet → play amount) while keeping the multiplier factual and verifiable against the math model. The same pattern generalizes: 'pays 100 coins' → 'awards 100 coins'; 'win up to 5,000x your stake' → 'up to 5,000x your play amount in prizes'. What does NOT pass: keeping 'bet' anywhere ('awards 500x your bet'), substituting 'wager' (also restricted), or cash framing ('$500 prize' implies money value). The multiplier itself is fine — reviewers reject the money verbs around it, not the number.",
    category: "Prohibited terminology",
    kind: "example",
  },
  {
    title: "Which exact messages get a submission rejected outright?",
    body: "The hard-fail copy list — any one of these, anywhere in game text, tiles, or store copy, is an instant rejection: 'win real money' or any cash-out framing; 'guaranteed win' / 'guaranteed prize'; 'risk-free'; 'deposit' / 'withdraw' / 'cash out' (money-movement verbs); 'jackpot' in social mode (use 'top prize' / 'grand prize'); odds or RTP claims framed as profit expectation ('96% RTP means you win back $96'); any implication that Gold Coins have cash value or can be redeemed; and the absence of 'no purchase necessary' where sweeps prizes are promoted. The trap: these hide in inherited marketing copy and banner art text, not just the rules modal. Run the phrase list over every string file and every image before submitting.",
    category: "Prohibited terminology",
    kind: "pitfall",
  },
  {
    title: "What autoplay and session-control rules apply to slot submissions?",
    body: "Autoplay must be a bounded, user-controlled session, not an infinite one: (1) the player must choose a finite spin count — open-ended 'spin forever' autoplay is rejected; (2) user-set stop conditions must be offered — a loss limit and a single-win limit at minimum; (3) autoplay must stop on feature/bonus triggers and on balance depletion, not plow through them; (4) it must be cancellable by the player at any time with one tap; (5) it must never be default-on — the first state of the game is manual play. Session controls that must exist alongside: access to self-exclusion and limit-setting from within the game or one click away, and a visible session clock or session info. Reviewers test this by enabling autoplay with default settings and checking it cannot run unbounded.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "What always-on UI and responsible-gambling elements must stay visible in every mode?",
    body: "Regardless of turbo, fastplay, or autoplay state, these must remain on screen and legible: the player's current balance, the current play amount, the last win/prize display, and clock or session information. Speed modes that hide or collapse any of these are rejected — this is the specific failure behind most turbo rejections. Separately, the responsible-gambling layer: a play-responsibly link or footer visible from the main game screen, access to self-exclusion and session/limit settings, and a helpline reference for money-mode deployments. The audit pattern: put the game in its fastest mode, let autoplay run, and screenshot — if balance, play amount, win display, or session info is missing, dimmed, or scrolled away, that screen fails.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "What must a game tile NOT contain, and what are the text constraints?",
    body: "Prohibited on tiles: baked-in wording, multipliers, or prize claims ('WIN 10,000x!', jackpot badges); RTP figures or win amounts anywhere in the art; misleading badges ('HOT', 'NEW' baked into art when not platform-applied); and any restricted-term vocabulary for social mode. Composition constraints: Stake's builder composites the gradient and title itself — your foreground art must be transparent-background with no text baked in, the title must fit the height guide, fill the text-box width, and use at most 2 text sizes (large game name, smaller subtitle). Keep the actual title short — the builder truncates long titles on small tiles, and a truncated title fails the tile check. Background must be bright enough for overlay text legibility, avoiding saturated yellows/greens/blues behind text.",
    category: "Store and platform submissions",
    kind: "rule",
  },
  {
    title: "Turbo/fastplay speed limits and defaults — the settings that get rejected",
    body: "Three turbo rules beyond legibility: (1) spins must not be shortened below the platform's minimum play duration — an 'instant result' mode that skips the spin entirely fails, because the round presentation is part of the required experience; (2) turbo must not be default-on — the player opts into speed, the game never starts fast; (3) turbo must not auto-chain with autoplay in a way that removes every stop point — the combination still has to respect autoplay's stop conditions (feature triggers, limits) rather than blasting through a hundred instant rounds. Test the worst case: turbo ON + autoplay ON + default settings, and verify balance, play amount, win display, and session info stay visible and every stop condition still fires.",
    category: "Store and platform submissions",
    kind: "rule",
  },
  {
    title: "What age gate does a social casino need, and is 18+ always sufficient?",
    body: "18+ is the standard sweepstakes-casino gate, but not universally sufficient: Nebraska's age of majority is 19, and Alabama has its own quirks — platforms serving those states gate at 19+ there (as of early 2026; age-of-majority rules drift, verify per jurisdiction). The mechanics matter as much as the number: the gate must be enforced at signup BEFORE any game access — a birthday field after the lobby loads fails — must verify legal adult age before presenting any casino-mode screen, and must be combined with self-attestation plus geo signals, not just an honor checkbox. Reviewers test by entering an under-age birthdate and checking they can still reach a game. Keep the per-state age table in configuration, because a hardcoded 18 breaks the first time counsel updates the list.",
    category: "Jurisdiction gating",
    kind: "rule",
  },
  {
    title: "Which US states must a sweepstakes casino block, and is geo-IP alone enough?",
    body: "The commonly excluded set as of early 2026: Washington and Idaho (sweepstakes-hostile statutes), Nevada and Michigan (regulator pressure), Kentucky, New York, Vermont — and increasingly Louisiana, Mississippi, and Missouri, which moved against sweepstakes casinos in 2025. Treat this list as configuration owned by counsel, re-verified every release — it changes quarterly. Enforcement: geo-IP is necessary but NOT sufficient alone. The required stack is geo-IP lookup at signup and purchase, plus user self-attestation of state of residence, plus age verification — and purchase flows must re-check, because a player who registered in a permitted state and travels must not be able to buy from a blocked one. VPNs are the known bypass; platforms log and act on mismatch signals rather than claiming to defeat VPNs.",
    category: "Jurisdiction gating",
    kind: "fact",
  },
  {
    title: "What responsible-gambling messaging must a social casino show users?",
    body: "The required messaging set: (1) a plain statement that Gold Coins / virtual currency has NO cash value and cannot be redeemed — this is the line that separates social casino from gambling, and its absence is a hard fail; (2) the AMOE disclosure (alternate method of entry — free entry without purchase) wherever sweeps prizes are promoted; (3) links to responsible-gaming resources; (4) a visible self-exclusion path; (5) session warnings — time and loss-limit prompts during long sessions. Placement: the no-cash-value and AMOE statements belong on the promo surfaces and purchase flow themselves, not only in T&Cs. The audit: open the purchase screen and the main lobby — if neither states 'no cash value' and 'no purchase necessary', the submission fails on copy alone.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "The always-on UI list — every element that must survive turbo and autoplay",
    body: "Complete list of elements that must remain visible in EVERY mode: current balance, current play amount, last win/prize display, session clock or session-time information, a paused-autoplay indicator whenever autoplay is halted (the player must see WHY spinning stopped — limit hit vs feature trigger), and the responsible-gambling warning banner whenever a session limit triggers it. Plus one-tap access to the settings button for session limits and self-exclusion. Turbo and autoplay may rearrange layout but may not hide, collapse, or auto-dismiss any of these. Reviewers enable turbo+autoplay, trigger a stop condition, and screenshot: if the pause reason or any of the six elements is missing from that frame, the build fails.",
    category: "Responsible gambling",
    kind: "rule",
  },
  {
    title: "Turbo speed: the minimum spin duration that gets games rejected",
    body: "Platforms enforce a minimum play duration per round — commonly around 0.5 seconds per spin as of early 2026 (verify the current value in the platform's frontend requirements; it has tightened over time). Turbo modes that complete a round faster than the minimum are rejected, as is any 'instant result' setting that skips the spin presentation entirely. Related rules that compound with speed: turbo must default OFF (player opts in), there must always be a visible toggle back to standard speed, and turbo must not strip the win presentation — final win display and winning-combination highlight stay on screen for a fixed readable minimum regardless of speed. Stores and platforms treat predatory speed as a dark pattern: the reviewer test is one hand on turbo, one on autoplay, watching whether a human can still register each outcome.",
    category: "Store and platform submissions",
    kind: "rule",
  },
  {
    title: "Tile text limits and what tiles must not contain — the complete list",
    body: "Stake's docs specify composition, not fixed character counts: the constraint is the title height guide, maximum 2 text sizes, and title filling the text-box width — in practice keep the game name under ~20 characters so the builder doesn't truncate on small tiles (verify per current tile spec). The prohibited list: baked-in wording or multipliers; prize/jackpot claims and RTP figures; misleading badges; restricted gambling terms; AND three more reviewers check — nothing appealing to minors (cartoon mascots in toy-like styles, candy-bright palettes aimed at kids), no third-party brand assets or lookalikes (trademark infringement is an instant bounce), and no fake social proof (invented review quotes, player counts). The tile is re-reviewed on every game update, not just first submission — a tile that passed last quarter can fail today under tightened art rules.",
    category: "Store and platform submissions",
    kind: "rule",
  },
  {
    title: "Can I use 'payout' in Gold Coins mode — and what are the approved alternatives?",
    body: "No. 'Payout' implies real-money gambling winnings even in Gold Coins mode — it's on the restricted list in every social-mode context. Approved replacements: 'award' ('awards 500x your play amount'), 'earn' ('earn up to 1,000 coins'), 'accumulate' for progressive language, and currency-specific framing like 'Gold Coin total' or 'coin balance'. Same family of banned money verbs: 'pays out', 'cash prize', 'winnings' (use 'prize' or 'win total'), 'withdraw' (use 'redeem' only for sweeps prizes with the required disclosures). The pattern to teach your copywriter: Gold Coins are won and lost, never paid — the moment a sentence describes money moving TO the player, it's gambling copy.",
    category: "Prohibited terminology",
    kind: "example",
  },
  {
    title: "Where must the 'no purchase necessary' disclosure appear?",
    body: "Three mandatory placements, all of them prominent: (1) at game start or on the first promo surface the player sees — the disclosure must precede the first sweeps-prize claim, not follow it; (2) inside the rules/terms modal, adjacent to the prize rules themselves; (3) immediately before any payment option — the purchase screen must show it at the point of decision. A footer-only disclosure fails: buried-in-footer is the canonical sweepstakes-law violation pattern, and reviewers specifically check that the statement appears in the purchase flow, not just the page chrome. Pair it with the AMOE (free entry method) disclosure in the same spots — 'no purchase necessary' without a stated free entry path is considered empty. Font must be legible at normal reading distance; 6px grey-on-grey disclosure text counts as absent.",
    category: "Sweepstakes model rules",
    kind: "rule",
  },
];
