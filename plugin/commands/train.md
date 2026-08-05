---
description: Train a brain locally — an agentic study session, the server only stores notes
argument-hint: <brain handle> <files, folder or url>
---

Local training: YOU study the material in this session and save finished
notes — the server's paid extraction never runs. Use this when the user wants
to spend subscription time instead of API tokens, or when the material is
private and must not be uploaded raw.

`$1` is the brain handle (check `brain_list`; create with `brain_create` if
the user asks). Everything after it names the material: local files, a
folder, or a URL you can fetch.

This is a study session, not a copy job. Work in five phases:

## 1. Orient in the brain

Call `brain_brief` on `$1`. Read the goal, the existing categories, the
summaries, the **known gaps** and the **already-read list**. Everything you write
must either close a gap or deepen a category the goal cares about — a fact the
brain already holds, or that the goal doesn't need, is a wasted note.

The already-read list is the one that saves your tokens: those pages are in the
brain. Reading them again costs a full study pass and produces notes the server
will reject as duplicates — the deduplication protects the brain, not the hours
you spent getting there. Cross them off the corpus before phase 2.

## 2. Survey before you read

Map the corpus before opening anything: walk the folder tree, fetch the
table of contents or sitemap, list what exists. Then say out loud what you
will cover and in what order — the plan should trace back to the gaps from
phase 1, high-value areas first. Skip generated, vendored, and changelog
material on sight. For a huge corpus, propose the cut to the user instead of
silently reading a tenth of it.

## 3. Study deeply, in slices

Read each chosen document fully — skimmed notes fail exams. Distil the way
the brain's own extractor would: one fact per note, a searchable title, the
body in full sentences that stand alone without the source. Keep parameter
tables **verbatim, row by row**; keep working code examples whole as
`example` notes; concrete values beat descriptions. Batch related facts into
single substantial notes rather than fifty one-liners.

Work in slices of roughly five documents, and finish each slice — reconcile,
upload, report — before opening the next. Two reasons, both about tokens. A
session that reads eighty files before writing anything spends its context on
material it then summarises badly, and if it runs out, everything read so far is
lost and has to be read again. Uploading as you go also means the next slice can
see what already landed.

Never re-read a document to check what you wrote about it. If you need to know
whether a fact is in the brain, `brain_search` — that costs one call against
notes rather than a second pass over the source.

## 4. Reconcile with what the brain knows

Before saving a cluster of notes, `brain_search` the brain for its key
claims. If the brain already holds the fact, skip it. If it holds a *stale
or contradicting* version, write the new one so the difference is explicit —
that is the note the exam needs. Never write credentials or personal data;
the server scans, but the scan is a backstop, not permission.

## 5. Upload and account

Save with `brain_write_batch` — up to 25 notes per call, each with title,
body, kind, category (reuse the brain's existing categories). One rejected
note does not lose the rest: read the per-note results and redo only the
failures. Use `brain_write` for a single stray note. If a note is refused as
a duplicate, follow the tool's advice instead of retrying the same text.

Stop when the gaps are closed, not when the corpus ends. If the remaining
material only deepens what the brain already answers well, say so and stop —
the exam is the judge of enough, and a thousand redundant notes make retrieval
worse, not better.

Close with an honest report: what was covered, how many notes landed in
which categories, which known gaps they close, and — just as important —
what the material did **not** answer. If the gaps that remain live in the
user's head rather than in any document, suggest `/mozg:teach`.

Notes into the user's own brain are searchable at once; notes into a brain
shared with you wait for the owner's review when that brain requires it.
The exam re-runs on its own either way.
