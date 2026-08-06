/**
 * Does a brain's history read back?
 *
 * brain_timeline (0072) is a view over five tables, so nothing about it is
 * checked by the type system: a column in the wrong slot of one UNION branch
 * is a silent lie about what happened, in the exact place a buyer looks to
 * decide whether a brain is maintained.
 *
 * Read-only. Safe against production.
 *
 *   npm run check:timeline
 */
import { query, maybeOne } from "@/db";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const KINDS = [
  "note_added",
  "note_proposed",
  "note_superseded",
  "source_added",
  "source_changed",
  "exam_sat",
];

async function main() {
  const brain = await maybeOne<{ id: string; slug: string; n: number }>(
    `select b.id, b.slug, count(t.*)::int as n
       from brains b join brain_timeline t on t.brain_id = b.id
      group by b.id, b.slug order by n desc limit 1`,
  );
  if (!brain) {
    console.log("\nno brain has any history yet — nothing to check\n");
    process.exit(0);
  }
  console.log(`\n${brain.slug}: ${brain.n} events`);

  const rows = await query<{ kind: string; at: string; title: string | null; value: number | null }>(
    `select kind, at, title, value from brain_timeline
      where brain_id = $1 order by at desc limit 400`,
    [brain.id],
  );

  check("the stream returns rows", rows.length > 0);
  check(
    "every row is dated",
    rows.every((r) => r.at !== null),
    `${rows.filter((r) => r.at === null).length} without a date`,
  );
  check(
    "every kind is one we declared",
    rows.every((r) => KINDS.includes(r.kind)),
    [...new Set(rows.map((r) => r.kind).filter((k) => !KINDS.includes(k)))].join(", "),
  );
  check(
    "newest first",
    rows.every((r, i) => i === 0 || new Date(rows[i - 1].at) >= new Date(r.at)),
  );

  // The one number each kind carries has to be the right one: a score reads
  // 0-100, a retired-note count never goes negative.
  const scores = rows.filter((r) => r.kind === "exam_sat");
  check(
    "an exam carries its score",
    scores.every((r) => r.value !== null && r.value >= 0 && r.value <= 100),
    `${scores.length} sittings`,
  );
  const changes = rows.filter((r) => r.kind === "source_changed");
  check(
    "a refresh carries how many notes it retired",
    changes.every((r) => r.value !== null && r.value >= 0),
    `${changes.length} refreshes`,
  );

  // The stream must not invent or lose notes: what it calls note_added for
  // this brain is what the notes table holds for it.
  const added = await query<{ n: number }>(
    `select count(*)::int as n from brain_timeline
      where brain_id = $1 and kind = 'note_added'`,
    [brain.id],
  );
  const real = await query<{ n: number }>(
    `select count(*)::int as n from notes
      where brain_id = $1 and status not in ('pending', 'rejected')`,
    [brain.id],
  );
  check(
    "every note that ever joined is in the stream exactly once",
    added[0].n === real[0].n,
    `stream ${added[0].n}, notes ${real[0].n}`,
  );

  console.log(failures ? `\n✗ ${failures} failed\n` : "\n✓ the history reads back\n");
  process.exit(failures ? 1 : 0);
}

main();
