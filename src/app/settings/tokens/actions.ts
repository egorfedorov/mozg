"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { issueToken, revokeToken, issueLimitReached } from "@/lib/tokens";
import {
  ichiIssueLimitReached,
  issueIchiToken,
  revokeIchiToken,
} from "@/lib/ichi-tokens";

export async function createToken(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  // The connect page enforces this; a cap that only one path checks is not a cap.
  if (await issueLimitReached(user.id)) {
    return { error: "You already have 20 active tokens. Revoke some below first." };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const issued = await issueToken(user.id, name || null ? name : undefined);

  revalidatePath("/settings/tokens");
  // Returned once. After this response the plaintext is gone for good.
  return { token: issued.token };
}

export async function revoke(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await revokeToken(user.id, String(formData.get("id")));
  revalidatePath("/settings/tokens");
}

/**
 * The same two actions for ichi's tokens. Separate functions rather than a
 * `product` parameter: they write to different tables with different caps, and
 * a single action branching on a form field is one typo away from minting the
 * wrong kind of credential.
 */
export async function createIchiToken(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  if (await ichiIssueLimitReached(user.id)) {
    return { error: "You already have 20 active ichi tokens. Revoke some below first." };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const issued = await issueIchiToken(user.id, name || undefined);

  revalidatePath("/settings/tokens");
  // Returned once. After this response the plaintext is gone for good.
  return { token: issued.token };
}

export async function revokeIchi(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await revokeIchiToken(user.id, String(formData.get("id")));
  revalidatePath("/settings/tokens");
}
