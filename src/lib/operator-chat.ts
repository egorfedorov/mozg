import { query } from "@/db";
import { translate } from "@/lib/translate";

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
