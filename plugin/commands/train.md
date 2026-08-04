---
description: Train a brain locally — your session reads the material, the server only stores notes
argument-hint: <brain handle> <files, folder or url>
---

Local training: YOU read the material in this session and save finished notes
with `brain_write` — the server's paid extraction never runs. Use this when
the user wants to spend subscription time instead of API tokens, or when the
material is private and must not be uploaded raw.

`$1` is the brain handle (check `brain_list`; create with `brain_create` if
the user asks). Everything after it names the material: local files, a
folder, or a URL you can fetch.

For each document:

1. Read it fully. For folders, walk the obviously-documentation files
   (md, mdx, txt, rst) and skip generated or vendored code.
2. Distil it into self-contained notes, the way the brain's own extractor
   would: one fact per note, a searchable title, the body in full sentences
   that stand alone. Keep parameter tables **verbatim, row by row**, and keep
   working code examples whole as `example` notes. Concrete values beat
   descriptions.
3. Save each note with `brain_write` (title, body, kind, category — reuse the
   brain's existing categories from `brain_brief`). If a write is refused as
   a duplicate, follow the tool's advice instead of retrying the same text.
4. Never write credentials or personal data; the server scans, but the scan
   is a backstop, not permission.

Pace yourself: batch related facts into single substantial notes rather than
fifty one-liners. When done, report: how many notes, into which categories,
and remind the user that agent-written notes wait for review on the brain
page (unless review is off) and the exam re-runs on its own.
