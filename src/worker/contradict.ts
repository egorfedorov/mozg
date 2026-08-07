import { z } from "zod";
import { query } from "@/db";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import { duplicatePairs, type DuplicatePair } from "@/lib/notes";
import { PACKS, type Pack } from "@/lib/packs";
import { brainsIn } from "@/lib/pack-brains";

/**
 * Finding the places where two brains in a pack disagree.
 *
 * The pack is the unit that matters: those brains are bought together and an
 * agent walks between them inside one task, so a conflict between them reaches
 * a reader as a single confident answer with the argument invisible. Inside one
 * brain the exam and the owner settle it; across two there is nobody to settle
 * it, so the job is to *notice*, not to fix.
 *
 * Shape of a run: vector-close notes from different brains of a pack are
 * candidates, everything already judged is dropped, and what is left goes to
 * one Haiku call each. Both verdicts are stored — a pair judged innocent is
 * remembered precisely so tomorrow's pass does not buy the same "no" again,
 * which is what makes a nightly pass affordable at all.
 */

/**
 * Cosine distance for "these two are answering the same question".
 *
 * Wider than consolidation's 0.09, and it has to be: a merge needs two notes
 * to be the same fact, while a contradiction needs them to be about the same
 * fact and say different things — which reads as *less* similar to an
 * embedder, not more. 0.18 is the far edge of the band where sampled pairs
 * still shared a subject; past it they were merely in the same field, and
 * every one of those is a model call spent to be told "no".
 */
const CANDIDATE_DISTANCE = 0.18;

/** Same reason as consolidation: notes still being corrected are not evidence. */
const MIN_NOTE_AGE_HOURS = 24;

/** Candidate pairs pulled per pack before the judged ones are dropped. */
const PAIR_LIMIT = 200;

/**
 * The cost ceiling, in the only unit that matters: a run is at most this many
 * Haiku calls. Pairs arrive closest-first, so a cut drops the loosest
 * candidates — the ones least likely to be a real conflict anyway.
 */
const MAX_JUDGEMENTS_PER_RUN = 40;

/** Enough of a note to judge on. Bodies are occasionally an entire page. */
const BODY_CLIP = 1500;

const verdict = z.object({
  contradicts: z.boolean(),
  subject: z.string().max(200).nullable(),
  claim_a: z.string().max(500).nullable(),
  claim_b: z.string().max(500).nullable(),
});

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    contradicts: {
      type: "boolean",
      description: "True only for a real conflict. When unsure, false.",
    },
    subject: {
      type: ["string", "null"],
      description: "What they disagree about, in a few words. Null when they do not.",
    },
    claim_a: { type: ["string", "null"], description: "Note A's position, one sentence." },
    claim_b: { type: ["string", "null"], description: "Note B's position, one sentence." },
  },
  required: ["contradicts", "subject", "claim_a", "claim_b"],
  additionalProperties: false,
} as const;

/**
 * The whole precision problem lives in this prompt.
 *
 * Candidates are vector-close notes from two different brains, and the
 * overwhelming majority of them are two true statements about neighbouring
 * things: one library's API beside another's, one version beside the next, a
 * general rule beside its exception. Every one of those flagged is a false
 * alarm on a page whose entire value is that it does not cry wolf — so the
 * prompt spends most of its words on what is *not* a contradiction, and the
 * default is no.
 *
 * Held against five known pairs on haiku-4-5 (2026-08-07, ~0.17¢ each) and
 * right on all five in both directions: it caught two genuine conflicts (the
 * same rule with a different number, and two opposite instructions for one
 * endpoint) and refused three lookalikes — two SDK versions, one fact twice in
 * other words, and a general rule beside its exception. Rerun it with
 * judgePair before touching a word of this: the negative list is doing the
 * work, and shortening it is how the page starts crying wolf.
 */
const SYSTEM =
  "You compare two notes taken from two different knowledge brains that are " +
  "sold and read together. An AI agent may be handed either one as the answer " +
  "to the same question.\n\n" +
  "Decide whether they CONTRADICT: an agent following one would do something " +
  "the other says is wrong, or they state different values, limits, names or " +
  "steps for the same thing.\n\n" +
  "Answer false — this is the normal answer, and most pairs deserve it — when:\n" +
  "- they describe different products, libraries, tools, versions or APIs;\n" +
  "- they apply to different situations, modes, jurisdictions or scopes;\n" +
  "- one is a general rule and the other a specific case of it;\n" +
  "- they overlap, repeat each other, or say the same thing in other words;\n" +
  "- they differ only in wording, emphasis, detail or completeness;\n" +
  "- you are unsure.\n\n" +
  "Two notes can cover the same topic and both be true. That is not a " +
  "contradiction. Only a genuine conflict is.\n\n" +
  "When it is one, name the subject in a few words and give each side's " +
  "position in one plain sentence a reader can act on.";

export interface ContradictReport {
  packs: number;
  /** Vector-close cross-brain pairs found. */
  candidates: number;
  /** Pairs actually sent to the judge (the rest were judged on an earlier run). */
  judged: number;
  /** Judged pairs that turned out to be real conflicts. */
  found: number;
  costCents: number;
}

export async function runContradictions(): Promise<ContradictReport> {
  const report: ContradictReport = {
    packs: 0,
    candidates: 0,
    judged: 0,
    found: 0,
    costCents: 0,
  };

  let budget = MAX_JUDGEMENTS_PER_RUN;
  for (const pack of PACKS) {
    if (budget <= 0) break;
    const one = await contradictionsInPack(pack, budget);
    report.packs++;
    report.candidates += one.candidates;
    report.judged += one.judged;
    report.found += one.found;
    report.costCents += one.costCents;
    budget -= one.judged;
  }

  return report;
}

async function contradictionsInPack(
  pack: Pack,
  budget: number,
): Promise<Omit<ContradictReport, "packs">> {
  const report = { candidates: 0, judged: 0, found: 0, costCents: 0 };

  // The live membership, same query the pack page renders from — a pack whose
  // brains were checked against a stale list would report on a shop window
  // nobody sees.
  const ids = (await brainsIn(pack)).map((b) => b.id);
  if (ids.length < 2) return report;

  const pairs = await duplicatePairs(ids, {
    crossBrain: true,
    maxDistance: CANDIDATE_DISTANCE,
    minAgeHours: MIN_NOTE_AGE_HOURS,
    limit: PAIR_LIMIT,
  });
  report.candidates = pairs.length;

  const fresh = await unjudged(pairs);

  for (const pair of fresh.slice(0, budget)) {
    try {
      const cost = await judge(pair);
      report.judged++;
      report.costCents += cost.costCents;
      if (cost.contradicts) report.found++;
    } catch (err) {
      // One unreadable verdict must not cost the rest of the pack its pass.
      // Nothing is written, so the pair simply comes back as a candidate
      // tomorrow — the same recovery the consolidation pass relies on.
      console.warn(
        `[contradict] ${pack.slug} pair ${pair.a.id}/${pair.b.id} skipped:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return report;
}

/** Pairs no run has judged yet, closest first (duplicatePairs' order). */
async function unjudged(pairs: DuplicatePair[]): Promise<DuplicatePair[]> {
  if (!pairs.length) return [];
  const as = pairs.map((p) => p.a.id);
  const bs = pairs.map((p) => p.b.id);
  const seen = await query<{ note_a: string; note_b: string }>(
    `select note_a, note_b from contradictions
      where (note_a, note_b) in (select * from unnest($1::uuid[], $2::uuid[]))`,
    [as, bs],
  );
  const keys = new Set(seen.map((s) => `${s.note_a}:${s.note_b}`));
  return pairs.filter((p) => !keys.has(`${p.a.id}:${p.b.id}`));
}

export interface Verdict {
  contradicts: boolean;
  subject: string | null;
  claim_a: string | null;
  claim_b: string | null;
}

/**
 * The verdict on one pair, with nothing written down.
 *
 * Split from the row it produces so the prompt can be held against known
 * pairs — a real conflict, a version difference, the same fact twice — without
 * a database or an embedder in the way. A judge that never says yes and a
 * judge that says yes to everything both look like a working pass from the
 * outside; this is how you tell.
 */
export async function judgePair(
  a: Pick<DuplicatePair["a"], "title" | "body">,
  b: Pick<DuplicatePair["b"], "title" | "body">,
): Promise<{ verdict: Verdict; costCents: number }> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE, // Haiku: this is reading comprehension, not research.
    maxTokens: 1000,
    toolName: "save_verdict",
    toolDescription: "Record whether the two notes contradict each other.",
    schema: VERDICT_SCHEMA,
    system: SYSTEM,
    content: [
      {
        type: "text",
        text:
          `<note_a>\n<title>${a.title}</title>\n` +
          `<body>${a.body.slice(0, BODY_CLIP)}</body>\n</note_a>\n\n` +
          `<note_b>\n<title>${b.title}</title>\n` +
          `<body>${b.body.slice(0, BODY_CLIP)}</body>\n</note_b>`,
      },
    ],
  });

  const parsed = verdict.safeParse(raw);
  if (!parsed.success) throw new Error("verdict schema mismatch");
  return { verdict: parsed.data, costCents: costCents(env.MODEL_JUDGE, usage) };
}

async function judge(pair: DuplicatePair): Promise<{ contradicts: boolean; costCents: number }> {
  const { verdict: v, costCents: cost } = await judgePair(pair.a, pair.b);

  // A "yes" with nothing to show for it is a "no": the flag exists to tell a
  // reader what the disagreement is, and one that cannot say lands on the page
  // as an accusation with no evidence.
  const real = v.contradicts && Boolean(v.subject && v.claim_a && v.claim_b);

  await query(
    `insert into contradictions (note_a, note_b, distance, status, subject, claim_a, claim_b)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (note_a, note_b) do nothing`,
    [
      pair.a.id,
      pair.b.id,
      pair.distance,
      real ? "open" : "clear",
      real ? v.subject : null,
      real ? v.claim_a : null,
      real ? v.claim_b : null,
    ],
  );

  return { contradicts: real, costCents: cost };
}
