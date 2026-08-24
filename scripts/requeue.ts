/**
 * Put sources back on the ingest queue.
 *
 *   npm run requeue -- --brain mcp-spec           # everything not ready
 *   npm run requeue -- --failed                   # every failed source, any brain
 *   npm run requeue -- --brain mcp-spec --reread  # ready sources too, re-extracted
 *   npm run requeue -- --source <uuid> --reread   # exactly one page, re-extracted
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
import { CRAWL_ROOTS_SQL } from "../src/lib/sources";
import { enqueueIngest } from "@/worker/queue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("brain");
  // One source by id. The other two selectors are "a brain" and "everything
  // that failed", and neither can re-read the single page you are actually
  // looking at — checking one prompt change meant re-reading 299 sources or
  // requeuing 41 unrelated failures.
  const id = arg("source");
  const onlyFailed = process.argv.includes("--failed");
  const reread = process.argv.includes("--reread");

  if (!slug && !onlyFailed && !id) {
    console.error("\nPass --brain <slug>, --source <id>, or --failed.\n");
    process.exit(1);
  }
  if (reread && !slug && !id) {
    // Re-reading is a paid re-extraction of every source it touches; "all
    // brains" is a bill nobody meant to run up with one flag.
    console.error("\n--reread needs --brain <slug> or --source <id>.\n");
    process.exit(1);
  }

  const sources = await query<{ id: string; name: string | null; status: string }>(
    `select s.id, coalesce(s.original_name, s.url) as name, s.status
       from sources s join brains b on b.id = s.brain_id
      where ($1::text is null or b.slug = $1)
        and ($4::uuid is null or s.id = $4)
        -- A source asked for by id is asked for by name: none of the filters
        -- below get to decide it is not interesting enough to requeue.
        and ($4::uuid is not null or (
              ($2 = false or s.status in ('failed', 'rejected'))
          and ($3 = true or s.status <> 'ready')
          and s.kind not in ${CRAWL_ROOTS_SQL}))
      order by s.created_at`,
    [slug ?? null, onlyFailed, reread, id ?? null],
  );

  if (!sources.length) {
    console.log("\nnothing to requeue\n");
    process.exit(0);
  }

  console.log(`\nrequeuing ${sources.length} source(s)${reread ? " for a full re-read" : ""}\n`);
  for (const s of sources) {
    if (reread) {
      // The old notes STAY. A re-read that comes back narrower than the
      // original must not be able to lose knowledge — this happened: a
      // focused re-read dropped a brain from 80% to 60% because deletion ran
      // first. New notes supersede their near-duplicates through the normal
      // dedup; genuinely new facts add; old facts nothing replaced survive.
      // Knowledge ratchets up or stays — never silently down.
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
