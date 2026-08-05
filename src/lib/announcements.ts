import { query } from "@/db";

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

export type AnnouncementKind = "maintenance" | "news" | "notice";

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
  to_agents: boolean;
}

/** Live right now: published and inside its window. Newest first. */
export async function liveAnnouncements(): Promise<Announcement[]> {
  return query<Announcement>(
    `select id, kind, title, body, starts_at, ends_at, to_agents
       from announcements
      where published
        and starts_at <= now()
        and (ends_at is null or ends_at > now())
      order by starts_at desc
      limit 3`,
  );
}

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
  return query<Announcement>(
    `select id, kind, title, body, starts_at, ends_at, to_agents
       from announcements
      where published and kind in ('news', 'notice')
      order by starts_at desc
      limit $1`,
    [limit],
  );
}
