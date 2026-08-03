"use server";

import { currentUser } from "@/lib/session";
import { issueToken, issueLimitReached } from "@/lib/tokens";

/**
 * Mint a token from the connect page, so the command on screen becomes the
 * command you can actually run.
 *
 * The plaintext is returned to the caller and never stored — the row keeps a
 * SHA-256 hash. It exists in this response and in the reader's clipboard, and
 * nowhere else, which is why the page says so out loud.
 */
export async function mintToken(): Promise<{ token: string } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };

  // A token per machine is the intent, but nothing stops someone clicking
  // twice. Cap the live ones so a stuck button cannot mint hundreds.
  if (await issueLimitReached(user.id)) {
    return {
      error: "You already have 20 active tokens. Revoke some on the tokens page.",
    };
  }

  const { token } = await issueToken(user.id, "connect page");
  return { token };
}
