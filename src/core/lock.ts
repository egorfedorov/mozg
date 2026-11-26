/**
 * A lock between processes.
 *
 * The Stop hook, the MCP server of every open session and the desk server all
 * write to the same files. They take turns through a lock file: created with
 * `wx`, so only one process ever succeeds, and removed afterwards.
 *
 * A lock left by a process that died is stolen after ten seconds. If the wait
 * runs out, the caller goes ahead without the lock: a session-end hook that
 * fails is worse than a write that has to be sorted out afterwards. The store
 * does not depend on winning the race: under the lock it reads the file back
 * before it appends, so a line is never there twice (see store.ts).
 */

import { randomBytes } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Hold a named flag without waiting, for a long job of which only one should
 * run at a time (the background read of every log). Returns the release, or
 * null when another live process holds it. A flag left by a process that died
 * is taken over once it is older than `staleMs`.
 */
export async function tryHold(dir: string, name: string, staleMs = 30 * 60_000): Promise<(() => Promise<void>) | null> {
  const path = join(dir, name);
  // The flag names this particular holding of it, so that a holder whose flag
  // was taken over as dead lets go of nothing when it finishes.
  const token = `${process.pid}:${randomBytes(6).toString("hex")}`;
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(token);
    await handle.close();
  } catch (err) {
    if ((err as { code?: string }).code !== "EEXIST") return null;
    const s = await stat(path).catch(() => null);
    if (!s) return tryHold(dir, name, staleMs);
    if (Date.now() - s.mtimeMs < staleMs) return null;
    await unlink(path).catch(() => {});
    return tryHold(dir, name, staleMs);
  }
  return async () => {
    // Only its own. A holder that ran so long its flag was taken over as dead
    // must not, on finishing, remove the flag of the one that took it.
    const owner = await readFile(path, "utf8").catch(() => "");
    if (owner.trim() === token) await unlink(path).catch(() => {});
  };
}

const STALE_MS = 10_000;
const WAIT_MS = 4_000;

export async function withLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const path = join(dir, "lock");
  const deadline = Date.now() + WAIT_MS;
  let held = false;

  while (!held && Date.now() < deadline) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      held = true;
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err;
      try {
        const s = await stat(path);
        if (Date.now() - s.mtimeMs > STALE_MS) await unlink(path);
      } catch {
        // It went away between the two calls: try again at once.
      }
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
    }
  }

  try {
    return await fn();
  } finally {
    if (held) await unlink(path).catch(() => {});
  }
}
