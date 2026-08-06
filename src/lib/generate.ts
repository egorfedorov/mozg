import { pool, query, one, maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { move } from "@/lib/money";
import { searchBrain } from "@/lib/search";
import { scanInjection } from "@/lib/scan";

/**
 * Generating in someone's style, and paying them for it.
 *
 * The prices live here rather than on the brain because they are the
 * platform's deal, not the artist's: the artist prices the brain (bought
 * once), and this is the per-image rate every style shares. One number to
 * change, and a buyer can compare two styles on the work rather than on the
 * tariff.
 */

export const GENERATION_PRICE_CENTS = 25;
export const ARTIST_CENTS = 10;

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

/**
 * Compile the style into the prompt.
 *
 * This is the product. Anyone can put "in the style of X" in front of a
 * sentence and get the model's own idea of X — which for anyone outside the
 * training set's famous few is an invention. What a buyer pays for is the
 * artist's actual rules arriving in front of their sentence: the hex values,
 * the line weight, the shading method, and the nevers.
 *
 * Retrieved rather than dumped whole: a brain can hold two hundred rules and
 * the prompt has a budget, so the buyer's own words choose which rules matter
 * for this picture. The nevers are fetched separately and always included —
 * they are what stops the result reading as an imitation, and a subject-driven
 * search will not surface "no gradients" when the subject is a fox.
 */
export async function compilePrompt(brain: Brain, wanted: string): Promise<string> {
  const [relevant, nevers] = await Promise.all([
    searchBrain(brain.id, wanted, { limit: 10 }).then((r) => r.hits),
    searchBrain(brain.id, "never avoid forbidden off-style wrong", {
      limit: 4,
      category: "nevers",
    })
      .then((r) => r.hits)
      // A style written before the fixed categories existed may have no
      // "nevers" shelf at all; the search above then simply finds nothing.
      .catch(() => []),
  ]);

  const seen = new Set<string>();
  const rules = [...nevers, ...relevant]
    .filter((h) => !seen.has(h.note_id) && seen.add(h.note_id))
    .map((h) => `- ${h.title}: ${h.excerpt}`)
    .join("\n")
    .slice(0, 6000);

  return [
    `Draw: ${wanted}`,
    "",
    `Render it strictly in the "${brain.title}" style, defined by these rules.`,
    "They are the artist's own and they override your defaults — where a rule",
    "and your instinct disagree, the rule wins. Follow the exact values given:",
    "",
    rules || "(this style has no rules written down yet)",
    "",
    "Do not add anything the rules do not call for, and do not sign the work.",
  ].join("\n");
}

/**
 * Take the money and queue the job.
 *
 * The debit happens inside the same transaction that writes the row, over a
 * locked balance — two tabs pressing generate at once would otherwise both
 * read the same balance and both pass. The artist is not paid here: nothing
 * has been made yet, and paying on submission would mean paying for failures.
 */
export async function startGeneration(opts: {
  brain: Brain;
  buyerId: string;
  prompt: string;
}): Promise<StartResult> {
  const wanted = opts.prompt.trim().slice(0, 600);
  if (wanted.length < 3) return { ok: false, reason: "Say what to draw." };

  // The prompt reaches an image model with the artist's rules wrapped around
  // it. Text that reads as an instruction to the model rather than a subject
  // is an attempt to talk past those rules — the same attack the note path
  // already refuses, at the one other door that feeds a model.
  if (scanInjection(wanted).length) {
    return {
      ok: false,
      reason: "Describe what to draw, not what the model should do with its instructions.",
    };
  }

  if (opts.brain.owner_id === opts.buyerId) {
    // Charging an artist to use their own style would be absurd, but so would
    // paying them from their own balance: both sides of the movement are the
    // same account, so there is simply nothing to move.
    return startFree(opts.brain, opts.buyerId, wanted);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1 for update`,
      [opts.buyerId],
    );
    if (!rows.length) {
      await client.query("rollback");
      return { ok: false, reason: "No such account." };
    }
    if (rows[0].balance_cents < GENERATION_PRICE_CENTS) {
      await client.query("rollback");
      return {
        ok: false,
        reason: `Not enough balance — a generation costs ${GENERATION_PRICE_CENTS}¢. Top up in settings.`,
      };
    }

    const { rows: created } = await client.query<{ id: string }>(
      `insert into generations
         (brain_id, buyer_id, artist_id, prompt, price_cents, artist_cents)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        opts.brain.id,
        opts.buyerId,
        opts.brain.owner_id,
        wanted,
        GENERATION_PRICE_CENTS,
        ARTIST_CENTS,
      ],
    );

    await move({
      client,
      userId: opts.buyerId,
      amountCents: -GENERATION_PRICE_CENTS,
      kind: "generation",
      brainId: opts.brain.id,
      note: `generated in "${opts.brain.title}"`,
    });

    await client.query("commit");
    return { ok: true, id: created[0].id };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The owner's own style: a row to track the job, no money either way. */
async function startFree(brain: Brain, buyerId: string, wanted: string): Promise<StartResult> {
  const row = await one<{ id: string }>(
    `insert into generations
       (brain_id, buyer_id, artist_id, prompt, price_cents, artist_cents)
     values ($1, $2, $3, $4, 0, 0) returning id`,
    [brain.id, buyerId, brain.owner_id, wanted],
  );
  return { ok: true, id: row.id };
}

/**
 * Pay the artist. Called once, when an image actually exists.
 *
 * Guarded by the row's own status rather than by the caller remembering: the
 * worker can be restarted mid-job, and a second run must not pay twice.
 */
export async function settleGeneration(id: string, storageKey: string, costCents: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{
      artist_id: string;
      brain_id: string;
      artist_cents: number;
      status: string;
    }>(
      `select artist_id, brain_id, artist_cents, status from generations
        where id = $1 for update`,
      [id],
    );
    const gen = rows[0];
    if (!gen || gen.status === "done") {
      await client.query("rollback");
      return;
    }

    await client.query(
      `update generations
          set status = 'done', storage_key = $2, cost_cents = $3, finished_at = now()
        where id = $1`,
      [id, storageKey, costCents],
    );

    if (gen.artist_cents > 0) {
      await move({
        client,
        userId: gen.artist_id,
        amountCents: gen.artist_cents,
        kind: "earning",
        brainId: gen.brain_id,
        note: "someone generated in your style",
      });
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Give the money back.
 *
 * A buyer who paid and got nothing is the one failure this system is not
 * allowed to have, so the refund is idempotent on the row's status and runs
 * even when the reason for failing was itself an error.
 */
export async function failGeneration(id: string, reason: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{
      buyer_id: string;
      brain_id: string;
      price_cents: number;
      status: string;
    }>(
      `select buyer_id, brain_id, price_cents, status from generations
        where id = $1 for update`,
      [id],
    );
    const gen = rows[0];
    if (!gen || gen.status === "done" || gen.status === "failed") {
      await client.query("rollback");
      return;
    }

    await client.query(
      `update generations set status = 'failed', error = $2, finished_at = now()
        where id = $1`,
      [id, reason.slice(0, 500)],
    );

    if (gen.price_cents > 0) {
      await move({
        client,
        userId: gen.buyer_id,
        amountCents: gen.price_cents,
        kind: "refund",
        brainId: gen.brain_id,
        note: "generation failed",
      });
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface GenerationView {
  id: string;
  status: string;
  prompt: string;
  error: string | null;
  storage_key: string | null;
  brain_title: string;
  handle: string | null;
  slug: string;
  created_at: string;
}

export async function generationFor(id: string, userId: string): Promise<GenerationView | null> {
  return maybeOne<GenerationView>(
    `select g.id, g.status, g.prompt, g.error, g.storage_key,
            b.title as brain_title, u.handle, b.slug,
            to_char(g.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as created_at
       from generations g
       join brains b on b.id = g.brain_id
       join "user" u on u.id = b.owner_id
      where g.id = $1 and g.buyer_id = $2`,
    [id, userId],
  );
}

export async function recentGenerations(userId: string, limit = 24): Promise<GenerationView[]> {
  return query<GenerationView>(
    `select g.id, g.status, g.prompt, g.error, g.storage_key,
            b.title as brain_title, u.handle, b.slug,
            to_char(g.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as created_at
       from generations g
       join brains b on b.id = g.brain_id
       join "user" u on u.id = b.owner_id
      where g.buyer_id = $1
      order by g.created_at desc limit $2`,
    [userId, limit],
  );
}
