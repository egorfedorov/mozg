/**
 * Measure what each brain actually ADDS, and put the number on the shelf.
 *
 *   npm run delta                    # every public brain missing a baseline
 *   npm run delta -- --brain react   # one
 *   npm run delta -- --all           # re-measure, including brains that have one
 *   npm run delta -- --dry           # what it would cost, ask nothing
 *
 * The exam has only ever asked its questions with the brain in front of the
 * judge, which measures whether a corpus is self-consistent. This asks the same
 * questions with no brain at all, grades the model's own answers with the same
 * judge and the same rubric, and records the difference.
 *
 * It does NOT re-sit exams: the graded half is whatever the last full sitting
 * recorded. That is the entire reason this is affordable — a control arm costs
 * one answer and one grading call per QUESTION, once, against three judge votes
 * per question per SITTING.
 *
 * Where the two halves came from different question sets (the exam was
 * rewritten after the last sitting) the row is marked stale: the delta is still
 * printed, because it is the best available reading, and flagged, because it is
 * not a clean one.
 */
import { query } from "@/db";
import type { Check } from "@/db/types";
import { closedScore, ensureClosedBook } from "@/worker/exam";
import { env } from "@/lib/env";

interface Row {
  id: string;
  slug: string;
  score: number | null;
  score_closed: number | null;
  checks: number;
  unmeasured: number;
  stale: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const only = val("--brain");
  const all = args.includes("--all");
  const dry = args.includes("--dry");

  const brains = await query<Row>(
    `select b.id, b.slug, b.score, b.score_closed,
            (select count(*)::int from checks c
              where c.brain_id = b.id and c.enabled) as checks,
            (select count(*)::int from checks c
              where c.brain_id = b.id and c.enabled
                and (c.closed_at is null or c.closed_model is distinct from $2)) as unmeasured,
            -- The exam was rewritten after the sitting whose score we are about
            -- to subtract from. Reported, never silently averaged away.
            coalesce((select max(c.created_at) from checks c
                       where c.brain_id = b.id and c.enabled) > b.score_at, false) as stale
       from brains b
      where b.visibility = 'public' and b.score is not null
        and ($1::text is null or b.slug = $1)
      order by b.score desc nulls last`,
    [only ?? null, env.MODEL_JUDGE],
  );

  const todo = brains.filter((b) => b.checks > 0 && (all || b.score_closed === null));
  if (!todo.length) {
    console.log("nothing to measure — every public brain already has a baseline.");
    process.exit(0);
  }

  const questions = todo.reduce((n, b) => n + (all ? b.checks : b.unmeasured), 0);
  console.log(
    `${todo.length} brain(s), ${questions} question(s) without a baseline on ${env.MODEL_JUDGE}.`,
  );
  if (dry) {
    // Two calls per batch of five: one to answer, one to grade. Rounded to the
    // shape of the bill rather than to a promise about it.
    console.log(`dry run — this would make ~${Math.ceil(questions / 5) * 2} model calls.`);
    process.exit(0);
  }

  let spent = 0;
  const done: (Row & { delta: number | null })[] = [];
  for (const b of todo) {
    const checks = await query<Check>(
      `select * from checks where brain_id = $1 and enabled`,
      [b.id],
    );
    const started = Date.now();
    spent += await ensureClosedBook(checks);
    const closed = closedScore(checks.map((check) => ({ check })));
    if (closed !== null) {
      await query(`update brains set score_closed = $2 where id = $1`, [b.id, closed]);
    }
    const delta = closed === null || b.score === null ? null : b.score - closed;
    done.push({ ...b, score_closed: closed, delta });
    console.log(
      `  ${b.slug.padEnd(32)} ${String(b.score).padStart(3)}% - ${
        closed === null ? " ?" : String(closed).padStart(3)
      }% = ${delta === null ? "  ?" : String(delta).padStart(3)}${b.stale ? "  (exam rewritten since the sitting)" : ""}` +
        `  ${Date.now() - started}ms`,
    );
  }

  done.sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999));
  console.log(`\nwhat each brain adds, best first\n`);
  const w = Math.max(6, ...done.map((d) => d.slug.length));
  console.log(`  ${"brain".padEnd(w)}  with  without   adds`);
  console.log(`  ${"─".repeat(w + 24)}`);
  for (const d of done) {
    console.log(
      `  ${d.slug.padEnd(w)}  ${String(d.score).padStart(4)}  ${
        d.score_closed === null ? "   ?" : String(d.score_closed).padStart(7)
      }  ${d.delta === null ? "   ?" : String(d.delta).padStart(5)}`,
    );
  }
  console.log(`\nspent ${(spent / 100).toFixed(2)} USD`);
  const worthless = done.filter((d) => d.delta !== null && d.delta < 10);
  if (worthless.length) {
    console.log(
      `\n${worthless.length} brain(s) add under 10 points — they mostly repeat what the ` +
        `model already knew:\n  ${worthless.map((d) => d.slug).join(", ")}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
