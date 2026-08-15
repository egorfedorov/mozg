import { pool, query, maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { move } from "@/lib/money";
import { scanInjection } from "@/lib/scan";
import { GENERATION_PRICE_CENTS, ARTIST_CENTS, compilePrompt } from "@/lib/generate";
import { priceOf, prices } from "@/lib/genprice";
import { compileAssetPrompt, type AssetSpec } from "@/lib/slotgen";

/**
 * A pack: one brief, one payment, a set of assets.
 *
 * The money rule is the gallery's, unchanged — the buyer is debited inside the
 * transaction that writes the rows, and each asset refunds itself if it fails.
 * What is new is that the debit is one movement for the whole set rather than
 * one per picture: a studio that ordered thirteen assets and reads its ledger
 * should find one line saying so, not thirteen lines it has to add up.
 */

export type StartPackResult =
  // The asset ids come back so the caller can queue them. Queueing inside the
  // transaction would be a lie: pg-boss writes to the same database, and a job
  // sent for a row that then rolls back is a worker chasing a ghost.
  | { ok: true; id: string; assetIds: string[] }
  | { ok: false; reason: string };

export interface PackAsset {
  id: string;
  role: string;
  label: string;
  prompt: string;
  status: string;
  error: string | null;
  storage_key: string | null;
}

export interface PackView {
  id: string;
  title: string;
  brief: string;
  palette: string | null;
  style_brain_id: string | null;
  style_title: string | null;
  created_at: string;
  assets: PackAsset[];
}

/**
 * Take the money, write the pack, queue the assets.
 *
 * The balance is locked for the whole set: thirteen assets ordered from two
 * tabs on a balance that covers one set must not both pass, and the per-asset
 * check the gallery does would let them.
 */
export async function startPack(opts: {
  ownerId: string;
  title: string;
  brief: string;
  palette?: string | null;
  specs: AssetSpec[];
  /** Generate in a bought artist's style; every asset then pays them. */
  style?: Brain | null;
}): Promise<StartPackResult> {
  const title = opts.title.trim().slice(0, 120);
  const brief = opts.brief.trim().slice(0, 2000);
  const palette = opts.palette?.trim().slice(0, 300) || null;

  if (brief.length < 10) return { ok: false, reason: "Describe the game in a sentence or two." };
  if (!opts.specs.length) return { ok: false, reason: "Pick at least one asset." };
  if (opts.specs.length > 40) return { ok: false, reason: "Forty assets is the most one pack can hold." };

  // The brief reaches an image model wrapped in our technical rules, and text
  // that reads as an instruction rather than a description is an attempt to
  // talk past them — the same door the note path already refuses at.
  if (scanInjection(brief).length) {
    return {
      ok: false,
      reason: "Describe the game, not what the model should do with its instructions.",
    };
  }

  // Generating in your own style is free of charge, because both sides of the
  // movement would be the same account.
  const paysArtist = Boolean(opts.style && opts.style.owner_id !== opts.ownerId);

  // Priced per role, from the operator's own settings rather than a constant:
  // a lobby tile and a low-pay trinket cost the same to generate and are worth
  // different money. Read once for the whole pack — thirteen assets must not
  // be thirteen queries, and must not straddle a price change mid-order.
  const table = await prices();
  const priced = opts.specs.map((spec) => ({ spec, cents: priceOf(table, spec.role) }));
  const total = priced.reduce((n, p) => n + p.cents, 0);

  // The artist's share follows the price rather than sitting at a fixed number
  // of cents: an operator who doubles what a symbol costs would otherwise be
  // doubling their own margin and leaving the artist exactly where they were.
  const artistShare = (cents: number) =>
    paysArtist ? Math.round((cents * ARTIST_CENTS) / GENERATION_PRICE_CENTS) : 0;

  // Compiled before the transaction: it reads the style brain's notes, which
  // is a search, and a search has no business holding a row lock on someone's
  // balance.
  const styleRules = opts.style ? await compilePrompt(opts.style, brief).catch(() => null) : null;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1 for update`,
      [opts.ownerId],
    );
    if (!rows.length) {
      await client.query("rollback");
      return { ok: false, reason: "No such account." };
    }
    if (rows[0].balance_cents < total) {
      await client.query("rollback");
      return {
        ok: false,
        reason:
          `This pack costs $${(total / 100).toFixed(2)} for ${opts.specs.length} assets. ` +
          "Top up in settings, or take assets out of the set.",
      };
    }

    const { rows: created } = await client.query<{ id: string }>(
      `insert into asset_packs (owner_id, title, brief, palette, style_brain_id)
       values ($1, $2, $3, $4, $5) returning id`,
      [opts.ownerId, title || "Untitled pack", brief, palette, opts.style?.id ?? null],
    );
    const packId = created[0].id;

    const assetIds: string[] = [];
    for (const { spec, cents } of priced) {
      // The full prompt is written now rather than in the worker: it is what
      // the studio actually bought, and a pack whose brief was edited later
      // must still show what each asset was asked for.
      const full = compileAssetPrompt({ brief, palette, styleRules }, spec);
      const { rows: asset } = await client.query<{ id: string }>(
        `insert into generations
           (pack_id, role, label, brain_id, buyer_id, artist_id,
            prompt, full_prompt, price_cents, artist_cents)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [
          packId,
          spec.role,
          spec.label,
          opts.style?.id ?? null,
          opts.ownerId,
          paysArtist ? opts.style!.owner_id : null,
          spec.brief,
          full,
          cents,
          artistShare(cents),
        ],
      );
      assetIds.push(asset[0].id);
    }

    await move({
      client,
      userId: opts.ownerId,
      amountCents: -total,
      kind: "generation",
      brainId: opts.style?.id ?? null,
      note: `${opts.specs.length} assets for "${title || "untitled pack"}"`,
    });

    await client.query("commit");
    return { ok: true, id: packId, assetIds };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The pack and everything in it, for its owner only. */
export async function packFor(id: string, userId: string): Promise<PackView | null> {
  const pack = await maybeOne<Omit<PackView, "assets">>(
    `select p.id, p.title, p.brief, p.palette, p.style_brain_id,
            b.title as style_title,
            to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as created_at
       from asset_packs p
       left join brains b on b.id = p.style_brain_id
      where p.id = $1 and p.owner_id = $2`,
    [id, userId],
  );
  if (!pack) return null;

  const assets = await query<PackAsset>(
    `select id, role, label, prompt, status, error, storage_key
       from generations where pack_id = $1 order by created_at, id`,
    [id],
  );
  return { ...pack, assets };
}

export interface PackSummary {
  id: string;
  title: string;
  created_at: string;
  total: number;
  done: number;
  failed: number;
}

export async function packsOf(userId: string, limit = 30): Promise<PackSummary[]> {
  return query<PackSummary>(
    `select p.id, p.title,
            to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as created_at,
            count(g.id)::int as total,
            count(*) filter (where g.status = 'done')::int as done,
            count(*) filter (where g.status = 'failed')::int as failed
       from asset_packs p
       left join generations g on g.pack_id = p.id
      where p.owner_id = $1
      group by p.id
      order by p.created_at desc
      limit $2`,
    [userId, limit],
  );
}
