import { maybeOne } from "@/db";
import type { Brain, GrantRole } from "@/db/types";

/**
 * Who may do what with a brain. Every read path and every MCP tool goes
 * through here — a forgotten check is how one user's brain ends up in another
 * user's agent.
 *
 * A paid brain nobody has bought resolves to `access: null` and `preview: true`
 * rather than to a viewer. That way the default is closed: a caller that
 * ignores `preview` shows nothing, and only the storefront opts into rendering
 * the shell.
 */

export type Access = "owner" | "contributor" | "viewer" | null;

export interface Resolved {
  brain: Brain;
  access: Access;
  /** Listed and describable, but the contents are behind a purchase. */
  preview: boolean;
}

export async function accessFor(
  brainId: string,
  userId: string | null,
): Promise<Resolved | null> {
  const brain = await maybeOne<Brain>(`select * from brains where id = $1`, [brainId]);
  if (!brain) return null;
  return resolve(brain, userId);
}

export async function accessForSlug(
  handle: string,
  slug: string,
  userId: string | null,
): Promise<Resolved | null> {
  const brain = await maybeOne<Brain>(
    `select b.* from brains b
       join "user" u on u.id = b.owner_id
      where u.handle = $1 and b.slug = $2`,
    [handle, slug],
  );
  if (!brain) return null;
  return resolve(brain, userId);
}

async function resolve(brain: Brain, userId: string | null): Promise<Resolved> {
  const open = (access: Access): Resolved => ({ brain, access, preview: false });

  if (userId && brain.owner_id === userId) return open("owner");

  if (userId) {
    // The email must be verified. Grants are matched by address, so without
    // this anyone could sign up as someone-else@their-company.com and collect
    // every brain shared to that person. GitHub logins arrive verified; a
    // password signup does not until it proves the address.
    const grant = await maybeOne<{ role: GrantRole }>(
      `select g.role from grants g
         join "user" u on lower(u.email) = lower(g.email)
        where g.brain_id = $1 and u.id = $2 and u."emailVerified"`,
      [brain.id, userId],
    );
    if (grant) return open(grant.role);
  }

  if (brain.visibility !== "public") return { brain, access: null, preview: false };

  if (brain.price_cents > 0) {
    if (!userId) return { brain, access: null, preview: true };
    const bought = await maybeOne(
      `select 1 from purchases where brain_id = $1 and buyer_id = $2`,
      [brain.id, userId],
    );
    return bought ? open("viewer") : { brain, access: null, preview: true };
  }

  return open("viewer");
}

export async function canRead(brainId: string, userId: string | null): Promise<boolean> {
  const result = await accessFor(brainId, userId);
  return Boolean(result?.access);
}

export function canWrite(access: Access): boolean {
  return access === "owner" || access === "contributor";
}

export function canAdmin(access: Access): boolean {
  return access === "owner";
}

/** Exports are gated by licence, not just by role. */
export function canExport(brain: Brain, access: Access): boolean {
  if (access === "owner") return true;
  if (!access) return false;
  return brain.license !== "proprietary";
}
