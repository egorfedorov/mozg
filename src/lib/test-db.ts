import { pool } from "@/db";

/**
 * Test stub for @/db. Node 20 has no module mocking in node:test, so this
 * shadows the pool's own methods instead — query/maybeOne/tx all go through
 * `pool.query` / `pool.connect`, so every module that imports @/db sees the
 * stub. Each test file runs in its own process, so stubs never leak across
 * files; within a file, call stubDb again to replace the handler.
 *
 * The handler returns the rows a real Postgres would have returned; rowCount
 * defaults to rows.length. Throw from it on a query the test did not expect —
 * a silent `[]` is how a test starts passing against the wrong SQL.
 */
export function stubDb(handler: (text: string, params: unknown[]) => object[]): void {
  const run = (text: string, params: unknown[] = []) => {
    const rows = handler(text, params);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  };

  const client = {
    query: (text: string, params?: unknown[]) => {
      // tx() issues begin/commit/rollback on the client — answer those
      // directly, route everything else through the handler.
      if (/^\s*(begin|commit|rollback)\s*$/i.test(text)) {
        return Promise.resolve({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] });
      }
      return Promise.resolve(run(text, params));
    },
    release: () => {},
  };

  pool.query = run as never;
  pool.connect = (() => Promise.resolve(client)) as never;
}
