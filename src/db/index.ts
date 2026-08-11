import { Pool, type PoolClient } from "pg";
import { env } from "@/lib/env";

/**
 * One pool for the whole process. Next dev-mode reloads modules, so stash it on
 * globalThis or you leak a pool per hot reload until Postgres runs out of slots.
 */
const globalForDb = globalThis as unknown as { _mozgPool?: Pool };

export const pool =
  globalForDb._mozgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb._mozgPool = pool;

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

/** Exactly-zero-or-one row. Throws if the query returned more than one. */
export async function maybeOne<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  if (rows.length > 1) {
    throw new Error(`Expected at most 1 row, got ${rows.length}`);
  }
  return rows[0] ?? null;
}

/**
 * Is there any such row?
 *
 * Its own function because the obvious spelling is wrong: a dozen call sites
 * asked `maybeOne("select 1 from … where …")`, which throws "Expected at most
 * 1 row, got 2" the moment a second row exists — and for an existence check
 * the second row is the least surprising thing in the world. It took down an
 * exam (two sittings inside the cooldown window) and stood between a reader
 * and a brain they had paid for twice over.
 *
 * Pass the query without a limit; this adds it.
 */
export async function exists(text: string, params: unknown[] = []): Promise<boolean> {
  const rows = await query(`${text}\nlimit 1`, params);
  return rows.length > 0;
}

/** Exactly one row. Throws if zero. */
export async function one<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T> {
  const row = await maybeOne<T>(text, params);
  if (!row) throw new Error("Expected 1 row, got 0");
  return row;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** pgvector wants '[1,2,3]' as a string literal, not a JS array. */
export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}
