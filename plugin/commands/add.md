---
description: Find a brain in the mozg catalogue and put it on your shelf
argument-hint: [subject, e.g. "prisma" or "kubernetes"]
---

Adding a brain used to mean opening a browser. It does not any more.

## 1. See what is there

Call `brain_list`. Its reply ends with the public catalogue — handles that work
right now, with exam scores. If the subject the user asked for ($ARGUMENTS, or
whatever they are working on) is in that list, you have your handle.

If it is not, the catalogue block is capped at twelve entries rather than being
the whole shop: say so, and point at https://mozg.sh/explore for the full list
so the user can name the handle themselves. Do not guess handles — a wrong one
is a 404 that reads as "the subject does not exist".

## 2. Judge it before shelving it

Say the score out loud. A brain at 40% and a brain at 85% are different offers,
and the user deserves the number before the commitment, not after. If it is
paid, say that too: the purchase happens on the web, not here.

## 3. Add it

Call `library_add` with the handle. Then run the `/mozg:sync` steps so the
project's local map includes it — adding on the server and leaving the project
unaware is half the job.

## 4. Prove it works

Ask the new brain one real question the user actually has, with `brain_search`,
and show what came back. A shelf entry nobody has queried is a promise; one
answer is proof. If the answer is thin, say so plainly — the score already
told us what to expect.

To take one off the shelf: `library_remove`. The brain itself is untouched.
