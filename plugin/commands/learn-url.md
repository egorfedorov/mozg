---
description: Build a mozg brain from one documentation link — crawl, extract, exam
argument-hint: <url> [brain handle]
---

`$1` is a link to documentation the user wants their agents to know. Turn it
into a trained brain:

1. If `$2` names an existing brain (check with `brain_list`), use it. Otherwise
   call `brain_create` — title from the site or repository name, and a goal
   written as an outcome ("answer questions about X: the exact endpoints,
   fields, rules…"), not a subject. If you have not read the material, keep the
   goal short and honest; it can be refined on the brain page later.

2. Call `brain_add_source` with `urls: ["$1"]` and `crawl: true`. One call —
   the server discovers every page behind the link itself (GitHub tree,
   llms.txt, sitemap, or a link walk).

3. If the crawl is refused because the site is a JavaScript shell, tell the
   user exactly that, and ask for the GitHub repository the docs are built
   from — then retry with that URL. Do not paste page text in as a workaround;
   the crawl path keeps the material fresh, a paste freezes it.

4. Report back in three lines: what was queued, that reading takes minutes and
   the exam runs by itself, and where to watch it
   (https://mozg.sh/brains/<slug>). Do not poll `brain_search` waiting for
   notes to appear.
