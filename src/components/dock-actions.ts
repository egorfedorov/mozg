"use server";

import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { markAchievementsSeen } from "@/lib/achievements";

/**
 * Opening the drawer IS reading it: the last messages and any new badges are
 * right there, so both notification counters clear in one call. No revalidate —
 * the client zeroes its own badge, and the next server render agrees.
 */
export async function markDockSeen(): Promise<void> {
  const user = await currentUser();
  if (!user) return;

  await query(
    `update chat_messages set read_at = now()
      where user_id = $1 and author = 'operator' and read_at is null`,
    [user.id],
  );
  await markAchievementsSeen(user.id);

  // The operator's payments counter resets on open; waiting USER messages do
  // not — those clear only when actually answered in /admin/chat.
  if (isAdmin(user)) {
    await query(
      `insert into app_settings (key, value) values ('admin_seen_payments_at', now()::text)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    );
  }
}
