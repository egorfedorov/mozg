/**
 * Put sources back on the ingest queue.
 *
 *   npm run requeue -- --brain mcp-spec        # everything not ready
 *   npm run requeue -- --failed                # every failed source, any brain
 *
 * Resetting a source's status in SQL does not re-run it: the queue job was
 * consumed when it first ran, and the row is only a record of the outcome.
 * This does both — which is the whole reason it exists as a script rather than
 * as an UPDATE somebody remembers to pair with an enqueue.
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

  if (!slug && !onlyFailed) {
    console.error("\nPass --brain <slug>, or --failed.\n");
    process.exit(1);
  }

  const sources = await query<{ id: string; name: string | null; status: string }>(
    `select s.id, coalesce(s.original_name, s.url) as name, s.status
       from sources s join brains b on b.id = s.brain_id
      where ($1::text is null or b.slug = $1)
        and ($2 = false or s.status in ('failed', 'rejected'))
        and s.status <> 'ready'
      order by s.created_at`,
    [slug ?? null, onlyFailed],
  );

  if (!sources.length) {
    console.log("\nnothing to requeue\n");
    process.exit(0);
  }

  console.log(`\nrequeuing ${sources.length} source(s)\n`);
  for (const s of sources) {
    await query(
      `update sources set status = 'queued', error = null, reject_reason = null,
              findings = null, note_count = 0
        where id = $1`,
      [s.id],
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
