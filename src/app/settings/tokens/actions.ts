"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { issueToken, revokeToken, issueLimitReached } from "@/lib/tokens";

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
