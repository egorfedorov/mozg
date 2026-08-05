/**
 * Give every brain the same exam dimensions.
 *
 *   npm run probes -- --dry            # who is missing anti-bluff probes
 *   npm run probes -- --limit 5        # write probes for five of them, then stop
 *   npm run probes -- --brain svelte   # one brain by slug
 *
 * Negative probes — plausible questions just outside a brain's scope, which it is
 * supposed to refuse — reached the generator after most brains had written their
 * exams. Two thirds of the public catalogue was being graded without them, and
 * those brains average three points higher for it, which makes the scores on the
 * catalogue not comparable to each other. A score is the one factual claim here.
 *
 * Additive: this writes probes beside the existing checks rather than
 * regenerating the exam, so the sitting history (and the diff between sittings)
 * survives. Each brain then gets one exam queued, which is where the number
 * actually moves.
 */
import { query, one } from "@/db";
import type { Brain } from "@/db/types";
import { generateNegativeProbes } from "@/worker/exam";
import { enqueueExam } from "@/worker/queue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const slug = arg("brain");
  const limit = Number(arg("limit") ?? 100);

  const brains = await query<Brain>(
    `select b.* from brains b
      where b.goal is not null
        and ($1::text is null or b.slug = $1)
        and ($1::text is not null or b.visibility = 'public')
        and exists (select 1 from checks c where c.brain_id = b.id and c.enabled)
        and not exists (
          select 1 from checks c
           where c.brain_id = b.id and c.kind = 'negative' and c.enabled
        )
      order by b.score desc nulls last
      limit $2`,
    [slug ?? null, limit],
  );

  if (!brains.length) {
    console.log("\nEvery brain with an exam already has anti-bluff probes.\n");
    process.exit(0);
  }

  console.log(`\n${brains.length} brain(s) graded without anti-bluff probes:\n`);
  for (const b of brains) {
    console.log(`  ${b.slug.padEnd(26)} ${b.score === null ? "—" : `${b.score}%`}`);
  }

  if (dry) {
    console.log("\n(dry run — nothing written)\n");
    process.exit(0);
  }

  console.log("");
  let wrote = 0;
  for (const brain of brains) {
    try {
      const n = await generateNegativeProbes(brain);
      wrote += n;
      // The exam only re-sits when content changes, and adding a check is not a
      // content change — so ask for the sitting explicitly. runExam's own cooldown
      // decides whether it happens now or on the next pass.
      if (n) await enqueueExam(brain.id);
      console.log(`  ${brain.slug.padEnd(26)} +${n} probes${n ? ", exam queued" : ""}`);
    } catch (err) {
      console.error(
        `  ${brain.slug.padEnd(26)} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const left = await one<{ n: number }>(
    `select count(*)::int as n from brains b
      where b.visibility = 'public' and b.goal is not null
        and exists (select 1 from checks c where c.brain_id = b.id and c.enabled)
        and not exists (
          select 1 from checks c where c.brain_id = b.id and c.kind = 'negative' and c.enabled
        )`,
  );
  console.log(`\n${wrote} probes written · ${left.n} public brain(s) still without any\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
