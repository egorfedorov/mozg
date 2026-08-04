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

Style: the codebase favours deletion over addition, comments that state
constraints rather than narrate code, and the smallest working diff. Read a
few files before writing — the pattern you need probably exists.

By contributing you agree your work is licensed under AGPL-3.0.
