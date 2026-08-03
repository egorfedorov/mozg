"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/db";
import { adjustBalance as moveBalance, settlePayout } from "@/lib/money";
import { requireAdmin } from "@/lib/admin";
import { TOPIC_KEYS } from "@/lib/topics";

/**
 * Operator actions. Each one re-checks requireAdmin() — the page guard runs on
 * render, these run on POST, and nothing stops a POST from arriving without
 * the page ever being rendered.
 */

export async function setPlan(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = z
    .object({ id: z.string().min(1), plan: z.enum(["free", "pro", "team"]) })
    .safeParse({ id: formData.get("id"), plan: formData.get("plan") });
  if (!parsed.success) return;

  await query(`update "user" set plan = $2, "updatedAt" = now() where id = $1`, [
    parsed.data.id,
    parsed.data.plan,
  ]);
  console.log(`[admin] ${admin.email} set plan=${parsed.data.plan} on ${parsed.data.id}`);
  revalidatePath("/admin/users");
}

/**
 * Move a balance by hand — a refund, a goodwill credit, or correcting a crypto
 * top-up that arrived off-band. Writes a ledger row like every other movement,
 * so `check:money` still reconciles afterwards.
 */
export async function adjustBalance(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = z
    .object({
      id: z.string().min(1),
      // Dollars in, cents stored. Signed: negative takes money back.
      amount: z.coerce.number().min(-10000).max(10000),
      note: z.string().trim().max(200),
    })
    .safeParse({
      id: formData.get("id"),
      amount: String(formData.get("amount") ?? "0").replace(",", "."),
      note: formData.get("note") ?? "",
    });
  if (!parsed.success) return;

  const cents = Math.round(parsed.data.amount * 100);
  if (cents === 0) return;

  const res = await moveBalance({
    userId: parsed.data.id,
    amountCents: cents,
    note: parsed.data.note || `by ${admin.email}`,
  });

  console.log(
    `[admin] ${admin.email} adjusted ${parsed.data.id} by ${cents}c — ${res.ok ? "ok" : "refused"}`,
  );
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

/**
 * Settle a withdrawal. "Paid" is what debits the balance — mark it only after
 * the transfer has actually left, because this is the step that makes the
 * ledger say the money is gone.
 */
export async function settleWithdrawal(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = z
    .object({ id: z.string().uuid(), paid: z.enum(["yes", "no"]) })
    .safeParse({ id: formData.get("id"), paid: formData.get("paid") });
  if (!parsed.success) return;

  const res = await settlePayout({
    payoutId: parsed.data.id,
    paid: parsed.data.paid === "yes",
    note: `settled by ${admin.email}`,
  });

  console.log(
    `[admin] ${admin.email} settled payout ${parsed.data.id} paid=${parsed.data.paid} — ${res.ok ? "ok" : res.reason}`,
  );
  revalidatePath("/admin");
}

/** Cut a user off from MCP without touching their account or their data. */
export async function revokeTokens(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));

  const revoked = await query<{ id: string }>(
    `update mcp_tokens set revoked_at = now()
      where user_id = $1 and revoked_at is null
      returning id`,
    [id],
  );
  console.log(`[admin] ${admin.email} revoked ${revoked.length} token(s) for ${id}`);
  revalidatePath("/admin/users");
}

/** Where a brain sits in the catalogue: its field and who can see it. */
export async function setListing(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = z
    .object({
      id: z.string().uuid(),
      visibility: z.enum(["private", "link", "public"]),
      topic: z.string().transform((t) => (TOPIC_KEYS.includes(t) ? t : "other")),
    })
    .safeParse({
      id: formData.get("id"),
      visibility: formData.get("visibility"),
      topic: String(formData.get("topic") ?? "other"),
    });
  if (!parsed.success) return;

  // Taking a brain off the catalogue also takes it off sale: a price on a
  // non-public brain is a listing nobody can complete.
  await query(
    `update brains set visibility = $2, topic = $3,
            price_cents = case when $2 = 'public' then price_cents else 0 end,
            updated_at = now()
      where id = $1`,
    [parsed.data.id, parsed.data.visibility, parsed.data.topic],
  );
  console.log(
    `[admin] ${admin.email} listed ${parsed.data.id} as ${parsed.data.visibility}/${parsed.data.topic}`,
  );
  revalidatePath("/admin/brains");
  revalidatePath("/explore");
}

/**
 * Delete a brain and everything under it. Refused while it has sales — people
 * paid for that access, and deleting it silently takes what they bought.
 */
export async function deleteBrain(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  if (!z.string().uuid().safeParse(id).success) return;

  const sold = await query<{ n: number }>(
    `select count(*)::int as n from purchases where brain_id = $1`,
    [id],
  );
  if (sold[0].n > 0) {
    console.log(`[admin] ${admin.email} tried to delete sold brain ${id}`);
    return;
  }

  await query(`delete from brains where id = $1`, [id]);
  console.log(`[admin] ${admin.email} deleted brain ${id}`);
  revalidatePath("/admin/brains");
  revalidatePath("/explore");
}

/**
 * Delete a person. Cascades through their brains, tokens, calls and ledger, so
 * it is refused while they are holding money or have bought something — both
 * are records someone may need to point at later.
 */
export async function deleteUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  if (id === admin.id) return; // no locking yourself out

  const rows = await query<{ balance_cents: number; purchases: number; sales: number }>(
    `select u.balance_cents,
            (select count(*)::int from purchases p where p.buyer_id = u.id) as purchases,
            (select count(*)::int from purchases p where p.seller_id = u.id) as sales
       from "user" u where u.id = $1`,
    [id],
  );
  if (!rows.length) return;
  const { balance_cents, purchases, sales } = rows[0];
  if (balance_cents > 0 || purchases > 0 || sales > 0) {
    console.log(`[admin] ${admin.email} tried to delete user ${id} with money history`);
    return;
  }

  await query(`delete from "user" where id = $1`, [id]);
  console.log(`[admin] ${admin.email} deleted user ${id}`);
  revalidatePath("/admin/users");
}
