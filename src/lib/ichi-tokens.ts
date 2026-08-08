import { createHash, randomBytes } from "node:crypto";
import { maybeOne, query } from "@/db";

/**
 * ichi's MCP tokens, issued from here.
 *
 * ichi shares this database and this account but keeps its tables in an `ichi`
 * schema. Tokens are minted and revoked in one place — the account page — so
 * a person managing access does not have to remember which product owns which
 * credential. ichi's own console no longer issues them.
 *
 * ═══ The contract, written down because it is duplicated ═══
 *
 * These five facts must match ichi's src/lib/tokens.ts exactly, or this mints
 * strings its own server will reject:
 *
 *   1. the prefix is "ichi_"
 *   2. 24 random bytes, base64url
 *   3. the stored hash is SHA-256, hex
 *   4. `prefix` is the first 12 characters, for display
 *   5. the row lives in ichi.ichi_tokens
 *
 * Duplicated rather than imported because these are two deployed applications
 * with separate build pipelines; a shared package would couple their releases,
 * which is the thing keeping them in separate schemas was meant to avoid. The
 * guard against drift is that ichi's own end-to-end check mints through this
 * page and then calls ichi with the result — a mismatch fails there loudly
 * rather than in somebody's terminal.
 */

const PREFIX = "ichi_";

/** Live tokens per account, mirroring ichi's own cap. */
const MAX_ACTIVE = 20;

export interface IchiToken {
  id: string;
  prefix: string;
  name: string | null;
  last_used_at: Date | null;
  created_at: Date;
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listIchiTokens(userId: string): Promise<IchiToken[]> {
  try {
    return await query<IchiToken>(
      `select id, prefix, name, last_used_at, created_at
         from ichi.ichi_tokens
        where user_id = $1 and revoked_at is null
        order by created_at desc`,
      [userId],
    );
  } catch {
    // The sibling's schema being absent or mid-migration must not 500 a page
    // that is mostly about mozg's own tokens.
    return [];
  }
}

export async function ichiIssueLimitReached(userId: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `select count(*)::int as n from ichi.ichi_tokens
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  return (rows[0]?.n ?? 0) >= MAX_ACTIVE;
}

/** Plaintext is returned once and never recoverable — only the hash is stored. */
export async function issueIchiToken(
  userId: string,
  name?: string,
): Promise<{ token: string; prefix: string }> {
  const token = PREFIX + randomBytes(24).toString("base64url");
  const prefix = token.slice(0, 12);

  await maybeOne(
    `insert into ichi.ichi_tokens (user_id, token_hash, prefix, name)
     values ($1, $2, $3, $4) returning id`,
    [userId, hash(token), prefix, name ?? null],
  );

  return { token, prefix };
}

/** Scoped by user_id, so one account can never revoke another's. */
export async function revokeIchiToken(userId: string, id: string): Promise<void> {
  await query(
    `update ichi.ichi_tokens set revoked_at = now()
      where id = $1 and user_id = $2`,
    [id, userId],
  );
}
