import { z } from "zod";
import { one, query } from "@/db";
import type { Brain, Check } from "@/db/types";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import { searchBrain } from "@/lib/search";
import { familyIds } from "@/lib/families";

/**
 * The exam — point B, made measurable.
 *
 * The goal becomes control questions; after every ingest the brain re-sits them
 * and reports a score plus, more usefully, which categories it cannot answer.
 * That gap list is what tells the user which material to add next, instead of
 * leaving them to guess why their agent still gives bad answers.
 */

const MAX_CHECKS = 30;
const JUDGE_BATCH = 5;

// ─── generating the checks ───────────────────────────────────────────────────

const generated = z.object({
  checks: z.array(
    z.object({
      category: z.string().min(1).max(80),
      question: z.string().min(1),
      expect: z.string().min(1),
      weight: z.number().int().min(1).max(5),
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

  const titles = await query<{ title: string; category: string | null }>(
    `select title, category from notes
      where brain_id = $1 and status = 'active'
      order by created_at desc limit 200`,
    [brain.id],
  );

  const { data: raw } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    toolName: "save_checks",
    toolDescription: "Save the exam. Call once with every check you wrote.",
    schema: GEN_SCHEMA,
    system:
          "You write exams for knowledge bases that AI coding agents read.\n\n" +
          "Given a goal and the titles of the notes a brain currently holds, write " +
          `up to ${MAX_CHECKS} control questions that verify whether the brain can ` +
          "actually support that goal.\n\n" +
          "Each check has a question a user would really ask, and `expect` — what a " +
          "correct answer must contain. Make `expect` checkable: name the specific " +
          "value, rule or behaviour, not 'a good explanation'.\n\n" +
          "Group the checks into 4-7 categories.\n\n" +
          "Crucially: include checks for aspects the goal implies but the notes do " +
          "NOT currently cover. Those failures are the point — they tell the user " +
          "what material is missing. An exam that only asks what the brain already " +
          "knows is worthless.",
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
  if (!parsed.success) throw new Error("check generation schema mismatch");

  const checks = parsed.data.checks.slice(0, MAX_CHECKS);

  await query(`delete from checks where brain_id = $1 and origin = 'generated'`, [
    brain.id,
  ]);
  for (const c of checks) {
    await query(
      `insert into checks (brain_id, category, question, expect, weight)
       values ($1, $2, $3, $4, $5)`,
      [brain.id, c.category, c.question, c.expect, c.weight],
    );
  }

  return checks.length;
}

// ─── running the exam ────────────────────────────────────────────────────────

const verdicts = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      reason: z.string().max(400),
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
}

export async function runExam(brainId: string): Promise<ExamResult | null> {
  const brain = await one<Brain>(`select * from brains where id = $1`, [brainId]);
  if (!brain.goal) return null;

  let checks = await query<Check>(
    `select * from checks where brain_id = $1 and enabled`,
    [brainId],
  );

  if (!checks.length) {
    await generateChecks(brain);
    checks = await query<Check>(`select * from checks where brain_id = $1 and enabled`, [
      brainId,
    ]);
    if (!checks.length) return null;
  }

  const run = await one<{ id: string }>(
    `insert into check_runs (brain_id, model, status) values ($1, $2, 'running')
     returning id`,
    [brainId, env.MODEL_JUDGE],
  );

  try {
    // Retrieval first, for every check. This is the part that actually measures
    // the brain: the judge only ever sees what search returned.
    //
    // The same scope an agent gets, which for a parent means its children. A
    // score is a promise about what asking this brain returns, so scoring it on
    // less than that would make the number a lie in the owner's favour.
    const scope = await familyIds(brain);

    const contexts = await Promise.all(
      checks.map(async (check) => {
        const { hits } = await searchBrain(scope, check.question, { limit: 5 });
        return {
          check,
          context: hits.map((h) => `${h.title}\n${h.excerpt}`).join("\n\n---\n\n"),
        };
      }),
    );

    let cost = 0;
    const results: { check: Check; passed: boolean; reason: string }[] = [];

    for (let i = 0; i < contexts.length; i += JUDGE_BATCH) {
      const batch = contexts.slice(i, i + JUDGE_BATCH);
      const { verdicts: batchVerdicts, costCents: batchCost } = await judge(batch);
      cost += batchCost;

      for (const entry of batch) {
        const verdict = batchVerdicts.find((v) => v.id === entry.check.id);
        results.push({
          check: entry.check,
          passed: verdict?.passed ?? false,
          reason: verdict?.reason ?? "judge returned no verdict",
        });
      }
    }

    for (const r of results) {
      await query(
        `insert into check_results (run_id, check_id, passed, reason)
         values ($1, $2, $3, $4)`,
        [run.id, r.check.id, r.passed, r.reason],
      );
    }

    // Weighted, so a central check counts for more than a peripheral one.
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
    await query(`update brains set score = $2, score_at = now() where id = $1`, [
      brainId,
      score,
    ]);

    return {
      score,
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      costCents: cost,
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

async function judge(
  batch: { check: Check; context: string }[],
): Promise<{ verdicts: z.infer<typeof verdicts>["verdicts"]; costCents: number }> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    maxTokens: 4000,
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
      "is a fail; the point is to find gaps, not to be generous.",
    content: [
      {
        type: "text",
        text: batch
          .map(
            (b) =>
              `<check id="${b.check.id}">\n` +
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
  if (!parsed.success) throw new Error("judge schema mismatch");

  return {
    verdicts: parsed.data.verdicts,
    costCents: costCents(env.MODEL_JUDGE, usage),
  };
}
