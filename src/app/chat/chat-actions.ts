"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { emailReady } from "@/lib/env";
import { sendMail } from "@/lib/mail";

/**
 * A user writes to the operator. The substance gate is deliberately blunt:
 * a floor on length and a daily cap — enough to keep "hi" out without an AI
 * judging people's words. The copy in the UI does the real work of asking
 * for one clear message.
 */
export async function sendChatMessage(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/chat");

  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (body.length < 20) {
    return {
      error:
        "Say the whole thing in one message — what happened, where, and what you expected. Short pings get lost; substance gets answered.",
    };
  }
  if (await rateLimited(user.id, "chat", 5)) {
    return { error: "Five messages a day is the cap — bundle your thoughts into fewer, fuller ones." };
  }

  await query(
    `insert into chat_messages (user_id, author, body) values ($1, 'user', $2)`,
    [user.id, body],
  );

  // The operator hears about it without watching a dashboard. Fire-and-forget:
  // a mail hiccup must not eat the message that IS safely stored.
  if (emailReady) {
    sendMail({
      to: "egorfdrv@gmail.com",
      subject: `chatmozg: ${user.email}`,
      text: `${body}\n\n— reply at https://mozg.sh/admin/chat`,
    }).catch(() => {});
  }

  revalidatePath("/chat");
  return { ok: true as const };
}
