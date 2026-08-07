import { z } from "zod";
import { maybeOne, one, query, tx } from "@/db";
import type { Brain, Check, Plan } from "@/db/types";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import { findRegressions } from "@/lib/regressions";
import { searchBrain } from "@/lib/search";
import { classifyFailure, covers, type GapKind } from "@/lib/gap-kind";
import { familyIds } from "@/lib/families";
import { effectivePlan, limitsFor } from "@/lib/plans";
import { byokStorage } from "@/lib/byok";
import { discoverPages, pickTopUpPages } from "@/lib/crawl";
import { enqueueIngest, PRIORITY } from "@/worker/queue";

/**
 * The exam — point B, made measurable.
 *
 * The goal becomes control questions; after every ingest the brain re-sits them
 * and reports a score plus, more usefully, which categories it cannot answer.
 * That gap list is what tells the user which material to add next, instead of
 * leaving them to guess why their agent still gives bad answers.
 */

const JUDGE_BATCH = 5;

/**
 * How many questions a corpus deserves. Thirty flat was the old rule, and it
 * made every score mean something different: 30 probes over 5 notes is an
 * audit, 30 over 3,600 (owasp-cheatsheets) is a spot check dressed as one.
 * One question per ~25 notes, floored at 30 so small brains keep a real
 * exam, capped at 100 so the judge bill stays sane.
 */
export function examSize(noteCount: number): number {
  return Math.min(100, Math.max(30, Math.round(noteCount / 25)));
}

/** Anti-bluff share: a fifth of the exam, never fewer than three probes. */
export function negativeTarget(totalChecks: number): number {
  return Math.max(3, Math.round(totalChecks * 0.2));
}

// ─── generating the checks ───────────────────────────────────────────────────

// Tolerant on purpose: the model writing the exam is the cheap one, and a
// weight of 3.5 or an 90-char category label is a repairable answer, not a
// reason to fail the whole sitting. Repair what can be repaired, drop what
// cannot, and only give up when nothing survives.
const generated = z.object({
  checks: z.array(
    z.object({
      category: z
        .string()
        .min(1)
        .transform((s) => s.slice(0, 80)),
      question: z.string().min(1),
      expect: z.string().min(1),
      weight: z.coerce
        .number()
        .catch(1)
        .transform((w) => Math.min(5, Math.max(1, Math.round(w)))),
      // Anything that is not a clean "negative" is a coverage check — a model
      // that invents a third kind meant "positive".
      kind: z.enum(["positive", "negative"]).catch("positive"),
    }),
  ),
});

const GEN_SCHEMA = {
  type: "object",
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", description: "Grouping label, 4-7 distinct ones." },
          question: { type: "string", description: "What a user would actually ask." },
          expect: { type: "string", description: "What a correct answer must contain." },
          weight: { type: "number", description: "1-5, how central this is to the goal." },
          kind: {
            type: "string",
            enum: ["positive", "negative"],
            description:
              "positive: the brain SHOULD answer this. negative: an out-of-scope " +
              "probe the brain should NOT be able to answer.",
          },
        },
        required: ["category", "question", "expect", "weight"],
        additionalProperties: false,
      },
    },
  },
  required: ["checks"],
  additionalProperties: false,
} as const;

export async function generateChecks(brain: Brain): Promise<number> {
  if (!brain.goal) return 0;

  // The same scope the exam retrieves over — for a parent that means the
  // family. Generating from the parent's own (often empty) notes produced
  // exams with no anchor in what the family actually holds: every question
  // a gap question, every sitting a zero.
  const scope = await familyIds(brain);
  // Stratified, not newest-first: 200 recent titles showed the generator ~5%
  // of a large brain and whatever category was ingested last. Round-robin
  // across categories gives every subject a seat before any subject gets two.
  const titles = await query<{ title: string; category: string | null }>(
    `select title, category from (
       select title, category,
              row_number() over (partition by coalesce(category, '')
                                 order by random()) as rn
         from notes
        where brain_id = any($1::uuid[]) and status = 'active') t
      order by rn, random()
      limit 300`,
    [scope],
  );

  const { n: scopeNotes } = await one<{ n: number }>(
    `select count(*)::int as n from notes
      where brain_id = any($1::uuid[]) and status = 'active'`,
    [scope],
  );
  const target = examSize(scopeNotes);
  const negatives = negativeTarget(target);

  const { data: raw } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    toolName: "save_checks",
    toolDescription: "Save the exam. Call once with every check you wrote.",
    schema: GEN_SCHEMA,
    system:
          (brain.kind === "style"
            ? // A style is not a subject to be quizzed about, it is a
              // procedure to be reproduced. So the exam asks what a person
              // standing at the easel would need — values, weights, the
              // nevers — because those are the questions whose failure means
              // "a buyer cannot draw in this style from what you sold them".
              // A style scoring well on "describe the mood" is a style that
              // sold nothing.
              "You write exams that decide whether a written-down visual style " +
              "can actually be REPRODUCED from it.\n\n" +
              "Every question must be one an artist or an image model would need " +
              "answered before making the next piece: an exact colour value, an " +
              "outline weight, how shading is achieved, an edge treatment, a " +
              "proportion rule, or something the style must never do. `expect` " +
              "names the value or the rule.\n\n" +
              "Never ask what a picture depicts, and never ask about mood, feeling " +
              "or influences unless the answer is a concrete instruction. " +
              "\"Warm and nostalgic\" is not a checkable expectation; \"the only " +
              "saturated ink is #f15060; everything else is cream or near-black\" " +
              "is.\n\n" +
              "Include at least two checks on the hard nevers — the things that " +
              "give an imitation away.\n\n"
            : "You write exams for knowledge bases that AI coding agents read.\n\n") +
          "Given a goal and the titles of the notes a brain currently holds, write " +
          `up to ${target} control questions that verify whether the brain can ` +
          "actually support that goal.\n\n" +
          "Each check has a question a user would really ask, and `expect` — what a " +
          "correct answer must contain. Make `expect` checkable: name the specific " +
          "value, rule or behaviour, not 'a good explanation'.\n\n" +
          "Group the checks into 4-10 categories.\n\n" +
          // Measured on production: owasp-asvs sat at 29% and nearly every
          // failure was "list all seventeen chapters", "which requirements apply
          // only to Level 3", "what is the title of V14". A brain answers from
          // the handful of passages retrieval returns, so a question that needs
          // the whole corpus in one answer measures the size of that window and
          // nothing else — and the score it produces is a lie about the
          // material, permanently, because the check never stops failing.
          "Every question must be answerable from a handful of passages. Do NOT " +
          "ask for exhaustive enumerations or corpus-wide counts — no \"list all\", " +
          "no \"which of the N are X\", no \"how many\" across the whole subject. " +
          "Ask for a specific rule, value, signature or behaviour instead: the " +
          "thing someone actually needs mid-task.\n\n" +
          // The other half of the same failure: an expectation that was true when
          // written and is not any more punishes a brain for being current.
          //
          // Carefully worded, because the first attempt at this said "write expect
          // from the notes" full stop — which quietly cancels the gap questions
          // asked for below (a gap has no note to write an expectation from) and
          // turns the exam into the notes quoted back at themselves. owasp-asvs
          // went from 29% to 100% on that version, which is as useless a number as
          // the 29% was.
          "Never write an expectation that CONTRADICTS the notes you were shown: " +
          "if your own memory of this subject disagrees with them, they are newer " +
          "than your memory and they win. For a check on material the brain " +
          "already holds, `expect` is what those notes say. For a deliberate gap " +
          "question, `expect` is what the goal implies a good answer must contain — " +
          "those are meant to fail today.\n\n" +
          "Crucially: include checks for aspects the goal implies but the notes do " +
          "NOT currently cover. Those failures are the point — they tell the user " +
          "what material is missing. An exam that only asks what the brain already " +
          "knows is worthless.\n\n" +
          `Also include about ${negatives} checks with kind "negative": plausible questions a ` +
          "user might genuinely ask this brain that are OUTSIDE its scope — " +
          "neighbouring topics, adjacent products, common confusions the goal " +
          "does not cover. For these, `expect` must say that the correct " +
          "behaviour is to admit the topic is not covered rather than to guess. " +
          "They test that the brain does not bluff. Weight them 1-2: they are " +
          "probes, not the core exam.",
    content: [
      {
        type: "text",
        text:
          `Goal:\n${brain.goal}\n\n` +
          `Notes currently in the brain (${titles.length}):\n` +
          titles
            .map((t) => `- ${t.title}${t.category ? ` [${t.category}]` : ""}`)
            .join("\n"),
      },
    ],
  });

  const parsed = generated.safeParse(raw);
  let checks: z.infer<typeof generated>["checks"];
  if (parsed.success) {
    checks = parsed.data.checks;
  } else {
    // Salvage per item before giving up on the batch.
    const items = Array.isArray((raw as { checks?: unknown[] })?.checks)
      ? (raw as { checks: unknown[] }).checks
      : [];
    checks = items.flatMap((i) => {
      const p = generated.shape.checks.element.safeParse(i);
      return p.success ? [p.data] : [];
    });
    if (!checks.length) {
      throw new Error(
        `check generation schema mismatch: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
  }
  checks = checks.slice(0, target);

  // One transaction: as separate statements a crash between the delete and
  // the inserts left the brain with zero generated checks, and the next exam
  // would quietly regenerate from nothing rather than retry this failure.
  await tx(async (client) => {
    await client.query(`delete from checks where brain_id = $1 and origin = 'generated'`, [
      brain.id,
    ]);
    for (const c of checks) {
      await client.query(
        `insert into checks (brain_id, category, question, expect, weight, kind)
         values ($1, $2, $3, $4, $5, $6)`,
        [brain.id, c.category, c.question, c.expect, c.weight, c.kind],
      );
    }
  });

  return checks.length;
}

/**
 * Checks whose retrieval ran without the cross-encoder.
 *
 * Named and exported so the rule that depends on it can be tested without
 * standing up a whole sitting: the number this returns decides whether a score
 * is published or the run is failed, which makes it the most consequential
 * arithmetic in the file.
 */
export function countDegraded(checks: { reranked: boolean }[]): number {
  return checks.filter((c) => !c.reranked).length;
}

/**
 * Add anti-bluff probes to an exam that has none.
 *
 * The catalogue grew a measurement inconsistency: negative probes — plausible
 * questions just outside a brain's scope, which it is supposed to refuse — were
 * added to the generator after most brains had already written their exams. 45 of
 * 67 public brains were being graded without that dimension, and they average
 * three points higher for it. A score is the one factual claim this product makes,
 * so it has to be measured the same way everywhere.
 *
 * Deliberately additive rather than a regeneration. generateChecks deletes and
 * rewrites every generated check, which cascades away the results that make the
 * diff between sittings readable — history worth more than the tidiness. This
 * writes two or three probes beside what is already there, on the cheap model's
 * bigger sibling only for the one call, and the next sitting picks them up.
 */
export async function generateNegativeProbes(brain: Brain): Promise<number> {
  if (!brain.goal) return 0;

  // Top up to the fleet-wide share (a fifth of the exam), not just from zero:
  // exams written under the old "2-3 probes" rule stay under-measured on the
  // anti-bluff axis otherwise, and it is their worst axis (62% vs 80% pass).
  const counts = await one<{ neg: number; total: number }>(
    `select count(*) filter (where kind = 'negative')::int as neg,
            count(*)::int as total
       from checks where brain_id = $1 and enabled`,
    [brain.id],
  );
  const want = negativeTarget(counts.total) - counts.neg;
  if (want <= 0) return 0;

  const scope = await familyIds(brain);
  const categories = await query<{ category: string }>(
    `select distinct category from checks where brain_id = $1 and enabled and category is not null
      limit 12`,
    [brain.id],
  );
  const titles = await query<{ title: string }>(
    `select title from notes where brain_id = any($1::uuid[]) and status = 'active'
      order by created_at desc limit 80`,
    [scope],
  );

  const { data: raw } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    toolName: "save_checks",
    toolDescription: "Save the probes. Call once with all of them.",
    schema: GEN_SCHEMA,
    system:
      "You write anti-bluff probes for a knowledge base that AI coding agents read.\n\n" +
      "Given a goal, the categories its exam already covers, and a sample of the " +
      `notes it holds, write exactly ${want} checks with kind "negative": plausible ` +
      "questions a user might genuinely ask this brain that are OUTSIDE its scope — " +
      "neighbouring topics, adjacent products, the confusions its subject invites.\n\n" +
      "They must be believable, not absurd: \"how do I configure Vite\" asked of a " +
      "React brain, not \"what is the capital of France\". For each, `expect` says " +
      "that the correct behaviour is to admit the topic is not covered rather than " +
      "to guess. Weight them 1-2 — they are probes, not the core exam. Use the " +
      "category \"Out of Scope\".",
    content: [
      {
        type: "text",
        text:
          `Goal:\n${brain.goal}\n\n` +
          `Categories the exam already covers:\n${categories.map((c) => `- ${c.category}`).join("\n")}\n\n` +
          `A sample of what it holds:\n${titles.map((t) => `- ${t.title}`).join("\n")}`,
      },
    ],
  });

  const parsed = generated.safeParse(raw);
  const items = parsed.success
    ? parsed.data.checks
    : (Array.isArray((raw as { checks?: unknown[] })?.checks)
        ? (raw as { checks: unknown[] }).checks
        : []
      ).flatMap((i) => {
        const p = generated.shape.checks.element.safeParse(i);
        return p.success ? [p.data] : [];
      });

  // Only negatives, and only what tops the exam up to its share: a probe that
  // arrives as a positive check would be graded as coverage the brain is
  // expected to have.
  const probes = items.filter((c) => c.kind === "negative").slice(0, want);
  if (!probes.length) return 0;

  for (const c of probes) {
    await query(
      `insert into checks (brain_id, category, question, expect, weight, kind)
       values ($1, $2, $3, $4, $5, 'negative')`,
      [brain.id, c.category || "Out of Scope", c.question, c.expect, Math.min(2, c.weight)],
    );
  }
  return probes.length;
}

/**
 * How deep to look when deciding whether a missing answer is absent or merely
 * ranked below the five the judge sees. Matches diagnose-exam.ts, so the label
 * the exam files and the one the script prints mean the same thing.
 */
const WIDE_LOOK = 25;

// ─── running the exam ────────────────────────────────────────────────────────

// A verbose judge is a style problem, not a verdict problem — clip the
// reason rather than fail thirty verdicts over one long sentence.
const verdicts = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      reason: z.string().transform((s) => s.slice(0, 400)),
    }),
  ),
});

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The check id you were given." },
          passed: { type: "boolean" },
          reason: { type: "string", description: "One sentence, why." },
        },
        required: ["id", "passed", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

export interface ExamResult {
  score: number;
  passed: number;
  total: number;
  costCents: number;
  /** Verdicts carried from the previous run because their category's
   *  material had not moved — the incremental re-sit's savings, visible. */
  carried: number;
  /** Out-of-scope probes (kind = 'negative') scored separately, so a brain
   *  that bluffs is visible even when its coverage is perfect. They ALSO
   *  count in `score` like any other check — bluffing is a quality defect,
   *  not a side metric. */
  negativePassed: number;
  negativeTotal: number;
}

/**
 * Searches that returned nothing are gap reports filed by real callers — the
 * one signal about what the brain is missing that nobody had to write. The
 * top recent misses become exam checks, so the whole improvement machinery
 * (focused rereads, site top-up, the board's red slots) aims at what people
 * actually asked instead of only what the goal implied.
 *
 * Owner-disabled usage checks stay dead: dedup is by question text across
 * all origins, enabled or not.
 */
export async function syncUsageChecks(brain: Brain, scope: string[]): Promise<number> {
  const misses = await query<{ query: string }>(
    `select query from calls
      where brain_id = any($1::uuid[]) and tool = 'brain_search'
        and ok and results = 0 and length(trim(query)) >= 12
        and created_at > now() - interval '30 days'
      group by query
      order by count(*) desc, max(created_at) desc limit 10`,
    [scope],
  );

  let added = 0;
  for (const m of misses) {
    const r = await query(
      `insert into checks (brain_id, category, question, expect, origin)
       select $1, 'asked in real use', $2,
              'Material that actually answers this — it was asked and the brain had nothing.',
              'usage'
        where not exists (
          select 1 from checks
           where brain_id = $1 and lower(trim(question)) = lower(trim($2)))
       returning id`,
      [brain.id, m.query.trim()],
    );
    added += r.length;
  }
  return added;
}

export interface ExamOptions {
  /**
   * Sit regardless of the cooldown. The CLI and the owner's "re-sit" button
   * pass it: a person asking for a score now has already decided it is worth
   * the money.
   */
  force?: boolean;
  /**
   * The cheap probe run after a refresh re-ingests a rewritten page: re-judge
   * the existing enabled checks with a single judge vote — no check
   * generation, no usage sync, no carried passes, no site top-up. It records
   * regressions and marks the brain examined, but the official score stays
   * the last full sitting's: one vote is a staleness signal, not a number to
   * put on the storefront.
   */
  mini?: boolean;
}

/** One probe per brain per day is plenty — refreshes trickle, they do not burst. */
/**
 * How long a full sitting stays fresh. Six hours matches the maintenance
 * pass: material that changed since then gets its score re-measured, and
 * material that did not is not re-judged for the third time today.
 */
const FULL_INTERVAL = "6 hours";

const MINI_INTERVAL = "1 day";

export async function runExam(
  brainId: string,
  opts: ExamOptions = {},
): Promise<ExamResult | null> {
  const mini = opts.mini ?? false;
  const brain = await one<Brain>(`select * from brains where id = $1`, [brainId]);
  if (!brain.goal) return null;

  // An empty corpus cannot sit an exam. Without this, a brain whose notes
  // were deleted would pass its anti-bluff probes on the void ("correctly"
  // has no answer) and walk away with a fresh score — the exact lie the
  // counter trigger just retired.
  const { n: corpus } = await one<{ n: number }>(
    `select count(*)::int as n from notes
      where brain_id = any($1::uuid[]) and status = 'active'`,
    [await familyIds(brain)],
  );
  if (corpus === 0) {
    console.log(`[exam] ${brainId} skipped — no active notes to examine`);
    return null;
  }

  // A full sitting costs three judge votes per check. Seeding a catalogue
  // pack finishes one brain after another and each finish queues one — the
  // day a dozen packs land, that is dozens of full sittings for material
  // whose score moved by a point. One sitting per brain per cooldown window,
  // unless a person asked.
  if (!mini && !opts.force) {
    const recentFull = await maybeOne(
      `select 1 from check_runs
        where brain_id = $1 and kind = 'full' and status = 'done'
          and started_at > now() - interval '${FULL_INTERVAL}'`,
      [brainId],
    );
    if (recentFull) {
      console.log(`[exam] ${brainId} skipped — sat within the last ${FULL_INTERVAL}`);
      return null;
    }
  }

  if (mini) {
    // Rate-limit the probe, not the sitting: a brain whose sources change
    // twice in a day gets re-judged once.
    const recent = await maybeOne(
      `select 1 from check_runs
        where brain_id = $1 and kind = 'mini'
          and started_at > now() - interval '${MINI_INTERVAL}'`,
      [brainId],
    );
    if (recent) {
      console.log(`[exam] ${brainId} mini skipped — probed less than ${MINI_INTERVAL} ago`);
      return null;
    }
  } else {
    // The trial plan buys one sitting per brain — enough to see the loop
    // close, not enough to grind a free account into a maintained brain. The
    // plan in force, not the plan on the row: a lapsed paid_until reads as
    // free here, same as everywhere else limits are enforced (tokens.ts,
    // session). Mini probes are ours, not the owner's — they never count
    // against this.
    const owner = await one<{ plan: Plan; paid_until: Date | null }>(
      `select plan, paid_until from "user" where id = $1`,
      [brain.owner_id],
    );
    const allowed = byokStorage.getStore() ? Infinity : limitsFor(owner.plan, owner.paid_until).examSittings;
    if (Number.isFinite(allowed)) {
      const sat = await one<{ n: number }>(
        `select count(*)::int as n from check_runs
          where brain_id = $1 and status = 'done' and kind = 'full'`,
        [brainId],
      );
      if (sat.n >= allowed) {
        console.log(
          `[exam] ${brainId} skipped — ${effectivePlan(owner.plan, owner.paid_until)} ` +
            `plan allows ${allowed} sitting(s)`,
        );
        return null;
      }
    }

    await syncUsageChecks(brain, await familyIds(brain));
  }

  let checks = await query<Check>(
    `select * from checks where brain_id = $1 and enabled`,
    [brainId],
  );

  if (!checks.length) {
    // A probe never writes the exam — without checks there is nothing to
    // re-judge, and generating them is the expensive path mini exists to avoid.
    if (mini) return null;
    await generateChecks(brain);
    checks = await query<Check>(`select * from checks where brain_id = $1 and enabled`, [
      brainId,
    ]);
    if (!checks.length) return null;
  }

  const run = await one<{ id: string }>(
    `insert into check_runs (brain_id, model, status, kind) values ($1, $2, 'running', $3)
     returning id`,
    [brainId, env.MODEL_JUDGE, mini ? "mini" : "full"],
  );

  try {
    // Retrieval first, for every check. This is the part that actually measures
    // the brain: the judge only ever sees what search returned.
    //
    // The same scope an agent gets, which for a parent means its children. A
    // score is a promise about what asking this brain returns, so scoring it on
    // less than that would make the number a lie in the owner's favour.
    const scope = await familyIds(brain);

    // Incremental re-sits: a pass in a category whose material has not moved
    // since the last run is carried forward, not re-bought — re-judging
    // unchanged material can only add noise, which the voting exists to
    // remove. Failures are ALWAYS re-judged (recovery must stay possible),
    // and any check without a previous verdict is fresh by definition.
    const prev = await query<{ id: string; started_at: Date }>(
      `select id, started_at from check_runs
        where brain_id = $1 and status = 'done'
        order by started_at desc limit 1`,
      [brainId],
    ).then((r) => r[0] ?? null);

    // The previous sitting's verdicts, for the regression diff at the end —
    // and, in a full run, for the carried passes below.
    const prevResults = prev
      ? await query<{
          check_id: string;
          passed: boolean;
          reason: string | null;
          retrieval_hits: number | null;
          retrieval_top_score: number | null;
          evidence: string[] | null;
        }>(`select * from check_results where run_id = $1`, [prev.id])
      : [];

    // A mini probe re-judges everything: carrying a pass because "the
    // category did not move" is exactly the assumption a refresh disproved.
    const touched = !mini && prev
      ? new Set(
          (
            await query<{ category: string }>(
              `select distinct category from notes
                where brain_id = any($1::uuid[]) and category is not null
                  and (created_at > $2
                       or (superseded_at is not null and superseded_at > $2))`,
              [scope, prev.started_at],
            )
          ).map((r) => r.category),
        )
      : new Set<string>();

    const carried = new Map<
      string,
      { passed: boolean; reason: string; hits: number; top: number | null; evidence: string[] | null }
    >();
    if (prev && !mini) {
      for (const r of prevResults) {
        const check = checks.find((c) => c.id === r.check_id);
        if (check && r.passed && !touched.has(check.category)) {
          carried.set(check.id, {
            passed: true,
            reason: r.reason ?? "carried from the previous run (material unchanged)",
            hits: r.retrieval_hits ?? 0,
            top: r.retrieval_top_score,
            evidence: r.evidence,
          });
        }
      }
    }

    const fresh = checks.filter((c) => !carried.has(c.id));

    // One at a time, not Promise.all. The reranker is a single torch process:
    // firing thirty retrievals at once means each waits behind the other
    // twenty-nine, every one of them trips search's 8s interactive timeout, and
    // the whole sitting is graded on unranked candidates. It also starves the
    // callers the lane exists for. A sitting is a background job — thirty
    // retrievals at two seconds is a minute, and nobody is watching.
    const contexts: {
      check: Check;
      context: string;
      reranked: boolean;
      retrievalHits: number;
      retrievalTopScore: number | null;
      evidence: string[];
    }[] = [];
    for (const check of fresh) {
      const { hits, reranked } = await searchBrain(scope, check.question, { limit: 5 });
      contexts.push({
        check,
        context: hits.map((h) => `${h.title}\n${h.excerpt}`).join("\n\n---\n\n"),
        // The verdict's paper trail: which notes the judge actually read.
        evidence: hits.map((h) => h.note_id),
        // Whether the cross-encoder actually ran. A sitting graded on plain RRF
        // order measures a degraded system and records the number as if it were
        // the brain's — see the check below.
        reranked: reranked || hits.length <= 1,
        // Kept alongside the verdict so a fail can be told apart later: zero
        // hits means the brain has nothing to answer from, hits with a fail mean
        // the material is there and search or phrasing lost it. topScore is the
        // fused RRF score of whatever ranked first (the reranker reorders but
        // does not rescale it).
        retrievalHits: hits.length,
        retrievalTopScore: hits[0]?.score ?? null,
      });
    }

    // A score is the product's one factual claim, so it must not be published
    // from a retrieval the caller would not have got. When the reranker is down
    // or contended, search returns RRF order — good enough to answer with, and
    // not good enough to grade with: nextjs-api once scored 8/100 this way with
    // every answer sitting in the brain, and the judge's own reasons said the
    // passages were about something else entirely.
    //
    // Failing the run is the honest outcome. examStaleBrains re-queues it, and
    // the previous score stays on screen with its own timestamp rather than
    // being overwritten by a lie.
    const degradedChecks = countDegraded(contexts);
    if (degradedChecks > 0) {
      throw new Error(
        `retrieval degraded: ${degradedChecks}/${contexts.length} checks were ` +
          `graded without the reranker — score not recorded`,
      );
    }

    let cost = 0;
    const results: {
      check: Check;
      passed: boolean;
      reason: string;
      retrievalHits: number;
      retrievalTopScore: number | null;
      evidence: string[] | null;
    }[] = [];

    for (let i = 0; i < contexts.length; i += JUDGE_BATCH) {
      const batch = contexts.slice(i, i + JUDGE_BATCH);

      // Several independent votes per check, majority wins. One judge run
      // moves the same brain ±10 points between re-sits — with votes, two
      // runs on unchanged material give the same score, which is what makes
      // a small score change readable as a real one. See JUDGE_VOTES in env.
      // A mini probe buys a single vote: it looks for flips, not for a
      // score stable enough to publish.
      // allSettled, not all: votes exist to absorb judge variance, and a vote
      // the proxy mangled on the way back is variance of the same kind. One
      // unreadable response used to kill the whole run — and pg-boss then
      // re-sat the entire exam, paying for every other batch again, three
      // times over (owasp-cheatsheets, 2026-08-06/07). A lost vote is an
      // abstention the majority below already knows how to handle; only a
      // batch where every vote failed is a real failure.
      const settled = await Promise.allSettled(
        Array.from({ length: mini ? 1 : env.JUDGE_VOTES }, () => judge(batch)),
      );
      const votes = settled
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      // Logged before the rethrow, so a batch where all three votes failed
      // for three different reasons says all three rather than the first.
      for (const r of settled) {
        if (r.status === "rejected") {
          console.warn(`[exam] ${brain.slug}: dropped a judge vote — ${r.reason}`);
        }
      }
      if (!votes.length) throw (settled[0] as PromiseRejectedResult).reason;
      cost += votes.reduce((n, v) => n + v.costCents, 0);

      for (const entry of batch) {
        const verdicts = votes
          .map((v) => v.verdicts.find((x) => x.id === entry.check.id))
          .filter((v) => v !== undefined);
        // A missing verdict is an abstention, not a pass: the majority is of
        // the votes that actually came back.
        const passVotes = verdicts.filter((v) => v.passed).length;
        const passed = verdicts.length > 0 && passVotes * 2 > verdicts.length;
        results.push({
          check: entry.check,
          passed,
          reason:
            verdicts.find((v) => v.passed === passed)?.reason ??
            "judge returned no verdict",
          retrievalHits: entry.retrievalHits,
          retrievalTopScore: entry.retrievalTopScore,
          evidence: entry.evidence,
        });
      }
    }

    // Carried passes join the run's results as first-class rows — the run is
    // complete on its own, and the next diagnosis never needs to know which
    // verdicts were fresh.
    for (const [checkId, c] of carried) {
      const check = checks.find((x) => x.id === checkId)!;
      results.push({
        check,
        passed: c.passed,
        reason: c.reason,
        retrievalHits: c.hits,
        retrievalTopScore: c.top,
        evidence: c.evidence,
      });
    }

    for (const r of results) {
      await query(
        `insert into check_results
           (run_id, check_id, passed, reason, retrieval_hits, retrieval_top_score, evidence)
         values ($1, $2, $3, $4, $5, $6, $7::uuid[])`,
        [run.id, r.check.id, r.passed, r.reason, r.retrievalHits, r.retrievalTopScore, r.evidence],
      );
    }

    // Weighted, so a central check counts for more than a peripheral one.
    // Negative probes are in this sum too — a brain that answers everything
    // confidently should score lower than one that admits its edges.
    const totalWeight = results.reduce((n, r) => n + r.check.weight, 0);
    const passedWeight = results
      .filter((r) => r.passed)
      .reduce((n, r) => n + r.check.weight, 0);
    const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;

    await query(
      `update check_runs set status = 'done', score = $2, cost_cents = $3,
              finished_at = now() where id = $1`,
      [run.id, score, Math.round(cost)],
    );
    if (mini) {
      // Marked examined so examStaleBrains does not queue a full sitting on
      // top of the probe — but brains.score keeps the last full sitting's
      // number: one vote is a staleness signal, not a storefront figure.
      await query(`update brains set score_at = now() where id = $1`, [brainId]);
    } else {
      await query(`update brains set score = $2, score_at = now() where id = $1`, [
        brainId,
        score,
      ]);
    }

    // The staleness signal this run can see and the score cannot: a check
    // that passed last sitting and fails now. Recorded for both kinds of
    // run — a full sitting after an update reveals the same flips the probe
    // hunts for. The open-row unique index makes a still-failing check one
    // regression, not a new row per sitting.
    const cur = results.map((r) => ({ check_id: r.check.id, passed: r.passed }));
    for (const checkId of findRegressions(prevResults, cur)) {
      await query(
        `insert into exam_regressions (brain_id, check_id, run_id)
         values ($1, $2, $3) on conflict do nothing`,
        [brainId, checkId, run.id],
      );
    }
    // A pass closes whatever regression was open on that check — a recovered
    // answer is not stale anymore.
    const passedNow = results.filter((r) => r.passed).map((r) => r.check.id);
    if (passedNow.length) {
      await query(
        `update exam_regressions set resolved = true, resolved_at = now()
          where brain_id = $1 and not resolved and check_id = any($2::uuid[])`,
        [brainId, passedNow],
      );
    }

    // Close what can be closed without a human: questions that failed with
    // zero retrieval hits mean the material is simply absent — and if this
    // brain was built from a crawled site, the site itself is the first
    // place to look for it. Negative probes are excluded on purpose: a
    // failed probe means the brain answers something it should refuse, and
    // ADDING the out-of-scope material would teach it to bluff for real.
    // Non-fatal by design: a topping-up failure must never fail the exam
    // that triggered it.
    // A probe only reports; closing gaps (suggestions, site top-up) is the
    // full sitting's job.
    if (!mini) {
      // Every failure gets classified and filed, not just the zero-hit ones.
      // Filing only "material absent" meant the common failure — a note the
      // judge read and that did not answer — left the owner with a lower score
      // and nothing to act on. The deeper search runs only where it decides
      // something: when the judge's own passages did not contain the answer,
      // "absent" and "ranked too low" are otherwise indistinguishable.
      const failures = results.filter((r) => !r.passed);
      const filed: { result: (typeof failures)[number]; kind: GapKind }[] = [];
      for (const f of failures) {
        const shown = contexts.find((c) => c.check.id === f.check.id)?.context ?? "";
        let wide: string[] | undefined;
        if (f.check.kind !== "negative" && shown.trim() && !covers(shown, f.check.expect)) {
          const deeper = await searchBrain(scope, f.check.question, { limit: WIDE_LOOK });
          wide = deeper.hits.map((h) => `${h.title} ${h.excerpt}`);
        }
        filed.push({
          result: f,
          kind: classifyFailure({
            negative: f.check.kind === "negative",
            expect: f.check.expect,
            shown,
            wide,
          }),
        });
      }

      // The owner acts on these from the brain page (0043). Nothing is added
      // automatically — the suggestion remembers what is missing and now also
      // what kind of missing. A re-failed check updates its kind (retrieval can
      // become thin after a re-read) but a dismissed suggestion stays
      // dismissed.
      for (const { result, kind } of filed) {
        await query(
          `insert into gap_suggestions (brain_id, check_id, question, kind)
           values ($1, $2, $3, $4)
           on conflict (brain_id, check_id) do update
              set kind = excluded.kind
            where gap_suggestions.status = 'pending'`,
          [brainId, result.check.id, result.check.question.slice(0, 500), kind],
        );
      }

      // Only absent material is worth reading more pages for. A thin note needs
      // deepening and a ranking problem needs better wording, so buying pages
      // for either spends money on the wrong fix — and a negative probe is the
      // one case where adding the material teaches the brain to bluff for real.
      const missing = filed.filter((f) => f.kind === "missing");
      if (missing.length) {
        await topUpFromSites(
          brain,
          missing.map((m) => `${m.result.check.category}: ${m.result.check.question}`),
        ).catch((err) =>
          console.warn(
            `[exam] top-up for ${brain.slug} failed: ` +
              (err instanceof Error ? err.message : String(err)),
          ),
        );
      }
    }

    const negativeResults = results.filter((r) => r.check.kind === "negative");
    return {
      score,
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      costCents: cost,
      carried: carried.size,
      negativePassed: negativeResults.filter((r) => r.passed).length,
      negativeTotal: negativeResults.length,
    };
  } catch (err) {
    await query(
      `update check_runs set status = 'failed', error = $2, finished_at = now()
        where id = $1`,
      [run.id, err instanceof Error ? err.message.slice(0, 500) : String(err)],
    );
    throw err;
  }
}

/**
 * Feed the gaps from the brain's own crawl roots. Discovery lists what the
 * site holds (cheap — a tree, an llms.txt or a sitemap), pickTopUpPages ranks
 * unread pages against the failed questions, and the winners are queued like
 * any crawled page. The next exam then measures whether they helped.
 */
async function topUpFromSites(brain: Brain, failedTexts: string[]): Promise<void> {
  const sites = await query<{ id: string; url: string }>(
    `select id, url from sources
      where brain_id = $1 and kind = 'site' and url is not null
      order by created_at limit 2`,
    [brain.id],
  );

  // Catalogue-seeded brains have url sources but no crawl root. Their pages
  // still name the repository they came from — the most common one IS the
  // root, reconstructed rather than asked for.
  if (!sites.length) {
    const repos = await query<{ repo: string; n: number }>(
      `select split_part(regexp_replace(url, 'https://raw.githubusercontent.com/', ''), '/', 1)
              || '/' ||
              split_part(regexp_replace(url, 'https://raw.githubusercontent.com/', ''), '/', 2)
              as repo,
              count(*)::int as n
         from sources
        where brain_id = $1 and url like 'https://raw.githubusercontent.com/%'
        group by 1 order by 2 desc limit 1`,
      [brain.id],
    );
    if (repos.length && repos[0].n >= 3) {
      sites.push({ id: "derived", url: `https://github.com/${repos[0].repo}` });
    }
  }
  if (!sites.length) return;

  const existing = new Set(
    (
      await query<{ url: string }>(
        `select url from sources where brain_id = $1 and url is not null`,
        [brain.id],
      )
    ).map((r) => r.url),
  );

  for (const site of sites) {
    const found = await discoverPages(site.url, 300).catch(() => null);
    if (!found) continue;

    const picks = pickTopUpPages(found.pages, failedTexts, existing);
    for (const url of picks) {
      const source = await one<{ id: string }>(
        `insert into sources (brain_id, kind, url, original_name)
         values ($1, 'url', $2, $3) returning id`,
        [brain.id, url, `${new URL(url).pathname.slice(1)} (added for a failed check)`],
      );
      await enqueueIngest(source.id, PRIORITY.crawl);
      existing.add(url);
    }
    if (picks.length) {
      console.log(`[exam] ${brain.slug}: queued ${picks.length} page(s) to close gaps`);
    }
  }
}

async function judge(
  batch: { check: Check; context: string }[],
): Promise<{ verdicts: z.infer<typeof verdicts>["verdicts"]; costCents: number }> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    maxTokens: 8000,
    toolName: "save_verdicts",
    toolDescription: "Record one verdict per check you were given.",
    schema: JUDGE_SCHEMA,
    system:
      "You grade whether a knowledge base can answer a question.\n\n" +
      "For each item you get a question, what a correct answer must contain, " +
      "and the passages the knowledge base returned for that question.\n\n" +
      "Pass it only if the passages actually contain what `expect` describes. " +
      "Judge the passages, not your own knowledge — if you know the answer but " +
      "the passages do not state it, that is a fail. Partial or vague coverage " +
      "is a fail; the point is to find gaps, not to be generous.\n\n" +
      "Items marked kind=negative are deliberate out-of-scope probes: the " +
      "CORRECT behaviour for the knowledge base is to have no answer. The " +
      "verdict inverts — pass a negative item when the retrieved passages do " +
      "not actually answer the question (the brain would have to admit it " +
      "does not know), and fail it when the passages contain a plausible, " +
      "confident answer. A brain that can bluff its way through a question " +
      "outside its scope is worse than one with a gap.",
    content: [
      {
        type: "text",
        text: batch
          .map(
            (b) =>
              `<check id="${b.check.id}">\n` +
              (b.check.kind === "negative" ? `<kind>negative</kind>\n` : "") +
              `<question>${b.check.question}</question>\n` +
              `<expect>${b.check.expect}</expect>\n` +
              `<retrieved>\n${b.context || "(nothing returned)"}\n</retrieved>\n` +
              `</check>`,
          )
          .join("\n\n"),
      },
    ],
  });

  const parsed = verdicts.safeParse(raw);
  if (!parsed.success) {
    // Say what came back. "schema mismatch" alone sends the next person to
    // read the schema, which is almost never where the problem is — and the
    // zod issue alone ("expected array, received string") does not say which
    // mangling produced the string, so unstringify cannot be taught to
    // rescue it. Carry a clipped sample: it is the only evidence that
    // survives, the value is the judge's own verdicts, and this text lands
    // in app_errors, which is admin-only.
    throw new Error(
      `the judge answered in a shape we cannot read: ${parsed.error.issues
        .slice(0, 2)
        .map((i) => `${i.path.join(".") || "root"} ${i.message}`)
        .join("; ")} — got ${JSON.stringify(raw).slice(0, 400)}`,
    );
  }

  return {
    verdicts: parsed.data.verdicts,
    costCents: costCents(env.MODEL_JUDGE, usage),
  };
}
