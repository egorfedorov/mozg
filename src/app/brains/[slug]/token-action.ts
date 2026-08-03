"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { maybeOne } from "@/db";
import { currentUser } from "@/lib/session";
import { issueToken } from "@/lib/tokens";

/**
 * Mint a token from the brain page, so the shortest path from "I made a brain"
 * to "my agent is using it" is one click instead of a trip to settings and
 * back. The plaintext is returned once and never stored — same rule as the
 * settings page, just without the detour.
 */
export async function createTokenInline() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const existing = await maybeOne<{ id: string }>(
    `select id from mcp_tokens where user_id = $1 and revoked_at is null limit 1`,
    [user.id],
  );

  const issued = await issueToken(user.id, existing ? "extra" : "first token");
  revalidatePath("/settings/tokens");

  return { token: issued.token };
}
