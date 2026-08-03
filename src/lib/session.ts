import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { Plan } from "@/db/types";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  plan: Plan;
  handle: string | null;
}

/** Current user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as unknown as Record<string, unknown>;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    plan: (u.plan as Plan) ?? "free",
    handle: (u.handle as string | null) ?? null,
  };
}

/** For route handlers, where `headers()` is not available. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new Error("unauthorized");
  const u = session.user as unknown as Record<string, unknown>;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    plan: (u.plan as Plan) ?? "free",
    handle: (u.handle as string | null) ?? null,
  };
}
