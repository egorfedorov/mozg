/**
 * Why did the exam fail?
 *
 * Two very different causes look identical in the score:
 *   retrieval — the answer is in the brain, search did not surface it
 *   content   — the answer is not in the brain at all
 *
 * The fix differs completely (better ranking vs more sources), so guessing is
 * expensive. For each failed check this re-runs the search with a wide net and
 * reports whether the expected answer was in reach but ranked too low.
 *
 *   npm run diagnose -- --brain design
 */
import { query, one } from "@/db";
import type { Brain, Check } from "@/db/types";
import { searchBrain } from "@/lib/search";

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

  const retrieval: Check[] = [];
  const content: Check[] = [];

  for (const check of failed) {
    // Deliberately wider than the exam uses: if the answer shows up here but
    // not in the top 5, that is a ranking problem, not a missing note.
    const { hits } = await searchBrain(brain.id, check.question, { limit: 25 });

    const rank = hits.findIndex((h) => covers(`${h.title} ${h.excerpt}`, check.expect));

    if (rank >= 0) {
      retrieval.push(check);
      console.log(`  RETRIEVAL  ${check.question}`);
      console.log(`             answer was at rank ${rank + 1} of ${hits.length}`);
      console.log(`             "${hits[rank].title}"\n`);
    } else {
      content.push(check);
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  retrieval problems: ${retrieval.length}  (answer present, ranked too low)`);
  console.log(`  content gaps:       ${content.length}  (answer not in the brain)`);
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

  console.log(
    retrieval.length > content.length
      ? "\n→ retrieval is the cap. A reranker would pay for itself."
      : "\n→ content is the cap. A reranker would change almost nothing;" +
          " the brain needs more sources.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
