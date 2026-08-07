import { maybeOne, query } from "@/db";

/**
 * Pack purchases and the seats on them.
 *
 * A pack is bought once, per account, and the buyer hands out a fixed number
 * of seats with it. Neither half is gated on a subscription tier: plans decide
 * how much of our reading you get and how many calls you may make, and that is
 * all they decide. A colleague who runs out of calls buys their own pro — the
 * seat does not lend them the buyer's month, which is the difference between a
 * funnel and a leak.
 *
 * Seats are matched on a verified email, the rule every other invitation in
 * this schema follows: without it, signing up as someone@their-studio.com
 * collects the studio. So the invite starts working the moment the colleague
 * verifies, with nothing to accept.
 */

export interface PackHolding {
  pack: string;
  /** Whose purchase this is — the reader themselves, or whoever seated them. */
  buyerId: string;
  /** False when the reader holds a seat rather than the receipt. */
  own: boolean;
}

/** Every pack this reader may read, bought or seated. */
export async function packsFor(userId: string | null): Promise<PackHolding[]> {
  if (!userId) return [];
  const rows = await query<{ pack: string; buyer_id: string; own: boolean }>(
    `select pp.pack, pp.buyer_id, (pp.buyer_id = $1) as own
       from pack_purchases pp
      where pp.buyer_id = $1
         or exists (
              select 1 from pack_seats s
                join "user" me on lower(me.email) = lower(s.email) and me."emailVerified"
               where s.pack = pp.pack and s.buyer_id = pp.buyer_id and me.id = $1
            )`,
    [userId],
  );
  return rows.map((r) => ({ pack: r.pack, buyerId: r.buyer_id, own: r.own }));
}

/** Does this reader hold any of these packs? The read path's one question. */
export async function holdsAnyPack(
  userId: string | null,
  packs: string[],
): Promise<boolean> {
  if (!userId || !packs.length) return false;
  const row = await maybeOne(
    `select 1
       from pack_purchases pp
      where pp.pack = any($2::text[])
        and (pp.buyer_id = $1
             or exists (
                  select 1 from pack_seats s
                    join "user" me on lower(me.email) = lower(s.email)
                     and me."emailVerified"
                   where s.pack = pp.pack and s.buyer_id = pp.buyer_id and me.id = $1
                ))
      limit 1`,
    [userId, packs],
  );
  return Boolean(row);
}

export interface PackSeat {
  id: string;
  email: string;
  invited_at: Date;
  /** Null until the invited address exists and is verified. */
  member_id: string | null;
}

/** The seats given on one purchase, the buyer excluded — they hold one by buying. */
export async function seatsOn(pack: string, buyerId: string): Promise<PackSeat[]> {
  return query<PackSeat>(
    `select s.id, s.email::text as email, s.invited_at,
            (select me.id from "user" me
              where lower(me.email) = lower(s.email) and me."emailVerified") as member_id
       from pack_seats s
      where s.pack = $1 and s.buyer_id = $2
      order by s.invited_at`,
    [pack, buyerId],
  );
}

/** Has this account already bought that pack? Purchases are once per account. */
export async function boughtPack(pack: string, buyerId: string): Promise<boolean> {
  const row = await maybeOne(
    `select 1 from pack_purchases where pack = $1 and buyer_id = $2`,
    [pack, buyerId],
  );
  return Boolean(row);
}
