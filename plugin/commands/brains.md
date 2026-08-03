---
description: List the mozg brains this agent can read, and what each is for
---

Call `brain_list` and show the result as it comes back, including the family
structure — a parent covers its children, and the reader needs to know that to
choose what to ask.

Then, in one line each, say:

- which brain looks right for what the user is currently working on, and why
- what to say to use it (`use <handle>`), or that they can just ask normally
  and you will search on your own

If the list is empty, say so plainly and give both ways to fill it: add a brain
from the catalogue at https://mozg.sh/explore, or create one from here with
`brain_create` and feed it with `brain_add_source`.

Do not search any brain as part of this command. This is a map, not a lookup.
