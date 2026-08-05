"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { sendOperatorMessage } from "@/lib/operator-chat";

export async function replyInChat(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("user_id"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const lang = String(formData.get("lang") ?? "auto");
  if (!userId || !body) return;

  await sendOperatorMessage(userId, body, lang);
  // Answering a thread is reading it.
  await query(
    `update chat_messages set read_at = now()
      where user_id = $1 and author = 'user' and read_at is null`,
    [userId],
  );
  revalidatePath("/admin/chat");
}

export async function markThreadRead(formData: FormData) {
  await requireAdmin();
  await query(
    `update chat_messages set read_at = now()
      where user_id = $1 and author = 'user' and read_at is null`,
    [String(formData.get("user_id"))],
  );
  revalidatePath("/admin/chat");
}
