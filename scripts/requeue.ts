/**
 * Put sources back on the ingest queue.
 *
 *   npm run requeue -- --brain mcp-spec           # everything not ready
 *   npm run requeue -- --failed                   # every failed source, any brain
 *   npm run requeue -- --brain mcp-spec --reread  # ready sources too, re-extracted
 *
 * Resetting a source's status in SQL does not re-run it: the queue job was
 * consumed when it first ran, and the row is only a record of the outcome.
 * This does both — which is the whole reason it exists as a script rather than
 * as an UPDATE somebody remembers to pair with an enqueue.
 *
 * --reread exists because extraction caches its payload on the source row (a
 * retry must not buy the same extraction twice) — so a change to the
 * extraction prompt reaches nothing until the cache is dropped. This is the
 * deliberate way to drop it: notes from the source are removed and the source
 * is read again from scratch with the current prompt, at the usual cost.
 */
import { query } from "@/db";
import { enqueueIngest } from "@/worker/queue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("brain");
  const onlyFailed = process.argv.includes("--failed");
  const reread = process.argv.includes("--reread");

  if (!slug && !onlyFailed) {
    console.error("\nPass --brain <slug>, or --failed.\n");
    process.exit(1);
  }
  if (reread && !slug) {
    // Re-reading is a paid re-extraction of every source it touches; "all
    // brains" is a bill nobody meant to run up with one flag.
    console.error("\n--reread needs --brain <slug>.\n");
    process.exit(1);
  }

  const sources = await query<{ id: string; name: string | null; status: string }>(
    `select s.id, coalesce(s.original_name, s.url) as name, s.status
       from sources s join brains b on b.id = s.brain_id
      where ($1::text is null or b.slug = $1)
        and ($2 = false or s.status in ('failed', 'rejected'))
        and ($3 = true or s.status <> 'ready')
        and s.kind <> 'site'
      order by s.created_at`,
    [slug ?? null, onlyFailed, reread],
  );

  if (!sources.length) {
    console.log("\nnothing to requeue\n");
    process.exit(0);
  }

  console.log(`\nrequeuing ${sources.length} source(s)${reread ? " for a full re-read" : ""}\n`);
  for (const s of sources) {
    if (reread) {
      // Drop what the old prompt produced, or the brain keeps the summaries
      // next to the verbatim rewrite. The cached payload goes with it — that
      // cache is exactly what pins a source to the prompt it was read with.
      await query(`delete from notes where source_id = $1`, [s.id]);
    }
    await query(
      `update sources set status = 'queued', error = null, reject_reason = null,
              findings = null, note_count = 0,
              extract_payload = case when $2 then null else extract_payload end
        where id = $1`,
      [s.id, reread],
    );
    await enqueueIngest(s.id);
    console.log(`  ${s.status.padEnd(10)} → queued   ${s.name ?? s.id}`);
  }

  console.log("\nthe worker picks them up within a few seconds.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
