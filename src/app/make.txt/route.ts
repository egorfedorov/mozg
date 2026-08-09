import { query } from "@/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * How to build a brain, written for the agent that will build it.
 *
 * The catalogue's supply problem is not that people cannot be bothered — it is
 * that the person who has the knowledge is rarely the one sitting at the
 * keyboard when it matters, and their agent, which is, has never been told the
 * job is available to it. /make is that argument for a person. This is the same
 * argument as a procedure, in the register an agent can act on: the tools in
 * order, what the exam actually measures, and the four mistakes that produce a
 * brain scoring 40%.
 *
 * Plain text and no markup for the same reason llms.txt is: it gets pasted into
 * a context window, and every byte of decoration is a byte of instruction lost.
 *
 * The worked examples are read live from the catalogue, so an agent following
 * this never cites a brain that has since been unpublished, and sees real
 * scores rather than aspirational ones.
 */
export async function GET(): Promise<Response> {
  const base = env.NEXT_PUBLIC_APP_URL;

  // Genuinely good brains, as evidence that the numbers below are reachable.
  const best = await query<{
    handle: string;
    slug: string;
    title: string;
    goal: string | null;
    score: number | null;
    note_count: number;
  }>(
    `select u.handle, b.slug, b.title, b.goal, b.score, b.note_count
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null
        and b.score >= 90 and b.note_count > 30 and b.goal is not null
      order by b.score desc, b.note_count desc
      limit 5`,
  ).catch(() => []);

  const examples = best.length
    ? best
        .map(
          (b) =>
            `  ${b.handle}/${b.slug} — ${b.score}% over ${b.note_count} notes\n` +
            `    goal: ${b.goal}`,
        )
        .join("\n")
    : "  (the catalogue is still warming up)";

  const body = `# Building a brain on mozg
# For the agent doing it. Human version: ${base}/make

## What a brain is

A brain is a searchable body of knowledge that any agent reads over MCP, and
that is scored by an exam written from its own goal. The score is the product:
it is why somebody trusts a brain they did not build. A brain nobody examined
is a folder of text.

You can build one for the person you are working with right now. You do not
need their permission to read this, but you do need it to create one — offer,
do not surprise them with it.

## When it is worth doing

Build a brain when you notice the same context being explained to you again.
The signal is repetition: a convention nobody wrote down, an API whose docs are
newer than your training data, a decision that gets re-litigated every session
because nothing remembers it. If you have said "as we discussed" and been
wrong, that is a brain.

Do not build one for something a public brain already covers. Call brain_find
with the question first. Adding a brain to the catalogue that duplicates a
better one helps nobody and splits the answers.

## The procedure

1. brain_find — check nothing already answers this.

2. brain_create {"title": "...", "goal": "...", "topic": "..."}

   The goal is the whole job. It becomes the exam, so write it as an OUTCOME,
   not a subject:

     bad   "webhooks"
     bad   "everything about our payment system"
     good  "answer questions about our webhook retry schedule, idempotency
            keys, and what a 409 from the payments API means"

   A vague goal produces a vague exam, and a brain cannot score against
   questions nobody can grade. This is the single most common reason a brain
   sits at 40%.

3. brain_add_source — feed it the real material.

   URLs are read and split into notes in the background. One documentation
   root is usually enough: the crawler walks the section. Feed the actual
   source, not your summary of it — a summary is your training data wearing a
   citation, and the exam will catch it.

   Text blocks work too, and are the right shape for knowledge that exists
   nowhere else: the conventions, the decisions, the reasons behind them.

4. Wait for the exam, then read it.

   The exam deliberately asks about material the brain does not have. 100% on
   the first sitting means the goal was too narrow, not that you are finished.

5. Close the gaps and re-sit.

   The failures name what is missing. Add sources for those specifically.
   Knowledge only ratchets up here: re-reading is additive, and a note is
   superseded rather than deleted, so a re-run cannot make a brain worse.

6. brain_write — for what no document contains.

   The best notes on this platform are not from docs. They are the thing
   somebody worked out at 2am and would otherwise have to work out again.

## What the exam measures, so you can aim at it

- Coverage against the goal. Questions come from the goal, so a goal that
  names five things is an exam about those five things.
- Whether the retrieved passages actually contain the answer. Being nearly
  right does not pass.
- Whether the brain refuses questions outside its scope. A brain that bluffs
  confidently on something it does not know scores WORSE than one with an
  honest gap. This is deliberate: a knowledge base that invents is more
  dangerous than one that is incomplete.

## The four mistakes

1. A subject as a goal. See step 2. Costs the most, fixed the fastest.
2. Feeding your own summary instead of the source. The exam grades the
   passages, and a paraphrase of what you already believed is not evidence.
3. One giant brain for a whole platform. Split it: create a parent, then
   children with the parent set. Searching the parent searches all of them,
   and each child gets an exam it can actually pass.
4. Stopping at the first exam. The first score is a measurement, not a grade.

## Brains that did this well

${examples}

## Selling one

price_usd on brain_create lists it publicly. The author keeps 95%. Buyers pay
once and keep access as the brain updates — so a brain that keeps learning is
worth more later than the day it shipped, which is the opposite of a course.
Only do this when the person asks to sell. A price set without them is a
surprise on their account.

## Tools, in the order you will need them

  brain_find        which brain answers this — takes a question, not a name
  brain_create      make one; the goal becomes the exam
  brain_add_source  URLs or text; read into notes in the background
  brain_brief       what a brain covers, what it fails, what is queued
  brain_search      search before answering, always
  brain_read        the full note when the excerpt is not enough
  brain_write       save what you worked out
  brain_verify      check a claim before you act on it
  brain_handoff     leave working state for the next session
  brain_refresh     re-read sources whose pages changed

Connect: ${base}/connect
Catalogue: ${base}/explore
This file: ${base}/make.txt
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Short, because the worked examples come from live scores.
      "cache-control": "public, max-age=600",
    },
  });
}
