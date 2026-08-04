/**
 * Why did the exam fail?
 *
 * Four very different causes look identical in the score:
 *   thin         — the judge was shown a related note and it did not answer
 *   retrieval    — the answer is in the brain but ranked below what the exam sees
 *   missing      — the answer is not in the brain at all
 *   hallucination — a negative (out-of-scope) probe the brain answers
 *                   confidently: it bluffs instead of refusing
 *
 * The fix differs completely — rewrite or deepen the note, improve ranking,
 * add sources, or STOP covering a neighbouring topic — so guessing is
 * expensive. The distinction that matters is the exam's own retrieval depth:
 * anything the judge already saw and still failed is not a ranking problem,
 * whatever a wider search turns up.
 *
 *   npm run diagnose -- --brain design
 */
import { query, one } from "@/db";
import type { Brain, Check } from "@/db/types";
import { searchBrain } from "@/lib/search";
import { familyIds } from "@/lib/families";

/** What runExam shows the judge. Anything inside this was already seen. */
const EXAM_DEPTH = 5;
/** How far down to look before calling something absent. */
const WIDE = 25;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Crude lexical overlap: enough to tell "present but unranked" from "absent". */
function covers(text: string, expect: string): boolean {
  const terms = expect
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (!terms.length) return false;
  const hay = text.toLowerCase();
  const hits = terms.filter((t) => hay.includes(t)).length;
  return hits / terms.length >= 0.5;
}

async function main() {
  const slug = arg("brain") ?? "design";
  const brain = await one<Brain>(`select * from brains where slug = $1`, [slug]);

  const failed = await query<Check & { reason: string }>(
    `select c.*, r.reason
       from check_results r
       join checks c on c.id = r.check_id
      where r.run_id = (
        select id from check_runs where brain_id = $1 and status = 'done'
        order by started_at desc limit 1
      ) and not r.passed
      order by c.category`,
    [brain.id],
  );

  if (!failed.length) {
    console.log("no failed checks in the latest run");
    return;
  }

  console.log(`${failed.length} failed checks in "${brain.title}"\n`);

  const thin: Check[] = [];
  const retrieval: Check[] = [];
  const content: Check[] = [];
  const hallucination: Check[] = [];

  // The exam is scored on what the judge is shown, so the same scope has to be
  // used here or the diagnosis describes a different system.
  const scope = await familyIds(brain);

  for (const check of failed) {
    // A failed negative probe is not a content problem: the brain holds
    // material that lets it bluff through a question it should refuse.
    // Adding material would make it worse, so these get their own bucket.
    if (check.kind === "negative") {
      hallucination.push(check);
      console.log(`  HALLUCINATION  ${check.question}`);
      console.log(`                 out-of-scope probe, but the brain answers it confidently — it bluffs\n`);
      continue;
    }

    const { hits } = await searchBrain(scope, check.question, { limit: WIDE });
    const rank = hits.findIndex((h) => covers(`${h.title} ${h.excerpt}`, check.expect));

    if (rank < 0) {
      content.push(check);
      continue;
    }

    if (rank < EXAM_DEPTH) {
      // The judge already had this passage in front of it and failed the check
      // anyway. Reranking cannot help; the note itself does not answer.
      thin.push(check);
      console.log(`  THIN       ${check.question}`);
      console.log(`             judge saw "${hits[rank].title}" at rank ${rank + 1} and still failed it\n`);
    } else {
      retrieval.push(check);
      console.log(`  RETRIEVAL  ${check.question}`);
      console.log(`             answer was at rank ${rank + 1}, below the ${EXAM_DEPTH} the exam sees`);
      console.log(`             "${hits[rank].title}"\n`);
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  thin notes:         ${thin.length}  (judge saw it, it did not answer)`);
  console.log(`  retrieval problems: ${retrieval.length}  (present, ranked below the exam's ${EXAM_DEPTH})`);
  console.log(`  missing material:   ${content.length}  (not in the brain at all)`);
  console.log(`  hallucinations:     ${hallucination.length}  (out-of-scope probes the brain bluffs through)`);
  console.log(`${"─".repeat(70)}\n`);

  if (content.length) {
    console.log("missing material, by category:");
    const byCategory = new Map<string, number>();
    for (const c of content) {
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    }
    for (const [cat, n] of [...byCategory].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${cat}`);
    }
  }

  // Name the largest cause, and say what actually fixes it. The point of this
  // script is to stop the wrong thing being built.
  const worst = Math.max(thin.length, retrieval.length, content.length, hallucination.length);
  if (worst === hallucination.length) {
    console.log(
      "\n→ bluffing is the cap. The brain answers questions outside its scope\n" +
        "  instead of refusing them. The material that lets it bluff is the\n" +
        "  problem — do NOT add more; consider trimming or flagging the notes\n" +
        "  that answer those probes.",
    );
  } else if (worst === thin.length) {
    console.log(
      "\n→ the notes are the cap. Search finds the right material and it does not\n" +
        "  answer the question — the source is vague, or extraction summarised away\n" +
        "  the specifics. Feed the primary material, not a description of it.\n" +
        "  A reranker would change nothing here.",
    );
  } else if (worst === retrieval.length) {
    console.log(
      "\n→ retrieval is the cap. The answers are in the brain but rank below the\n" +
        `  ${EXAM_DEPTH} passages the exam sees. A reranker would pay for itself.`,
    );
  } else {
    console.log(
      "\n→ material is the cap. The answers are not in the brain at all;\n" +
        "  the categories above name what to add.",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
