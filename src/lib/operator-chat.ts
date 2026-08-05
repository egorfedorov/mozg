import { query } from "@/db";
import { translate } from "@/lib/translate";
import { sendPush } from "@/lib/push";

/**
 * The one door for operator → user messages (reply in /admin/chat, reach-out
 * from the payments list). The operator writes Russian; the wire carries the
 * user's language.
 *
 * lang: "ru" sends as written, a code targets that language, "auto" mirrors
 * the language of the user's last message (English when they never wrote).
 * body is always what the user sees; source_body keeps the operator's
 * original when a translation happened.
 */
export async function sendOperatorMessage(
  userId: string,
  body: string,
  lang: string,
): Promise<void> {
  let send = body;
  let source: string | null = null;

  if (lang !== "ru") {
    const target =
      lang === "auto"
        ? await query<{ body: string }>(
            `select body from chat_messages
              where user_id = $1 and author = 'user'
              order by created_at desc limit 1`,
            [userId],
          ).then((r) => (r[0] ? { sameAs: r[0].body } : "en"))
        : lang;

    // A translation hiccup must not eat the reply: send the original and the
    // thread survives — worst case the user gets one message in Russian.
    const t = await translate(body, target).catch((err) => {
      console.warn(`[translate] reply fell back to original: ${err instanceof Error ? err.message : err}`);
      return null;
    });
    if (t && !t.same) {
      send = t.text;
      source = body;
    }
  }

  await query(
    `insert into chat_messages (user_id, author, body, source_body)
     values ($1, 'operator', $2, $3)`,
    [userId, send, source],
  );

  // Their browsers, if they turned notifications on. The message IS stored —
  // a push hiccup changes nothing.
  sendPush(
    { title: "mozg replied", body: send.slice(0, 140), url: "/chat" },
    { userId },
  ).catch(() => {});
}

/**
 * Cache Russian translations onto user-authored rows that don't have one yet.
 * translation = body is the "was already Russian" marker, so each message is
 * asked about exactly once. Capped per call: the first render after enabling
 * this must not translate a whole archive in one request.
 */
export async function translateThreadsForOperator(limit = 40): Promise<number> {
  const rows = await query<{ id: string; body: string }>(
    `select id, body from chat_messages
      where author = 'user' and translation is null
      order by created_at desc limit $1`,
    [limit],
  );

  // In parallel — the first visit after enabling this may owe a backlog, and
  // forty sequential model calls would hold the page for a minute.
  const results = await Promise.all(
    rows.map(async (m) => {
      const t = await translate(m.body, "ru").catch(() => null);
      if (!t) return false; // stays null, retried on the next visit
      await query(`update chat_messages set translation = $2 where id = $1`, [
        m.id,
        t.same ? m.body : t.text,
      ]);
      return true;
    }),
  );
  return results.filter(Boolean).length;
}

/**
 * Tell the owner their extraction paused, once — 41 failing sources in one
 * crawl must not become 41 messages. Lands as an operator chat message, so
 * the mascot badge lights up wherever they are in the app.
 */
export async function notifyBudgetPaused(
  userId: string,
  window: "monthly" | "daily",
  plan: string,
): Promise<void> {
  const recent = await query(
    `select 1 from rate_limits
      where user_id = $1 and action = 'budget_notice'
        and created_at > now() - interval '3 days'`,
    [userId],
  );
  if (recent.length) return;
  await query(`insert into rate_limits (user_id, action) values ($1, 'budget_notice')`, [
    userId,
  ]);

  const body =
    window === "monthly"
      ? `Heads up — your ${plan} plan's monthly extraction budget is used up, so reading new sources is paused. Nothing is lost: they resume automatically as the 30-day window rolls, or right away on a bigger plan (mozg.sh/settings). Teaching from your own CLI or your own API key stays unlimited. Reply here if anything is unclear — a person reads this.`
      : `Heads up — today's extraction budget on your ${plan} plan is used up, so reading new sources is paused. They resume automatically within 24 hours; a bigger plan raises the ceiling (mozg.sh/settings). Reply here if anything is unclear — a person reads this.`;

  await query(
    `insert into chat_messages (user_id, author, body) values ($1, 'operator', $2)`,
    [userId, body],
  );
  sendPush(
    { title: "mozg: extraction paused", body: body.slice(0, 140), url: "/chat" },
    { userId },
  ).catch(() => {});
}

/**
 * Tell a brain's owner what real searches could not answer. The gap list
 * already exists — this walks it to the person who can act on it, with the
 * mascot badge and a push doing the knocking. One message per brain per
 * week: gaps accumulate, nagging does not help them close.
 */
export async function notifyGaps(
  userId: string,
  brain: { title: string; slug: string },
  questions: string[],
  totalOpen: number,
): Promise<void> {
  const list = questions.map((q) => `• ${q}`).join("\n");
  const body =
    `Your brain "${brain.title}" has ${totalOpen} question${totalOpen === 1 ? "" : "s"} ` +
    `real searches could not answer. The freshest:\n${list}\n\n` +
    `Add a source that covers them (or run /mozg:update) and the next exam turns ` +
    `them green: mozg.sh/brains/${brain.slug}. Reply here if you want a hand.`;

  await query(
    `insert into chat_messages (user_id, author, body) values ($1, 'operator', $2)`,
    [userId, body],
  );
  sendPush(
    { title: `mozg: "${brain.title}" has open gaps`, body: questions[0] ?? "", url: "/chat" },
    { userId },
  ).catch(() => {});
}
