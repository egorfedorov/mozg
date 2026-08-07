"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { packBySlug } from "@/lib/packs";
import { purchasePack } from "@/lib/money";
import { seatsOn } from "@/lib/pack-access";

/**
 * Buying a pack, and giving out the seats that came with it.
 *
 * Only the buyer touches the seat list: a seat is a share of something they
 * paid for once, and handing out more of it has to stay with the person whose
 * receipt it is.
 */

export async function buyPack(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/packs");

  const pack = packBySlug(String(formData.get("pack")));
  if (!pack) return { error: "No such pack." };

  // The price comes from the pack definition, never from the form: a posted
  // price is a number the buyer chose.
  const res = await purchasePack({
    pack: pack.slug,
    buyerId: user.id,
    priceCents: pack.priceCents,
  });

  if (!res.ok) {
    return {
      error:
        res.reason === "already-owned"
          ? "You already have this pack — it is bought once, and it does not expire."
          : "Your balance does not cover it. Top up at /settings/topup.",
    };
  }

  revalidatePath("/settings/packs");
  return { ok: true as const, pack: pack.title, paidCents: res.paidCents };
}

export async function invitePackSeat(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/packs");

  const pack = packBySlug(String(formData.get("pack")));
  if (!pack) return { error: "No such pack." };

  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("That is not an email address"))
    .safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data === user.email.toLowerCase()) {
    return { error: "You hold a seat by having bought it." };
  }

  const given = await seatsOn(pack.slug, user.id);
  // The buyer counts as one of them, so the giveable number is seats - 1. The
  // check is skipped when the address is already on the list: re-inviting
  // somebody must not be refused for want of the seat they already hold.
  if (
    !given.some((s) => s.email.toLowerCase() === parsed.data) &&
    given.length >= pack.seats - 1
  ) {
    return {
      error: `${pack.title} comes with ${pack.seats} seats and they are all taken. Remove someone first.`,
    };
  }

  // The insert would fail its foreign key without a purchase, but the error a
  // buyer sees should be about buying rather than about a constraint.
  const bought = await query(
    `select 1 from pack_purchases where pack = $1 and buyer_id = $2`,
    [pack.slug, user.id],
  );
  if (!bought.length) return { error: "Buy the pack first, then share it." };

  await query(
    `insert into pack_seats (pack, buyer_id, email) values ($1, $2, $3)
     on conflict (pack, buyer_id, email) do nothing`,
    [pack.slug, user.id, parsed.data],
  );

  revalidatePath("/settings/packs");
  return { ok: true as const, email: parsed.data };
}

export async function removePackSeat(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/packs");

  await query(`delete from pack_seats where id = $1 and buyer_id = $2`, [
    String(formData.get("id")),
    user.id,
  ]);
  revalidatePath("/settings/packs");
}
