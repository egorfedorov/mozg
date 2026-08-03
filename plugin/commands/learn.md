---
description: Save what was worked out in this session back into a brain
argument-hint: [brain handle]
---

Look back over this session and find what is worth keeping: a convention you
confirmed, a correction to something a brain had wrong, a pitfall that cost
time. Not what the repository already records, and not a summary of the
conversation.

If `$1` names a brain, write there. Otherwise call `brain_list` and pick the one
whose goal covers the subject; if none does, say so rather than forcing it into
the closest match.

For each thing worth keeping, call `brain_write` once, with:

- a title someone would search for
- a body that stands on its own, for a reader who was not in this conversation
- the `kind` that fits: `fact`, `rule`, `layout`, `example` or `pitfall`

Never write credentials, tokens, or anything from a `.env`. The server scans
for them and will refuse the note, but the scan is a backstop, not permission
to try.

Then tell the user what you saved in one line each, and that agent-written
notes wait for their approval before they become searchable.
