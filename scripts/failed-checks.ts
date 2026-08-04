/** Show failed checks of the latest exam run for a brain, with judge reasons. */
import { query } from "@/db";

async function main() {
  const i = process.argv.indexOf("--brain");
  const slug = i >= 0 ? process.argv[i + 1] : undefined;
  if (!slug) throw new Error("--brain <slug> required");

  const rows = await query<{
    category: string; question: string; expect: string; reason: string | null;
  }>(
    `select c.category, c.question, c.expect, r.reason
       from check_results r
       join checks c on c.id = r.check_id
       join check_runs run on run.id = r.run_id
       join brains b on b.id = run.brain_id
      where b.slug = $1 and not r.passed
        and run.id = (select id from check_runs where brain_id = b.id
                       order by started_at desc limit 1)
      order by c.category, c.question`,
    [slug],
  );

  console.log(`\n${rows.length} failed check(s) in "${slug}":\n`);
  for (const r of rows) {
    console.log(`[${r.category}]`);
    console.log(`Q:      ${r.question}`);
    console.log(`EXPECT: ${r.expect.slice(0, 220)}`);
    console.log(`REASON: ${(r.reason ?? "").slice(0, 220)}\n`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
