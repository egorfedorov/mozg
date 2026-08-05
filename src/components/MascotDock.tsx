import { query } from "@/db";
import { currentUser } from "@/lib/session";
import MascotDockClient from "./MascotDockClient";

/**
 * The brain in the corner.
 *
 * Every page carries it: a small animated brain bottom-right that opens the line
 * to the developer on the right-hand side. The product's audience lives in chat
 * windows, and the existing /chat page — a real thread, stored, replied to by a
 * person — was reachable only from inside the workspace. A visitor on the landing
 * page had no way to ask anything without signing up first.
 *
 * Server half: it reads the thread the same way /chat does, so the drawer opens on
 * the conversation already in progress rather than on an empty box. Signed out, it
 * says what it is and where to start instead of pretending to be a support bot.
 */
export default async function MascotDock() {
  const user = await currentUser();

  const messages = user
    ? await query<{ id: string; author: "user" | "operator"; body: string; at: string }>(
        `select id, author, body,
                to_char(created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
           from chat_messages where user_id = $1
          order by created_at desc limit 20`,
        [user.id],
      ).then((r) => r.reverse())
    : [];

  const unread = user
    ? await query<{ n: number }>(
        `select count(*)::int as n from chat_messages
          where user_id = $1 and author = 'operator' and read_at is null`,
        [user.id],
      ).then((r) => r[0]?.n ?? 0)
    : 0;

  return <MascotDockClient signedIn={Boolean(user)} messages={messages} unread={unread} />;
}
