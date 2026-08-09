import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { effectivePlan } from "@/lib/plans";
import type { Plan } from "@/db/types";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  /** The plan in force right now — an expired paid plan reads as free. */
  plan: Plan;
  /** When the paid plan runs out; null on free and on hand-set plans. */
  paidUntil: Date | string | null;
  handle: string | null;
}

function shape(sessionUser: Record<string, unknown> & { id: string; email: string }): SessionUser {
  const paidUntil = (sessionUser.paidUntil ?? sessionUser.paid_until ?? null) as Date | string | null;
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: (sessionUser.name as string | null) ?? null,
    image: (sessionUser.image as string | null) ?? null,
    plan: effectivePlan((sessionUser.plan as Plan) ?? "free", paidUntil),
    paidUntil,
    handle: (sessionUser.handle as string | null) ?? null,
  };
}

/**
 * Current user, or null. Safe to call from any server component.
 *
 * Memoised for the render that asks. The root layout wants it for the dock,
 * the machine switch wants it to know whether this is a workspace screen, and
 * the page itself usually wants the same answer — three session lookups for
 * one request otherwise, and the answer cannot change halfway through a render.
 */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return shape(session.user as unknown as Record<string, unknown> & { id: string; email: string });
});

/** For route handlers, where `headers()` is not available. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new Error("unauthorized");
  return shape(session.user as unknown as Record<string, unknown> & { id: string; email: string });
}
