/** One-off recon: which DB, which brains, which owner. Read-only. */
import { query, maybeOne } from "@/db";

async function main() {
  const db = await maybeOne<{ db: string; addr: string | null; port: number | null }>(
    `select current_database() as db, inet_server_addr()::text as addr, inet_server_port() as port`,
  );
  console.log("db:", db);

  const users = await query<{ email: string; handle: string | null; brains: number }>(
    `select u.email, u.handle, count(b.id)::int as brains
       from "user" u left join brains b on b.owner_id = u.id
      group by u.email, u.handle order by brains desc limit 10`,
  );
  console.log("\nusers:");
  for (const u of users) console.log(`  ${u.email}  handle=${u.handle}  brains=${u.brains}`);

  const brains = await query<{
    slug: string; title: string; visibility: string; price_cents: number;
    license: string; score: number | null; note_count: number; parent_id: string | null;
  }>(
    `select slug, title, visibility, price_cents, license, score, note_count, parent_id
       from brains order by parent_id nulls first, slug`,
  );
  console.log(`\nbrains (${brains.length}):`);
  for (const b of brains) {
    console.log(
      `  ${b.parent_id ? "  ↳ " : ""}${b.slug.padEnd(28)} ${b.visibility.padEnd(8)} ` +
      `${(b.price_cents / 100).toFixed(2).padStart(7)}  ${b.license.padEnd(12)} ` +
      `score=${b.score ?? "—"}  notes=${b.note_count}  ${b.title}`,
    );
  }
  process.exit(0);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
