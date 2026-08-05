---
description: Write this account's brains into the project, so every session starts knowing them
---

The shelf lives on the server; this command leaves a copy of it in the project,
so the next session knows which brains exist before it spends a call finding out
— and so the session-start hook can name them offline.

## 1. Read the shelf

Call `brain_list`. That is the authority: your own brains, brains shared with
you, and everything you added from the catalogue, with each one's goal, note
count and exam score.

## 2. Write `.mozg/brains.md`

Create the directory if it is missing and write the file with exactly this
shape — one brain per line, families indented under their parent:

```markdown
# mozg brains available in this project
<!-- Written by /mozg:sync. Re-run it after adding or removing a brain. -->
Synced: 2026-08-05

- mozg/nextjs — Next.js (trained 78%, 374 notes)
  Answer questions about the App Router, rendering and configuration as documented today.
  - mozg/nextjs-api — Next.js · Config & API (trained 72%)
  - mozg/nextjs-app — Next.js · App Router (trained 81%)
- mozg/tailwind-v4 — Tailwind CSS v4 (trained 88%, 512 notes)
  Answer questions about the v4 engine, CSS-first config and the utilities as they exist now.
```

Rules for the file:

- Goals go on their own line, trimmed to one sentence. This file is read by an
  agent choosing where to look, not by someone browsing.
- Keep the scores. A brain at 45% and a brain at 90% deserve different trust,
  and the number is the only honest signal of that.
- Do not copy notes into it. This is a map; the brain is the territory, and a
  copy would be stale the moment a source changes.

## 3. Make the project import it

If `CLAUDE.md` exists and does not already mention `.mozg/brains.md`, append:

```markdown
## Knowledge brains

@.mozg/brains.md — search these over MCP before answering from memory. Their
material is dated and exam-scored; your training data is neither.
```

If there is no `CLAUDE.md`, say so and offer to create one with just that
section — do not create it silently, because that file is the user's voice to
every agent, not ours.

## 4. Report

Say what changed since the last sync: brains added, removed, scores that moved.
If nothing changed, say that in one line. If the shelf is empty, point at
`/mozg:add` and https://mozg.sh/explore.

Never edit `.mozg/brains.md` by hand in later turns — re-run this command
instead, or the file starts lying about what the server holds.
