"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { issueToken, revokeToken } from "@/lib/tokens";

export async function createToken(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

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
