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
summaries, and the **known gaps**. Everything you write must either close a
gap or deepen a category the goal cares about — a fact the brain already
holds, or that the goal doesn't need, is a wasted note.

## 2. Survey before you read

Map the corpus before opening anything: walk the folder tree, fetch the
table of contents or sitemap, list what exists. Then say out loud what you
will cover and in what order — the plan should trace back to the gaps from
phase 1, high-value areas first. Skip generated, vendored, and changelog
material on sight. For a huge corpus, propose the cut to the user instead of
silently reading a tenth of it.

## 3. Study deeply

Read each chosen document fully — skimmed notes fail exams. Distil the way
the brain's own extractor would: one fact per note, a searchable title, the
body in full sentences that stand alone without the source. Keep parameter
tables **verbatim, row by row**; keep working code examples whole as
`example` notes; concrete values beat descriptions. Batch related facts into
single substantial notes rather than fifty one-liners.

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

Close with an honest report: what was covered, how many notes landed in
which categories, which known gaps they close, and — just as important —
what the material did **not** answer. If the gaps that remain live in the
user's head rather than in any document, suggest `/mozg:teach`.

Notes into the user's own brain are searchable at once; notes into a brain
shared with you wait for the owner's review when that brain requires it.
The exam re-runs on its own either way.
