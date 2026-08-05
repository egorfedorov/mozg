"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { emailReady, env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { sendPush } from "@/lib/push";

/**
 * A user writes to the operator. The length floor is gone — it read as spam
 * protection but mostly stopped people from answering "да, спасибо" in a
 * conversation already going. Spam is a frequency problem, so the guards are
 * about pace: a short cooldown between messages and a generous hourly cap.
 * "привет" is a fine message.
 */
export async function sendChatMessage(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/chat");

  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return { error: "Nothing to send yet." };

  // Pace, not volume: the cooldown check must run before rateLimited, which
  // records the send it is allowing.
  const justSent = await query(
    `select 1 from rate_limits
      where user_id = $1 and action = 'chat'
        and created_at > now() - interval '15 seconds'`,
    [user.id],
  );
  if (justSent.length) {
    return { error: "One message every 15 seconds — give the last one a moment." };
  }
  if (await rateLimited(user.id, "chat", 30)) {
    return { error: "Thirty messages an hour is the cap — take a breath." };
  }

  await query(
    `insert into chat_messages (user_id, author, body) values ($1, 'user', $2)`,
    [user.id, body],
  );

  // The operator's browsers hear about it now, not when a tab happens to be
  // open. Fire-and-forget like the email below — the message IS stored.
  sendPush({
    title: `chatmozg: ${user.email}`,
    body: body.slice(0, 140),
    url: "/admin/chat",
  }).catch(() => {});

  // The operator hears about it without watching a dashboard. Fire-and-forget:
  // a mail hiccup must not eat the message that IS safely stored.
  if (emailReady) {
    sendMail({
      to: env.OPERATOR_EMAIL,
      subject: `chatmozg: ${user.email}`,
      text: `${body}\n\n— reply at https://mozg.sh/admin/chat`,
    }).catch(() => {});
  }

  revalidatePath("/chat");
  return { ok: true as const };
}
