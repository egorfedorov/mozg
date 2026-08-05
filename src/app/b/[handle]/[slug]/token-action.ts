"use server";

import { currentUser } from "@/lib/session";
import { issueToken, issueLimitReached } from "@/lib/tokens";

/**
 * Mint a token so the copy button can put a WORKING command on the clipboard.
 * Tokens are stored hashed, so an existing one cannot be shown again — a
 * fresh one, named after where it came from, is the only honest way to
 * deliver "copy, paste, done". Only fires on click, never on render.
 */
export async function mintTokenForCopy(): Promise<
  { token: string } | { error: string }
> {
  const user = await currentUser();
  if (!user) return { error: "sign in first" };

  if (await issueLimitReached(user.id)) {
    return { error: "20 active tokens already — revoke one in /settings/tokens" };
  }

  const issued = await issueToken(user.id, "brain page copy");
  return { token: issued.token };
}
