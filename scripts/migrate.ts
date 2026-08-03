/**
 * SQL migration runner. Applies src/db/migrations/*.sql in filename order,
 * once each, inside a transaction.
 *
 *   npm run db:migrate          apply pending
 *   npm run db:reset            drop everything, then apply all
 *
 * Identity tables belong to better-auth — run its CLI first:
 *   npx @better-auth/cli migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "src", "db", "migrations");

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mozg:mozg@localhost:5433/mozg";

async function main() {
  const reset = process.argv.includes("--reset");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    if (reset) {
      console.log("⚠  dropping schema public");
      await client.query("drop schema public cascade; create schema public;");
    }

    await client.query(`
      create table if not exists _migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const authReady = await client.query(`select to_regclass('public."user"') as t`);
    if (!authReady.rows[0].t) {
      console.error(
        '\n✗ better-auth tables are missing (no "user" table).\n' +
          "  Run this first, then re-run the migration:\n\n" +
          "    npx @better-auth/cli migrate\n",
      );
      process.exit(1);
    }

    const applied = new Set(
      (await client.query<{ name: string }>("select name from _migrations")).rows.map(
        (r) => r.name,
      ),
    );

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      process.stdout.write(`→ ${file} `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log("ok");
        count++;
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        throw err;
      }
    }

    console.log(count ? `\n✓ applied ${count} migration(s)` : "\n✓ up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
