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

/**
 * Fresh candidate pairs pulled per pack. Fresh, not total: the judged ones are
 * excluded inside the query, so this is how much work a run may find, not how
 * far into the pack it can ever see. The first prod pass made the difference
 * concrete — 200 candidates against a budget of 40 meant the same 200 came
 * back every night until all were judged, and the 201st never came at all.
 */
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
 * `npm run judge:eval` holds it against eight known pairs — three real
 * conflicts and five lookalikes, three of which this judge actually got wrong
 * on the live pack page. Run it before touching a word of this. 8/8 twice on
 * haiku-4-5 (2026-08-12, ~1.5¢ a run).
 *
 * The last two bullets of the negative list were added to that run and are
 * load-bearing: without them the judge flagged "Executables handles the win
 * types" against "Executables inherits them, including the win types", and a
 * note that mentioned one extra loop against one that did not. Both are the
 * same failure — a difference in where a thing comes from, or in how much of
 * the procedure is written down, read as a disagreement about what to do.
 *
 * What did NOT work, so nobody spends the afternoon again: making the judge
 * name the divergent action an agent would take, as a required field, and
 * refusing any verdict that could not. It scored 6/8 — the model rationalises
 * one ("an agent would either implement it here or look for it in the parent")
 * rather than concluding there is none. Asking it to justify a yes makes it
 * better at justifying, not better at saying no. The negative list is doing
 * the work, and shortening it is how the page starts crying wolf.
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
  "- one says a class or module does something and the other says it " +
  "inherits, delegates or gets it from elsewhere — the behaviour is the same " +
  "and only its origin is described differently;\n" +
  "- one gives more of a procedure than the other — an extra step, loop, " +
  "condition or reason — without denying anything the other says;\n" +
  "- you are unsure.\n\n" +
  "Two notes can cover the same topic and both be true. That is not a " +
  "contradiction. Only a genuine conflict is.\n\n" +
  "When it is one, name the subject in a few words and give each side's " +
  "position in one plain sentence a reader can act on.";

/**
 * Words carrying no claim. Deliberately short, and deliberately without a
 * single negation, quantity or comparison in it — "not", "never", "only",
 * "all", "must", "more" are the words a real disagreement is usually made of,
 * and dropping them is how a filter meant to catch echoes starts eating the
 * conflicts it exists beside.
 */
const FILLER = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "and", "but", "or", "though", "although", "however", "while", "whereas",
  "it", "its", "this", "that", "these", "those", "there",
  "in", "on", "at", "of", "to", "for", "from", "by", "with", "as",
  "does", "do", "did", "has", "have", "had", "used", "uses", "using",
  "function", "when", "if", "which", "whether", "also", "then", "so",
]);

/** Anything whose presence on one side alone is a real difference. */
const DECISIVE = /^(no|not|never|none|cannot|can't|don't|doesn't|isn't|won't|must|forbidden|required|optional|\d[\d.,%x]*)$/;

function words(claim: string): string[] {
  return claim
    .toLowerCase()
    .replace(/[^a-z0-9_.%]+/g, " ")
    .split(" ")
    .filter((w) => w && !FILLER.has(w));
}

/**
 * Two claims that are the same claim, one of them said more fully.
 *
 * The judge's own worst mistake, and the one it made on the pack page: it
 * flagged "run_freespin() is used in sample games" against "run_freespin() is
 * used in ALL sample games" as a disagreement about some-versus-all. Nobody
 * disagreed. One sentence was simply more complete than the other, and a page
 * whose whole argument is "we do not cry wolf" printed it as a conflict.
 *
 * The test is containment rather than similarity, and that distinction is the
 * whole safety of it: a genuine conflict is two sentences that are nearly
 * identical *and each carry a word the other lacks* — 5 against 10, required
 * against optional, do against do not. Those are never a subset. Only a side
 * that adds and never contradicts is dropped, and even then not when what it
 * adds is a negation, a number or a "must", which is where a swap hides.
 *
 * Run on the verdict's own claims, not on the note bodies: the judge has
 * already said what it thinks each side's position is, and if those two
 * positions do not differ then whatever it saw in the bodies did not survive
 * into anything a reader could act on.
 */
export function sameClaim(a: string, b: string): boolean {
  const [wa, wb] = [new Set(words(a)), new Set(words(b))];
  const extra = (x: Set<string>, y: Set<string>) => [...x].filter((w) => !y.has(w));
  const onlyA = extra(wa, wb);
  const onlyB = extra(wb, wa);
  if (onlyA.length && onlyB.length) return false;
  if (!wa.size || !wb.size) return false;
  return ![...onlyA, ...onlyB].some((w) => DECISIVE.test(w));
}

export interface ContradictReport {
  packs: number;
  /** Vector-close cross-brain pairs found. */
  candidates: number;
  /** Pairs actually sent to the judge (the rest were judged on an earlier run). */
  judged: number;
  /** Judged pairs that turned out to be real conflicts. */
  found: number;
  /** Already-published conflicts retracted as echoes by this pass. */
  retracted: number;
  costCents: number;
}

export async function runContradictions(): Promise<ContradictReport> {
  const report: ContradictReport = {
    packs: 0,
    candidates: 0,
    judged: 0,
    found: 0,
    retracted: await retractEchoes(),
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

/**
 * Close the ones already on the page that were never a disagreement.
 *
 * The filter below is new; the rows it would have stopped are live. Re-judging
 * them would cost a model call each to be told what a set comparison answers
 * for nothing, and leaving them is worse than either — a false conflict on the
 * sales page is the one bug that argues against the product while it sits
 * there. So every open row is re-read on each pass. It is a handful of rows
 * and no tokens, and it self-heals the day the filter is tightened again.
 */
async function retractEchoes(): Promise<number> {
  const open = await query<{ id: string; claim_a: string; claim_b: string }>(
    `select id, claim_a, claim_b from contradictions
      where status = 'open' and claim_a is not null and claim_b is not null`,
  );
  const echoes = open.filter((c) => sameClaim(c.claim_a, c.claim_b)).map((c) => c.id);
  if (!echoes.length) return 0;
  await query(`update contradictions set status = 'clear' where id = any($1::uuid[])`, [
    echoes,
  ]);
  return echoes.length;
}

async function contradictionsInPack(
  pack: Pack,
  budget: number,
): Promise<Omit<ContradictReport, "packs" | "retracted">> {
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
    skipPairs: await judgedIn(ids),
  });
  report.candidates = pairs.length;

  for (const pair of pairs.slice(0, budget)) {
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

/**
 * Every pair already judged for these brains, whatever the verdict.
 *
 * Both sides of a stored pair are in the pack by construction, so joining on
 * one of them is enough. Cheap to send back down as a skip list — a pack that
 * has been running for a year holds a few thousand of these, against a kNN
 * that visits every chunk it owns.
 */
async function judgedIn(brainIds: string[]): Promise<[string, string][]> {
  const rows = await query<{ note_a: string; note_b: string }>(
    `select c.note_a, c.note_b
       from contradictions c
       join notes a on a.id = c.note_a
      where a.brain_id = any($1::uuid[])`,
    [brainIds],
  );
  return rows.map((r) => [r.note_a, r.note_b]);
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
  // as an accusation with no evidence. And a "yes" whose two sides say the
  // same thing is a "no" for the same reason — see sameClaim.
  const real =
    v.contradicts &&
    Boolean(v.subject && v.claim_a && v.claim_b) &&
    !sameClaim(v.claim_a!, v.claim_b!);

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
