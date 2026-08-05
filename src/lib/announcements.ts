import { unstable_cache } from "next/cache";
import { query } from "@/db";

/** A read whose failure is not worth propagating — see liveAnnouncements. */
async function queryOrNone<T extends object>(sql: string, params?: unknown[]): Promise<T[]> {
  try {
    return await query<T>(sql, params);
  } catch {
    return [];
  }
}

/**
 * Announcements — the one way the product speaks first.
 *
 * Everything else here is pull: a user opens a page, an agent calls a tool. When
 * the queue is paused for a deploy or a catalogue pack lands, nobody finds out
 * unless we say so. Two audiences, one table: humans get a banner, agents get a
 * line in `brain_list` when the entry is marked for them — because an agent that
 * cannot reach a brain for twenty minutes should be told why rather than report
 * the brain as broken.
 */

/** Cache tag: posting or retiring an announcement busts it. */
export const ANNOUNCEMENT_TAG = "announcements";

export type AnnouncementKind = "maintenance" | "news" | "notice";

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  /**
   * Formatted in SQL, both of them, and this is not a style choice: node-postgres
   * hands a timestamptz back as a Date, the type here said string, and TypeScript
   * believed the type. `starts_at.slice(0, 10)` on the changelog then threw for
   * every published news item — the page 500'd the moment the first one existed,
   * and nothing in the build could have caught it.
   */
  starts_at: string;
  ends_at: string | null;
  to_agents: boolean;
}

/**
 * Live right now: published and inside its window. Newest first.
 *
 * Fails soft on purpose. This runs in the root layout, which means it also runs
 * while `next build` prerenders static pages on a machine with no database — and
 * a banner is not worth failing a build over. At runtime a database that cannot
 * answer this has bigger problems than a missing bar.
 */
export const liveAnnouncements = unstable_cache(
  async (): Promise<Announcement[]> =>
    queryOrNone<Announcement>(
      `select id, kind, title, body, to_agents,
              to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as starts_at,
              to_char(ends_at   at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ends_at
         from announcements
        where published
          and starts_at <= now()
          and (ends_at is null or ends_at > now())
        order by starts_at desc
        limit 3`,
    ),
  ["live-announcements"],
  // Cached because this runs in the root layout and again on every brain_list:
  // uncached, that is a query per page view and per agent call, to display a bar
  // that is usually absent. (It does not change what renders statically — TopBar
  // reads the session, so these pages were already per-request.)
  //
  // The window is a minute, but posting or retiring busts the tag — so a
  // maintenance notice is immediate, and the minute only ever applies to an
  // entry expiring on its own schedule.
  { revalidate: 60, tags: [ANNOUNCEMENT_TAG] },
);

/**
 * What an agent is told. Only entries explicitly marked for agents, and only
 * one line each: this rides along with every brain_list, so it has to stay
 * cheap enough that nobody would want to turn it off.
 */
export async function agentNotice(): Promise<string | null> {
  const live = (await liveAnnouncements()).filter((a) => a.to_agents);
  if (!live.length) return null;
  return live
    .map((a) => {
      const until = a.ends_at
        ? ` (until ${new Date(a.ends_at).toISOString().slice(0, 16).replace("T", " ")} UTC)`
        : "";
      const detail = a.body.trim() ? ` — ${a.body.trim().split("\n")[0]}` : "";
      return `[mozg ${a.kind}] ${a.title}${detail}${until}`;
    })
    .join("\n");
}

/** The news feed: everything published, whether or not its banner window is open. */
export async function newsArchive(limit = 50): Promise<Announcement[]> {
  return queryOrNone<Announcement>(
    `select id, kind, title, body, to_agents,
            to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as starts_at,
            to_char(ends_at   at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ends_at
       from announcements
      where published and kind in ('news', 'notice')
      order by starts_at desc
      limit $1`,
    [limit],
  );
}
