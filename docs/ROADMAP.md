# Roadmap

What is shipped, and what the rest of 2026 goes on. Business planning and
launch copy live in the product itself (`/admin/marketing`), not in the
repository.

The dates below are a commitment to **sequence**, not to calendar days: one
maintainer plus agents, three items a month, and each month has a gate that
must hold before the next one starts. When something slips, it slips into the
next month rather than shrinking to fit.

## Shipped

- **Crawl → notes → exam.** One docs URL becomes a searchable brain; the goal
  becomes ~30 control questions re-sat after every ingest. Anti-bluff
  questions verify the brain refuses what it does not know.
- **The collective mind.** Zero-hit searches become exam questions; agent
  corrections become owner-reviewed notes; superseded notes are kept, and the
  diff between sittings is public.
- **MCP surface.** Eight tools, bearer tokens and OAuth (discovery, dynamic
  registration) side by side. Teaser access to paid brains. Listed in the
  official MCP Registry as `sh.mozg/mozg` since 5 August — see
  [REGISTRY.md](REGISTRY.md).
- **learn.** Any brain as a spaced-repetition course: compiled lessons,
  read → recall → quiz, streaks, certificates, a scoreboard against the
  brain's own exam score.
- **Bring your own key.** Anthropic or any OpenAI-compatible provider
  (OpenAI, Kimi, DeepSeek, Qwen, GLM); training then runs on the user's spend
  and platform caps step aside.
- **Money in.** Crypto top-ups credit a ledger; plans and per-brain purchases
  spend from it; every model call that has no row of its own lands in the
  spend ledger, BYOK excluded.
- **Safety.** Secret, PII and prompt-injection scanning at ingest and again
  at publication; third-party notes framed as data for reading agents; AI
  training crawlers refused.

## August 5–31 — the money path, and the front door

The mechanism works and nobody can find it. Two of these are distribution;
the third is the one thing that stops a willing buyer today.

- **Card checkout.** Only crypto credits a balance, so a plan is unbuyable
  for most of the people who want one. A card rail (Paddle or Stripe —
  whichever handles EU VAT without us becoming a tax department) must land on
  the *same* ledger row crypto already writes, so purchases, refunds and the
  spend ledger stay one story.
  *Done when:* a real card charge and its refund both show in
  `/settings/balance` and in `/admin`, and no code path knows which rail paid.
- **Per-CLI packs.** `/connect` has the AGENTS.md snippet; Codex, Cursor,
  Kimi CLI and Qwen Code each want a config folder instead. Ready-made
  directories turn connecting into a copy, and the MCP Registry listing turns
  it into a search.
  *Done when:* each supported CLI has a folder a user drops in unedited, and
  `scripts/check-mcp.ts` exercises the shape it advertises.
- **Staleness, visible.** A brain that has not re-read its source since the
  library shipped two majors is worse than useless: it is confident. Watch
  each source's upstream signal (releases, tags, sitemap `lastmod`) and show
  the lag on the brain page and in `brain_list`, next to the exam score.
  *Done when:* an agent calling `brain_list` can tell a fresh brain from a
  stale one without asking a human.

*Gate:* one paid plan bought with a card by someone who is not us.

## September — freshness that does not cost a re-crawl

Staleness measured in August has to be fixable in September, or the number
just becomes an apology.

- **Delta ingest.** Re-reading only what changed needs a note↔section map
  that does not exist yet; that map is the month's real work. Without it,
  every upstream typo costs a full pack.
  *Done when:* a docs site that changed one page re-extracts one page, and
  the exam re-sits only the questions whose notes moved.
- **Batch API for nightly work.** Re-reads, consolidation and re-sits are not
  urgent, and the batch endpoint halves their cost. This is what makes daily
  freshness affordable rather than aspirational.
  *Done when:* the nightly job runs on batch and the spend ledger shows the
  drop.
- **Gaps the exam can actually see.** `gap_suggestions` only fires when a check
  fails with *zero* retrieval hits, which was common while retrieval was
  degraded and is rare now that it works: the honest failure is "the note was
  found and did not answer", and that files nothing, so the owner learns
  nothing. Roughly a third of checks fail this way. The suggestion needs to
  carry which kind of gap it is — absent material, a note too thin to answer,
  or an answer that ranked below something adjacent — because the three have
  different fixes and only one of them is "add a source".
  *Done when:* every failed check leaves an actionable row, and the brain page
  says which of the three it is.
- **The public benchmark.** The exam already measures what a brain knows;
  point it at a stock model and it measures what the model *doesn't*. One
  page per catalogue brain: model from memory vs the same model with the
  brain, same questions, dated. It is the honest version of a marketing
  claim, and it is the mechanism we already have.
  *Done when:* `/vs` links a dated, reproducible score table for the ten
  largest catalogue brains.

*Gate:* the whole catalogue re-reads nightly for less than a plan's monthly price.

## October — teams

The `team` tier promises 100 brains and there is no way to share one. Every
seat sold today is a personal account with extra quota.

- **Orgs, seats, invites.** An owner invites by email; brains, quotas and the
  spend ledger belong to the org, not the inviter; each member gets their own
  MCP token so revoking one person does not break everyone.
  *Done when:* removing a member kills only their token, and the org's brains
  survive the founder leaving.
- **Private sources.** The enterprise unlock is ingesting docs that need
  credentials — private GitHub repos first, since the crawler already speaks
  git trees. Credentials are per-org, encrypted, and never reach a note.
  *Done when:* a private repo becomes a brain that only that org can search,
  and the secret scanner runs on it twice like everything else.
- **Provenance for teams.** Who taught what, whose correction was approved,
  which note answered an agent last week. The data is already in the tables;
  it needs a page.
  *Done when:* an org owner can answer "where did this note come from" in two
  clicks.

*Gate:* one org with three real seats using shared brains for a fortnight.

## November — learn stops being a bonus

Humans are the second audience and the cheaper one to grow: a lesson costs
nothing to serve once compiled.

- **Audio lessons.** Text-to-speech over compiled lessons, cached as files.
  A commute is the slot spaced repetition actually fits.
  *Done when:* a lesson plays end to end offline after one visit.
- **Marketplace, self-serve.** Payout details and purchases exist; the loop
  between them is manual. An outside author should publish a paid brain,
  watch its exam score, and get paid without us touching a row.
  *Done when:* an author we have never met ships a paid brain and receives a
  payout.
- **Certificates worth showing.** The `/b/.../badge` endpoint exists; a
  certificate should link to a page that proves the sitting happened and what
  the brain scored the day it was earned.
  *Done when:* a certificate URL survives the brain being retrained.

*Gate:* a learn sitting finished on a phone, on a train, with the screen off.

## December — harden, then stop

Nothing new in the last two weeks of the year. What breaks over the holidays
is what nobody was awake for.

- **The embedder bottleneck.** Four workers feeding one embedder pegged at
  1300% CPU is what took the site "down" five times in one evening; autoscale
  now caps at two workers, which is a ceiling, not a fix. Either batch the
  embedding calls, quantise the model, or run a second embedder behind a
  trivial balancer.
  *Done when:* eight workers ingest concurrently and `/api/health` stays
  green.
- **Ceilings people can set themselves.** The spend ledger measures; it does
  not stop. Per-brain and per-org caps, refused before the call rather than
  reported after it.
  *Done when:* a runaway pack stops itself and says which cap it hit.
- **The year in diffs.** Re-sit every catalogue brain and publish what the
  documentation changed in 2026 — the diff is already kept, so this is a
  reading of data we have, not new machinery.
  *Done when:* one public page, one date, no hand-written claims.

*Gate:* no schema change after 20 December; fixes only.

## Non-goals

- A hosted vector database. Retrieval is an implementation detail here.
- A chat UI. Agents are the interface; `learn` is the human one.
- Sitting between you and your model. Everything exports; keys are yours.
- Growth that outruns measurement. A brain nobody can score is a context
  file with a database bill.
