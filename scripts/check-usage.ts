/**
 * Prove the usage→exam loop: a real search that found nothing becomes exactly
 * one exam check, and running the sync again adds nothing.
 *
 *   npm run check:usage
 *
 * Uses a synthetic call row against the oldest brain, and removes everything
 * it created — safe to run against any environment.
 */
import { one, query } from "@/db";
import { familyIds } from "@/lib/families";
import { syncUsageChecks } from "@/worker/exam";
import type { Brain } from "@/db/types";

const Q = "mozg self-test: how do wilds interact with the tumble mechanic";

async function main() {
  const brain = await one<Brain>(`select * from brains order by created_at limit 1`);
  const user = await one<{ id: string }>(`select id from "user" limit 1`);

  await query(`delete from checks where brain_id = $1 and question = $2`, [brain.id, Q]);
  await query(
    `insert into calls (brain_id, caller_id, tool, query, results, ok)
     values ($1, $2, 'brain_search', $3, 0, true)`,
    [brain.id, user.id, Q],
  );

  try {
    const scope = await familyIds(brain);
    const first = await syncUsageChecks(brain, scope);
    const second = await syncUsageChecks(brain, scope);
    const rows = await query<{ origin: string; category: string }>(
      `select origin, category from checks where brain_id = $1 and question = $2`,
      [brain.id, Q],
    );
    if (first < 1 || second !== 0 || rows.length !== 1 || rows[0].origin !== "usage") {
      throw new Error(
        `usage loop broken: first=${first} second=${second} rows=${JSON.stringify(rows)}`,
      );
    }
    console.log("✓ a zero-hit search became exactly one exam check, idempotently");
  } finally {
    await query(`delete from checks where brain_id = $1 and question = $2`, [brain.id, Q]);
    await query(`delete from calls where brain_id = $1 and query = $2`, [brain.id, Q]);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
