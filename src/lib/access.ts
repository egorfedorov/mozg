import { maybeOne } from "@/db";
import type { Brain, GrantRole } from "@/db/types";
import { gateFor, hasPaid } from "@/lib/paywall";
import { holdsAnyPack } from "@/lib/pack-access";
import { packsWith } from "@/lib/packs";

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

  // A price on a parent covers its children — see lib/paywall.ts. Checking
  // only this brain's own price would let a buyer walk past the parent and
  // add the free children instead.
  const gate = await gateFor(brain);
  if (gate) {
    if (await hasPaid(gate, userId)) return open("viewer");
    // Or the brain came in a pack somebody bought. A pack is the cheaper way
    // to the same material, and it travels to the seats on that purchase —
    // which is the whole shape of a pack sale, since the brains themselves
    // belong to whoever wrote them and the buyer owns none of them.
    if (await inHeldPack(brain, userId)) return open("viewer");
    return { brain, access: null, preview: true };
  }

  return open("viewer");
}

/**
 * Is this brain inside a pack the reader holds?
 *
 * The parent row is only fetched when there is a parent AND some pack names
 * families at all — a gated brain outside every pack asks the database
 * nothing.
 */
async function inHeldPack(brain: Brain, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  let parentSlug: string | null = null;
  if (brain.parent_id) {
    const parent = await maybeOne<{ slug: string }>(
      `select slug from brains where id = $1`,
      [brain.parent_id],
    );
    parentSlug = parent?.slug ?? null;
  }
  const packs = packsWith(brain.slug, parentSlug);
  return packs.length > 0 && holdsAnyPack(userId, packs);
}

export async function canRead(brainId: string, userId: string | null): Promise<boolean> {
  const result = await accessFor(brainId, userId);
  return Boolean(result?.access);
}

export function canWrite(access: Access): boolean {
  return access === "owner" || access === "contributor";
}

/**
 * Proposing is not writing. Anyone who may read a brain may offer it a note,
 * and that note waits pending until the owner approves it — so the permission
 * being granted here is "add a row to someone's review queue", not "change
 * what their brain answers". See migration 0067.
 */
export function canPropose(access: Access): boolean {
  return access !== null;
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
