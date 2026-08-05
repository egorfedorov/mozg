---
description: Bring a brain up to date with its sources, and refresh the local map
argument-hint: [brain handle, or nothing for the whole shelf]
---

Two different things get called "update", so do both and say which is which:
the brain against its sources on the server, and this project's local map
against the shelf.

## 1. The brain against its sources

For each brain named in `$ARGUMENTS` — or, with no argument, each brain in
`brain_list` that **you own** — call `brain_refresh`.

It fetches every page the brain was built from and compares fingerprints. An
unchanged page costs nothing; a changed one is re-read and the notes it used to
produce are superseded rather than deleted, so the old wording stays auditable.
Crawled sites are re-walked for pages that did not exist last time. The work is
queued, so the reply tells you what started, not what finished.

Only your own brains. A brain someone else maintains is theirs to re-read —
`brain_refresh` will say so, and the honest answer to the user is that the
catalogue keeps itself current and they can check the score on the brain's page.

## 2. The local map

Run the `/mozg:sync` steps: rewrite `.mozg/brains.md`, note where local skills
overlap, and keep `CLAUDE.md` importing it. A refresh that changed nothing still
moves scores, and the map carries scores.

## 3. Report

Per brain, one line: how many pages are being checked, whether any site is being
re-walked, and that the exam re-sits itself afterwards. Then say plainly that
nothing is done yet — the numbers land in minutes, and the brain's page is where
they show.

If the user wanted the *contents* changed rather than re-read — a new subject, a
private convention, a page the docs do not cover — this is the wrong command:
`/mozg:train` teaches from material you point at, `/mozg:teach` interviews the
user, and `brain_add_source` hands the server a URL to read on its own.
