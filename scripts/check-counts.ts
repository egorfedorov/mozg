/**
 * Does the counter trigger still tell the truth?
 *
 * bump_brain_counts keeps note_count and source_count, and retires an exam
 * score whose corpus has gone. 0071 made the retirement conditional — it runs
 * only when a write could have taken an active note away — which is a real
 * behaviour change on a trigger nothing else tests. A drifted counter puts a
 * wrong number on a storefront; a score that outlives its notes is the one
 * factual claim this product makes, made falsely.
 *
 * Everything happens inside a transaction that is rolled back, so this is safe
 * to run against any database, including production.
 *
 *   npm run check:counts
 */
import { tx, one } from "@/db";
import type { PoolClient } from "pg";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** The brain row as the trigger left it. */
async function read(client: PoolClient, id: string) {
  const { rows } = await client.query<{ note_count: number; score: number | null }>(
    `select note_count, score from brains where id = $1`,
    [id],
  );
  return rows[0];
}

async function main() {
  const owner = await one<{ id: string }>(`select id from "user" order by "createdAt" limit 1`);

  await tx(async (client) => {
    const mk = async (slug: string, parent: string | null) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into brains (owner_id, slug, title, parent_id, score, score_at)
         values ($1, $2, $2, $3, 70, now()) returning id`,
        [owner.id, slug, parent],
      );
      return rows[0].id;
    };
    const addNote = async (brain: string, status = "active") => {
      const { rows } = await client.query<{ id: string }>(
        `insert into notes (brain_id, title, body, status) values ($1, 'n', 'b', $2)
         returning id`,
        [brain, status],
      );
      return rows[0].id;
    };

    const parent = await mk(`zz-check-parent-${Date.now()}`, null);
    const child = await mk(`zz-check-child-${Date.now()}`, parent);

    console.log("\ncounters:");

    const a = await addNote(child);
    const b = await addNote(child);
    check("an insert raises note_count", (await read(client, child)).note_count === 2);

    const pending = await addNote(child, "pending");
    check(
      "a pending note is not counted",
      (await read(client, child)).note_count === 2,
      `got ${(await read(client, child)).note_count}`,
    );

    await client.query(`update notes set status = 'active' where id = $1`, [pending]);
    check("approving a proposal raises it", (await read(client, child)).note_count === 3);

    await client.query(`delete from notes where id = $1`, [pending]);
    check("a delete lowers it", (await read(client, child)).note_count === 2);

    console.log("\nthe score may not outlive its notes:");

    check("a score survives while notes remain", (await read(client, child)).score === 70);

    await client.query(`update notes set status = 'superseded' where id = $1`, [a]);
    check(
      "superseding one of two keeps the score",
      (await read(client, child)).score === 70,
      `note_count ${(await read(client, child)).note_count}`,
    );

    // The last active note leaves by the path an ingest actually uses.
    await client.query(`update notes set status = 'superseded' where id = $1`, [b]);
    const emptied = await read(client, child);
    check("emptying the corpus retires the score", emptied.score === null);
    check("and zeroes the count", emptied.note_count === 0);

    check(
      "the parent's score goes with its last child's notes",
      (await read(client, parent)).score === null,
    );

    // Refilling must NOT hand the score back — it is re-earned at the next
    // sitting, and this is the branch 0071 stopped running on inserts.
    await addNote(child);
    const refilled = await read(client, child);
    check("refilling raises the count again", refilled.note_count === 1);
    check("refilling does not resurrect the score", refilled.score === null);

    throw new Error("rollback");
  }).catch((e: unknown) => {
    if (!(e instanceof Error) || e.message !== "rollback") throw e;
  });

  console.log(failures ? `\n✗ ${failures} failed\n` : "\n✓ the trigger holds\n");
  process.exit(failures ? 1 : 0);
}

main();
