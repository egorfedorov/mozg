import { query } from "@/db";
import { ANON_USER_ID } from "@/lib/anon";

/**
 * What the posting actually bought.
 *
 * `signup_source` has been written on every account since 0080 and read by
 * nothing: /admin/users prints it as a suffix on one person's row, which
 * answers "where did this one come from" and never "which post was worth
 * writing". So the column that exists to make reach decisions has never once
 * been used to make one.
 *
 * The funnel below is the whole of it. A signup on its own says almost
 * nothing here — the product is an API an agent calls, so an account with no
 * token is a person who read the page and left, and an account with a token
 * and no calls is a person who got as far as the config and stopped. Those
 * three numbers next to each other say which half of the funnel a channel is
 * failing at, and they need opposite responses: more posts, or a shorter path
 * to the first answer.
 *
 * Deliberately not a new table, a new link route or a campaign id. The
 * first-touch cookie in middleware.ts already records `?utm_source=` and
 * `?ref=` verbatim, so tagging a link `?utm_source=hn-0826` already lands a
 * per-post bucket in this column today — what was missing was the reading of
 * it, and a table would have been a second definition of a thing already
 * recorded correctly.
 *
 * Two honesty limits, and both belong on the page rather than in a footnote:
 * this counts only what the cookie could see (an untagged link shared in a DM
 * arrives as `direct`, and a browser that strips the referrer arrives the same
 * way), and buckets are the free text somebody typed — `hn` and
 * `news.ycombinator.com` are two rows on purpose, because one means "opened my
 * tagged link" and the other means "arrived from that site somehow", and
 * merging them would invent a certainty the data does not have.
 */

export interface SourceFunnel {
  /** The bucket: lowercased `signup_source`, or `unrecorded` for accounts
   *  created before 0080. */
  source: string;
  signups: number;
  /** Got a way in at all — a bearer token or an OAuth grant. */
  connected: number;
  /** Actually called the API afterwards. The only one of these that is use. */
  active: number;
  /** Put real money in. */
  paying: number;
  /** Everything they topped up, in cents. */
  revenue_cents: number;
  first: string;
  last: string;
}

/**
 * @param days window on the account's creation date, or null for all time.
 */
export async function signupFunnel(days: number | null = 30): Promise<SourceFunnel[]> {
  return query<SourceFunnel>(
    `select coalesce(lower(u.signup_source), 'unrecorded') as source,
            count(*)::int as signups,
            -- Both doors, for the same reason adminUsers counts both: an
            -- OAuth connector user has no row in mcp_tokens and is not a
            -- person who failed to connect.
            count(*) filter (
              where exists (select 1 from mcp_tokens t
                             where t.user_id = u.id and t.revoked_at is null)
                 or exists (select 1 from "oauthAccessToken" o
                             where o."userId" = u.id)
            )::int as connected,
            count(*) filter (
              where exists (select 1 from calls c where c.caller_id = u.id)
            )::int as active,
            count(*) filter (
              where exists (select 1 from ledger l
                             where l.user_id = u.id and l.kind = 'topup'
                               and l.amount_cents > 0)
            )::int as paying,
            coalesce(sum((select coalesce(sum(l.amount_cents), 0) from ledger l
                           where l.user_id = u.id and l.kind = 'topup')), 0)::int
              as revenue_cents,
            to_char(min(u."createdAt") at time zone 'UTC', 'YYYY-MM-DD') as first,
            to_char(max(u."createdAt") at time zone 'UTC', 'YYYY-MM-DD') as last
       from "user" u
      -- The metering row the anonymous MCP door bills against is not a person
      -- who signed up. It carries the busiest call count on the table, so
      -- leaving it in would put the largest "active" number in the catch-all
      -- bucket and make every untagged channel look like the one that works.
      where u.id <> $2
        and ($1::int is null or u."createdAt" > now() - make_interval(days => $1::int))
      group by 1
      order by signups desc, source`,
    [days, ANON_USER_ID],
  );
}
