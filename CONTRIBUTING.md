# Contributing

mozg is a young open-core project run by a tiny team that ships daily. The
best contributions right now, in order:

1. **Bug reports with reproduction.** Use the in-product chat
   (mozg.sh/chat) or a GitHub issue — what happened, where, what you
   expected.
2. **"The brain got this wrong" reports.** Every note has a feedback tool
   (`brain_feedback` over MCP) — that report reaches the owner's review
   queue and is exactly how brains improve.
3. **Pull requests.** Keep them small and single-purpose. Run
   `npm run typecheck && npm test` before opening — CI runs the same. New
   non-trivial logic brings one test that fails if the logic breaks.
4. **New catalogue packs.** A pack is a data entry in
   `scripts/catalogue.ts` (repo, prefix, family split). Pick documentation
   that moves faster than model training cutoffs.

**A page ships translated or it does not ship.** Every sentence a reader sees
goes through `t()`, and the eleven languages are generated, not hand-kept:

```
npm run check:i18n              # fails on any bare sentence — CI and the deploy run it
npm run i18n:wrap -- <file> --write
npm run translate -- --all      # writes the eleven locales for what changed
```

A page merged without that step prints English to everyone who does not read
it, and nobody notices because it looks fine to whoever wrote it. The check
exists because a sweep had already been run over the same files twice.

**Before a risky migration, bring staging up.** `docker-compose.staging.yml`
is an overlay on the production compose — same images, its own database, port
3301 — so a schema change can be run against throwaway data first:

```
docker compose -p mozg-staging \
  -f docker-compose.prod.yml -f docker-compose.staging.yml up -d
npm run smoke -- http://localhost:3301
```

Opt-in rather than always on, because it is a second Postgres and a second app
on the same box. Bring it up, prove the deploy, take it down.

Style: the codebase favours deletion over addition, comments that state
constraints rather than narrate code, and the smallest working diff. Read a
few files before writing — the pattern you need probably exists.

By contributing you agree your work is licensed under AGPL-3.0.
