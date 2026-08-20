---
description: Plan and generate a game's art on gen.mozg.sh — ask first, price it, then spend
---

Generate slot art through gen.mozg.sh, in this terminal.

The point of doing it here rather than in the browser is that you already know
what the game is. Do not start by asking for a prompt — you have the repository,
the theme, and probably the paytable in front of you. Read them first, propose
the set, and let the user correct you.

## 1. Find out what is being made

If the user already named the game and its world, you have step 1. Otherwise
ask — but ask like somebody who has looked:

- what the game is called
- its world in a sentence or two: the place, the light, the materials, painted
  or rendered
- the palette, if they have decided one — hexes are better than adjectives
- whether they want the whole set or only some of it

If there is art in the repository already, say what you can see and offer to
match it rather than asking them to describe what is on their own disk.

## 2. Plan it — this is free

```
gen_project {"title": "…", "style": "…", "palette": "…"}
```

That creates the project and fills it with the usual slot set: the value ladder
(four lows, two mids, a premium, a character, wild, scatter, bonus), a
background, a reel frame and a lobby tile.

Read it back and **show the user the list before anything is bought**:

```
gen_project {"id": "…"}
```

The labels are a value ladder, not card ranks — `low-1` is cheap because a cheap
symbol has to look cheap next to the premium, which is what stops a paytable
reading upside down. The cabinet shows `low-3 · reads as J`; say it that way if
the user talks in ranks.

## 3. Change what they care about — still free

```
gen_plan {"project": "…", "label": "premium", "spec": "a gilded ibis head in profile, lapis inlay in the eye"}
gen_plan {"project": "…", "label": "low-1", "spec": ""}
gen_plan {"project": "…", "label": "bonus", "remove": true}
```

An empty `spec` is a real answer, not a blank: that asset is then drawn from the
game's world alone. Most sets should leave most symbols empty — the world is
already the instruction, and over-describing eleven symbols is how a set stops
looking like one game.

## 4. Price it, then ask

`gen_project` prints what the planned set costs and the user's balance. **Say
the number out loud and get a yes.** This is the only step that spends money.

```
gen_run {"project": "…"}
gen_run {"project": "…", "labels": ["premium", "wild"]}
```

Then stop and let them render. Read the project again in a minute to see the
assets land. A failed asset refunds itself — no need to ask for a refund, and
no need to warn about one.

## Rules

- **Never call `gen_run` without an explicit yes to a stated price.** Everything
  before it is free and reversible; this one is neither.
- One run is one batch. Redoing the premium next week is another run in the same
  project, not a new project — the folder is the game.
- If generation is switched off, say so plainly rather than retrying.
- The balance is the mozg balance, topped up at mozg.sh/settings/balance. There
  is no second wallet and no credits to buy.
