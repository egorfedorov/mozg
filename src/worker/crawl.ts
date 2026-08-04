import { z } from "zod";
import { pool, query, one, maybeOne } from "@/db";
import type { Brain, Source } from "@/db/types";
import { discoverPages } from "@/lib/crawl";
import { limitsFor } from "@/lib/plans";
import { fetchPageText } from "@/lib/page";
import { structured } from "@/lib/claude";
import { env } from "@/lib/env";
import { setGoal } from "@/lib/goal";
import { enqueueIngest } from "@/worker/queue";
import { SourceBusyError } from "@/worker/ingest";

/**
 * Expand a 'site' source into url sources, one per discovered page.
 *
 * The site row itself never becomes notes — it is the record of what was asked
 * for ("learn this whole site") and the receipt of how discovery went. Each
 * page it finds is an ordinary url source, so everything downstream — ingest,
 * retry, self-refresh, the exam — treats crawled pages exactly like pasted
 * ones. Two pipelines would mean every fix lands in one of them.
 */

export interface CrawlResult {
  queued: number;
  skipped: number;
  via: string;
}

export async function crawlSite(sourceId: string): Promise<CrawlResult> {
  // Same advisory lock as ingest, same reason: a deploy overlap must not run
  // one discovery twice and queue every page twice.
  const client = await pool.connect();
  try {
    const locked = await client.query<{ got: boolean }>(
      `select pg_try_advisory_lock(hashtextextended($1, 0)) as got`,
      [sourceId],
    );
    if (!locked.rows[0].got) throw new SourceBusyError(sourceId);
    try {
      return await crawlLocked(sourceId);
    } finally {
      await client.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [sourceId]);
    }
  } finally {
    client.release();
  }
}

async function crawlLocked(sourceId: string): Promise<CrawlResult> {
  const source = await one<Source>(`select * from sources where id = $1`, [sourceId]);
  if (source.status === "ready") return { queued: 0, skipped: 0, via: "done" };
  if (!source.url) throw new Error("site source has no url");

  const brain = await one<Brain & { plan: string }>(
    `select b.*, u.plan from brains b join "user" u on u.id = b.owner_id
      where b.id = $1`,
    [source.brain_id],
  );

  await query(
    `update sources set status = 'processing', error = null, processing_at = now()
      where id = $1`,
    [sourceId],
  );

  try {
    // The plan's source cap is the crawl cap: discovery past the quota would
    // queue pages the ingest path then refuses, in a different voice.
    const limits = limitsFor(brain.plan as never);
    const remaining = limits.sources - brain.source_count;
    if (remaining < 1) {
      throw new Error(
        `the ${brain.plan} plan allows ${limits.sources} sources per brain and ` +
          `${brain.source_count} are used — free some, or upgrade`,
      );
    }

    const found = await discoverPages(source.url, remaining);

    let queued = 0;
    let skipped = 0;
    for (const pageUrl of found.pages) {
      // Re-crawling a site must not duplicate pages that are already sources —
      // that is how a crawl stays re-runnable after the site grows.
      const seen = await maybeOne(
        `select 1 from sources where brain_id = $1 and url = $2`,
        [brain.id, pageUrl],
      );
      if (seen) {
        skipped++;
        continue;
      }
      const page = await one<{ id: string }>(
        `insert into sources (brain_id, kind, url, original_name)
         values ($1, 'url', $2, $3) returning id`,
        [brain.id, pageUrl, new URL(pageUrl).pathname.slice(1) || new URL(pageUrl).hostname],
      );
      await enqueueIngest(page.id);
      queued++;
    }

    // A brain created from just a link has no goal, and without one there is
    // no exam and no score. Draft one from the material itself — the owner
    // can rewrite it on the brain page, which regenerates the exam properly.
    if (!brain.goal?.trim() && found.pages.length) {
      await draftGoal(brain.id, found.pages).catch((err) =>
        // Non-fatal on purpose: a crawl that queued 100 pages must not fail
        // because the goal call flaked. The owner just sets the goal by hand.
        console.warn(
          `[crawl] goal draft for ${brain.slug} failed: ` +
            (err instanceof Error ? err.message : String(err)),
        ),
      );
    }

    // The receipt, visible in the source list: where the pages came from and
    // whether anything was left behind.
    await query(
      `update sources
          set status = 'ready', processed_at = now(), original_name = $2
        where id = $1`,
      [
        sourceId,
        `${new URL(source.url).hostname} — ${queued} page${queued === 1 ? "" : "s"} ` +
          `via ${found.via}${found.note ? ` (${found.note})` : ""}`,
      ],
    );

    return { queued, skipped, via: found.via };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `update sources set status = 'failed', error = $2, processed_at = now()
        where id = $1`,
      [sourceId, message.slice(0, 1000)],
    );
    throw err;
  }
}

// ─── goal drafting ───────────────────────────────────────────────────────────

const draftedGoal = z.object({ goal: z.string().min(20).max(1000) });

/**
 * Read a few of the discovered pages and write the goal the way the product
 * teaches humans to: as an outcome the brain can be examined against, not a
 * subject line. The exam generator then works from this exactly as if the
 * owner had typed it.
 */
async function draftGoal(brainId: string, pages: string[]): Promise<void> {
  // Three pages is enough to know what a documentation is about, and this
  // runs before extraction has read anything — the pages are fetched fresh.
  const samples: string[] = [];
  for (const url of pages.slice(0, 3)) {
    try {
      samples.push((await fetchPageText(url)).slice(0, 4000));
    } catch {
      // A dead sample page costs coverage of the draft, not the draft.
    }
  }
  if (!samples.length) return;

  const { data: raw } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    toolName: "save_goal",
    toolDescription: "Save the drafted goal for this knowledge base.",
    schema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "One paragraph, 1-3 sentences, starting with a verb.",
        },
      },
      required: ["goal"],
      additionalProperties: false,
    },
    system:
      "You write the goal for a knowledge base that AI coding agents will " +
      "query. You are shown excerpts from the documentation it is being built " +
      "from.\n\n" +
      "Write the goal as a measurable outcome, not a subject: name what the " +
      "base must be able to answer — the specific APIs, rules, values and " +
      "behaviours the material covers. 'Answer any question about the Foo " +
      "webhook API: each endpoint's fields and types, retry rules, and error " +
      "cases' is a goal; 'knowledge about Foo' is not. Stay strictly inside " +
      "what the excerpts show the documentation covers.",
    content: [
      {
        type: "text",
        text: samples.map((s, i) => `<page ${i + 1}>\n${s}\n</page>`).join("\n\n"),
      },
    ],
  });

  const parsed = draftedGoal.safeParse(raw);
  if (!parsed.success) throw new Error("goal draft came back in an unreadable shape");

  // setGoal, not an UPDATE: it is the one place that knows a changed goal
  // resets the generated exam and queues a fresh run.
  await setGoal(brainId, parsed.data.goal);
}
