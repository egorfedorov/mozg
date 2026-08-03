/**
 * Prove the maintenance pass does the one thing that matters: notice a page
 * changed, stop answering from the old version, and pay a model only when
 * something actually moved.
 *
 *   npm run check:refresh
 *
 * Uses a real fetch of a stable page. The "changed" case is simulated by
 * corrupting the stored hash, which is exactly what a rewritten page looks
 * like from this side and needs no cooperating server.
 */
import { one, query, maybeOne, toVector } from "@/db";
import { refreshUrlSources, examStaleBrains } from "@/worker/maintenance";
import { contentHash } from "@/lib/page";

const PAGE = process.env.REFRESH_PAGE ?? "https://example.com/";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const owner = await maybeOne<{ id: string }>(
    `select id from "user" order by "createdAt" limit 1`,
  );
  if (!owner) {
    console.log("\n✗ no accounts — sign in once first\n");
    process.exit(1);
  }

  console.log("\nsetting up a brain with one page in it");
  const brain = await one<{ id: string }>(
    `insert into brains (owner_id, slug, title, goal, topic)
     values ($1, 'check-refresh', 'Check refresh', 'Answer from one page.', 'devops')
     on conflict (owner_id, slug) do update set goal = excluded.goal
     returning id`,
    [owner.id],
  );
  await query(`delete from sources where brain_id = $1`, [brain.id]);
  await query(`delete from notes where brain_id = $1`, [brain.id]);

  const source = await one<{ id: string }>(
    `insert into sources (brain_id, kind, url, original_name, status, note_count)
     values ($1, 'url', $2, 'example', 'ready', 1) returning id`,
    [brain.id, PAGE],
  );

  // One note as if ingest had produced it, with a chunk so search can see it.
  const note = await one<{ id: string }>(
    `insert into notes (brain_id, source_id, title, body, category, status)
     values ($1, $2, 'From the page', 'Whatever the page said last time.', 'x', 'active')
     returning id`,
    [brain.id, source.id],
  );
  await query(
    `insert into chunks (brain_id, note_id, content, token_count, embedding)
     values ($1, $2, 'Whatever the page said last time.', 8, $3::vector)`,
    [brain.id, note.id, toVector(new Array(1024).fill(0.01))],
  );

  console.log("\nfirst pass — a source that predates fingerprints");
  const first = await refreshUrlSources(5);
  check("it fetched the page", first.checked >= 1, JSON.stringify(first));
  check("it adopted rather than re-read", first.adopted >= 1, `adopted=${first.adopted}`);

  const afterFirst = await one<{
    content_hash: string | null;
    status: string;
    refresh_count: number;
  }>(`select content_hash, status, refresh_count from sources where id = $1`, [source.id]);
  check("the hash was stored", Boolean(afterFirst.content_hash), afterFirst.content_hash?.slice(0, 12));
  check("the source was left ready", afterFirst.status === "ready", afterFirst.status);

  const kept = await query<{ n: number }>(
    `select count(*)::int as n from chunks where note_id = $1`,
    [note.id],
  );
  check("its existing notes still answer", kept[0].n === 1, `${kept[0].n} chunk(s)`);

  console.log("\nsecond pass — nothing changed");
  await query(
    `update sources set checked_at = now() - interval '30 days' where id = $1`,
    [source.id],
  );
  const second = await refreshUrlSources(5);
  check("it checked the page again", second.checked >= 1, JSON.stringify(second));
  check("an unchanged page is not re-ingested", second.unchanged >= 1, `unchanged=${second.unchanged}`);
  check("and nothing was marked changed", second.changed === 0, `changed=${second.changed}`);

  console.log("\nthird pass — the page moved under us");
  await query(
    `update sources set content_hash = $2, checked_at = now() - interval '30 days'
      where id = $1`,
    [source.id, contentHash("something else entirely")],
  );
  const third = await refreshUrlSources(5);
  check("a different hash counts as changed", third.changed >= 1, `changed=${third.changed}`);

  const afterChange = await one<{ status: string; refresh_count: number }>(
    `select status, refresh_count from sources where id = $1`,
    [source.id],
  );
  check("the source was requeued for re-reading", afterChange.status === "queued", afterChange.status);
  check("the refresh was counted", afterChange.refresh_count === 1, String(afterChange.refresh_count));

  const gone = await query<{ n: number }>(
    `select count(*)::int as n from chunks where note_id = $1`,
    [note.id],
  );
  check("the stale note stopped being searchable", gone[0].n === 0, `${gone[0].n} chunks left`);

  const superseded = await one<{ status: string; superseded_reason: string | null }>(
    `select status, superseded_reason from notes where id = $1`,
    [note.id],
  );
  check(
    "the stale note is superseded, not deleted",
    superseded.status === "superseded" && Boolean(superseded.superseded_reason),
    superseded.superseded_reason ?? "no reason",
  );

  console.log("\nnot due yet");
  await query(`update sources set status = 'ready', checked_at = now() where id = $1`, [
    source.id,
  ]);
  const fourth = await refreshUrlSources(5);
  check(
    "a page checked just now is skipped",
    !JSON.stringify(fourth).includes('"checked":1') || fourth.checked === 0,
    JSON.stringify(fourth),
  );

  console.log("\nstale exams");
  await query(
    `update brains set content_changed_at = now(), score_at = now() - interval '1 day',
            note_count = 3 where id = $1`,
    [brain.id],
  );
  const stale = await examStaleBrains(20);
  check("a brain that learned since its exam is queued", stale.includes(brain.id));

  await query(
    `update brains set content_changed_at = now() - interval '1 day', score_at = now()
      where id = $1`,
    [brain.id],
  );
  const fresh = await examStaleBrains(20);
  check("a brain examined after its last change is left alone", !fresh.includes(brain.id));

  console.log("\ncleaning up");
  await query(`delete from brains where id = $1`, [brain.id]);
  console.log("  removed the scratch brain");

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : "\n✓ brains keep themselves honest\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
