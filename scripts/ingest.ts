/**
 * Drive the ingest pipeline from the terminal, without the UI or the queue.
 * This is the fastest way to see whether a brain actually learns anything.
 *
 *   npm run ingest -- --brain hud --goal "HUD layout rules" ~/shots/*.png
 *   npm run ingest -- --brain hud --show
 */
import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { query, one, maybeOne } from "@/db";
import type { Brain, Source } from "@/db/types";
import { storage, storageKey } from "@/lib/storage";
import { ingestSource } from "@/worker/ingest";
import { embedHealthy } from "@/lib/embed";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const TEXT_EXT = new Set([".txt", ".md", ".json", ".ts", ".tsx", ".js", ".py", ".sql"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Dev-only owner, so the CLI works before anyone has signed in. */
async function devUser(): Promise<string> {
  const existing = await maybeOne<{ id: string }>(
    `select id from "user" order by "createdAt" limit 1`,
  );
  if (existing) return existing.id;

  const row = await one<{ id: string }>(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt",
                         plan, handle)
     values ('dev-user', 'Dev', 'dev@localhost', true, now(), now(), 'pro', 'dev')
     returning id`,
  );
  console.log("· created dev user");
  return row.id;
}

async function main() {
  const slug = arg("brain");
  if (!slug) throw new Error("--brain <slug> is required");

  const ownerId = await devUser();

  let brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [ownerId, slug],
  );

  if (!brain) {
    brain = await one<Brain>(
      `insert into brains (owner_id, slug, title, goal) values ($1, $2, $3, $4)
       returning *`,
      [ownerId, slug, arg("title") ?? slug, arg("goal") ?? null],
    );
    console.log(`· created brain ${slug}`);
  } else if (arg("goal") && arg("goal") !== brain.goal) {
    await query(`update brains set goal = $2 where id = $1`, [brain.id, arg("goal")]);
    brain.goal = arg("goal")!;
    console.log("· updated goal");
  }

  if (process.argv.includes("--show")) {
    await show(brain);
    return;
  }

  const files = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .filter((a) => a !== slug && a !== arg("goal") && a !== arg("title"));

  if (!files.length) {
    console.log("no files given — nothing to ingest. Use --show to inspect.");
    return;
  }

  if (!(await embedHealthy())) {
    throw new Error("embedding service is down — start services/embed/run.sh");
  }

  console.log(`\ningesting ${files.length} file(s) into "${brain.title}"`);
  if (brain.goal) console.log(`goal: ${brain.goal}\n`);

  let totalNotes = 0;
  let totalCost = 0;

  for (const path of files) {
    const ext = extname(path).toLowerCase();
    const kind = IMAGE_EXT.has(ext) ? "image" : TEXT_EXT.has(ext) ? "text" : "file";
    const body = await readFile(path);
    const key = storageKey(brain.id, basename(path));
    await storage.put(key, body, kind === "image" ? `image/${ext.slice(1)}` : "text/plain");

    const source = await one<Source>(
      `insert into sources (brain_id, kind, storage_key, original_name, bytes)
       values ($1, $2, $3, $4, $5) returning *`,
      [brain.id, kind, key, basename(path), body.length],
    );

    process.stdout.write(`  ${basename(path).padEnd(38).slice(0, 38)} `);
    try {
      const result = await ingestSource(source.id);
      totalNotes += result.notes;
      totalCost += result.costCents ?? 0;

      if (result.status === "rejected") {
        console.log(`REJECTED — ${result.findings?.length} secret(s)`);
        for (const f of result.findings ?? []) {
          console.log(`      line ${f.line}: ${f.label} → ${f.sample}`);
        }
      } else {
        console.log(`${result.notes} notes  ${(result.costCents ?? 0).toFixed(2)}¢`);
      }
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${totalNotes} notes, ${totalCost.toFixed(1)}¢ total`);
  await show(brain);
}

async function show(brain: Brain) {
  const notes = await query<{ category: string; n: number }>(
    `select coalesce(category, '—') as category, count(*)::int as n
       from notes where brain_id = $1 and status = 'active'
      group by 1 order by 2 desc`,
    [brain.id],
  );

  const totals = await one<{ notes: number; chunks: number; superseded: number }>(
    `select
       (select count(*)::int from notes where brain_id = $1 and status = 'active') as notes,
       (select count(*)::int from chunks where brain_id = $1) as chunks,
       (select count(*)::int from notes where brain_id = $1 and status = 'superseded') as superseded`,
    [brain.id],
  );

  console.log(`\n${brain.title} — ${totals.notes} notes, ${totals.chunks} chunks` +
    (totals.superseded ? `, ${totals.superseded} superseded` : ""));
  for (const row of notes) console.log(`  ${String(row.n).padStart(4)}  ${row.category}`);

  const sample = await query<{ title: string; category: string }>(
    `select title, coalesce(category,'—') as category from notes
      where brain_id = $1 and status = 'active'
      order by created_at desc limit 8`,
    [brain.id],
  );
  if (sample.length) {
    console.log("\nlatest notes:");
    for (const n of sample) console.log(`  · [${n.category}] ${n.title}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
