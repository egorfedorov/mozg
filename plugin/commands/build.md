---
description: Build something by following a mozg workflow — the route through the brains, step by step
argument-hint: <workflow name, or nothing to pick one>
---

A workflow is a named route through the brains: the steps for a whole job,
each naming the brain to read, what to ask it, and the check that ends the
step. You execute it. The server only stores the route.

## 1. Get the route

If `$1` names a workflow, call `workflow_read` with it. Otherwise call
`workflow_list`, and pick the one whose summary matches what the user asked
for — if none does, say so and offer to work without one rather than forcing
the closest match. Show the user which workflow you picked and its steps
before you start, so a wrong pick costs a sentence and not an afternoon.

## 2. Check the shelf before doing any work

`workflow_read` ends with a **Before you start** block naming which of the
route's brains you can actually read. Act on it first:

- Everything present: say so in one line and begin.
- Something missing or locked: **tell the user before you build anything** —
  name each brain, what it costs, and which step it was for. A route run
  without its material still produces files, and they look exactly like the
  ones built with it; that is precisely why this is said up front rather than
  discovered at step nine.
- If the user wants to proceed anyway, that is their call. Then say at each
  affected step that it ran on your own knowledge, and repeat it in the final
  report. Never let a guess wear this route's authority.

## 3. Work the steps in order

For each step:

- Where the step names a brain, `brain_search` it **before writing anything**.
  That material is newer than your training data and is what the workflow was
  built around — the ask on the step is phrased in the brain's own words, so
  use it as your query.
- If the brain returns nothing, say so out loud and keep going on your own
  knowledge. A silent guess in a step that was supposed to be grounded is the
  one failure mode this whole command exists to avoid.
- Do the work of the step: write the files, run the command, generate the
  asset. This is a build, not a plan — the user wants the thing.
- Run the step's own check (`done when`) before moving on. A failing check is
  a reason to go back a step, not a note to carry forward.

Steps with no brain are ordinary work: run the build, show the result, wait
for the user.

## 4. Report

One line per step: what the brain gave you that changed what you did, and
whether the check passed. Then the state of the whole thing — what exists now,
what is left, and what the user should look at.

## 5. Send the report back

Call `workflow_report` once, at the end, run succeeded or not: one entry per
step you attempted, with `found` (did its brain have material), `passed` (did
its check pass) and one line when something tripped. This is the only signal a
route has — its author otherwise never learns which step sent you looking
elsewhere. Do not skip it because the run went well; "every step found what it
needed" is the result that tells an author to leave the route alone.

## 6. Leave the route better than you found it

Two things are worth sending back, and both are cheap:

- A step whose brain had nothing for it is a **gap**: `brain_write` the answer
  you ended up using, in that brain, if you worked it out reliably. On brains
  you only read this becomes a proposal for the owner — still worth sending.
- If the route itself was wrong — a step in the wrong place, a missing check,
  a brain that should have been consulted and was not — tell the user in one
  line. They own the workflow and can fix it at mozg.sh/workflows; you cannot
  edit it from here.

Never invent a workflow and pretend it came from the server. If there is no
route for what the user wants, build without one and offer to save the route
afterwards.
