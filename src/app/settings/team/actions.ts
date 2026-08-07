"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { limitsFor } from "@/lib/plans";
import { seatsFree } from "@/lib/team";

/**
 * Seats. Only the owner touches this list — a member cannot invite, remove, or
 * promote, because a seat is a licence somebody is paying for and handing out
 * more of it must stay with the person billed.
 */

export async function inviteMember(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/team");

  if (limitsFor(user.plan).seats < 2) {
    return { error: "Seats come with the studio plan. Upgrade at /settings." };
  }

  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email("That is not an email address")),
      role: z.enum(["viewer", "contributor"]),
    })
    .safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.email === user.email.toLowerCase()) {
    return { error: "You hold a seat by owning the studio." };
  }

  // Checked before the insert rather than after: on conflict the row is an
  // update, which must not be refused for want of a seat that is already
  // taken by the very person being edited.
  const existing = await query(
    `select 1 from members where owner_id = $1 and email = $2`,
    [user.id, parsed.data.email],
  );
  if (!existing.length && (await seatsFree(user.id, user.plan)) <= 0) {
    return {
      error: `Every seat on the ${user.plan} plan is taken. Remove someone, or upgrade.`,
    };
  }

  await query(
    `insert into members (owner_id, email, role, invited_by) values ($1, $2, $3, $1)
     on conflict (owner_id, email) do update set role = excluded.role`,
    [user.id, parsed.data.email, parsed.data.role],
  );

  revalidatePath("/settings/team");
  return { ok: true as const, email: parsed.data.email };
}

export async function removeMember(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/team");

  await query(`delete from members where id = $1 and owner_id = $2`, [
    String(formData.get("id")),
    user.id,
  ]);
  revalidatePath("/settings/team");
}
