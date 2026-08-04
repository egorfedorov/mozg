"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { one, query, maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { slugify } from "@/lib/brains";
import { TOPIC_KEYS } from "@/lib/topics";
import { limitsFor } from "@/lib/plans";
import { checkFetchableUrl } from "@/lib/url-guard";
import { enqueueCrawl } from "@/worker/queue";

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the brain a name").max(80),
  goal: z.string().trim().max(4000).optional(),
  docs: z.string().trim().max(2000).optional(),
  // Same bounds as the share page — one rule, two doors.
  price: z.coerce.number().min(0).max(1000).catch(0),
  // An unknown topic is a stale form, not something worth an error message.
  topic: z.string().catch("other").transform((t) => (TOPIC_KEYS.includes(t) ? t : "other")),
  parent: z.string().trim().optional(),
});

export async function createBrain(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    goal: formData.get("goal") || undefined,
    docs: String(formData.get("docs") ?? "") || undefined,
    price: String(formData.get("price") ?? "0").replace(",", ".") || "0",
    topic: formData.get("topic") ?? "other",
    parent: String(formData.get("parent") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  // A price means selling, and selling means being visible. Doing this at
  // creation is a convenience over the share page, not a different rule.
  const priceCents = Math.round(parsed.data.price * 100);

  // Checked before the brain exists — a bad link should be a red line under
  // the field, not a brain created with a source that failed off-screen.
  let docsUrl: string | null = null;
  if (parsed.data.docs) {
    const check = await checkFetchableUrl(parsed.data.docs);
    if (!check.ok || !check.url) {
      return { error: `That docs link was refused — ${check.reason}.` };
    }
    docsUrl = check.url;
  }

  const { count } = await one<{ count: number }>(
    `select count(*)::int as count from brains where owner_id = $1`,
    [user.id],
  );
  const limit = limitsFor(user.plan).brains;
  if (count >= limit) {
    return {
      error:
        user.plan === "free"
          ? "The free plan holds one brain. Upgrade to add more."
          : `You have reached ${limit} brains on the ${user.plan} plan.`,
    };
  }

  // Slugs are per-owner, so only disambiguate against this user's brains.
  const base = slugify(parsed.data.title);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const taken = await maybeOne(
      `select 1 from brains where owner_id = $1 and slug = $2`,
      [user.id, slug],
    );
    if (!taken) break;
    slug = `${base}-${i}`.slice(0, 39);
  }

  // The database refuses a parent that is not this user's, or that is already
  // a child. Resolving it here turns that into a sentence rather than a 500.
  let parentId: string | null = null;
  if (parsed.data.parent) {
    const parent = await maybeOne<{ id: string; parent_id: string | null }>(
      `select id, parent_id from brains where owner_id = $1 and id = $2`,
      [user.id, parsed.data.parent],
    );
    if (!parent) return { error: "That parent brain does not exist." };
    if (parent.parent_id) {
      return { error: "Brains group one level deep. Pick a top-level brain." };
    }
    parentId = parent.id;
  }

  const brain = await one<Brain>(
    `insert into brains (owner_id, slug, title, goal, topic, parent_id, visibility, price_cents)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [
      user.id,
      slug,
      parsed.data.title,
      parsed.data.goal ?? null,
      parsed.data.topic,
      parentId,
      priceCents > 0 ? "public" : "private",
      priceCents,
    ],
  );

  // One link at creation is the whole point of the field: the crawl worker
  // expands it into a source per page and the exam runs as material lands.
  if (docsUrl) {
    const site = await one<{ id: string }>(
      `insert into sources (brain_id, kind, url, original_name)
       values ($1, 'site', $2, $3) returning id`,
      [brain.id, docsUrl, `${new URL(docsUrl).hostname} (whole site)`],
    );
    await enqueueCrawl(site.id);
  }

  revalidatePath("/brains");
  redirect(`/brains/${brain.slug}`);
}

/**
 * The whole product in one field: paste a link, get a brain. Title comes from
 * the link, the goal is drafted from the material by the crawl worker, the
 * exam follows on its own. Everything is editable afterwards.
 */
export async function quickStart(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const raw = String(formData.get("url") ?? "").trim();
  if (!raw) return { error: "Paste a link to the documentation." };

  const check = await checkFetchableUrl(raw.includes("://") ? raw : `https://${raw}`);
  if (!check.ok || !check.url) {
    return { error: `That link was refused — ${check.reason}.` };
  }

  const { count } = await one<{ count: number }>(
    `select count(*)::int as count from brains where owner_id = $1`,
    [user.id],
  );
  if (count >= limitsFor(user.plan).brains) {
    return { error: "The plan's brain limit is reached — upgrade in settings." };
  }

  // A github link names its repo; anything else, the host. "docs.foo.com" and
  // "github.com/foo/bar" both read naturally as titles.
  const url = new URL(check.url);
  const title =
    url.hostname === "github.com"
      ? url.pathname.split("/").filter(Boolean).slice(0, 2).join("/") || url.hostname
      : url.hostname.replace(/^www\./, "");

  const base = slugify(title);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const taken = await maybeOne(
      `select 1 from brains where owner_id = $1 and slug = $2`,
      [user.id, slug],
    );
    if (!taken) break;
    slug = `${base}-${i}`.slice(0, 39);
  }

  const brain = await one<Brain>(
    `insert into brains (owner_id, slug, title, topic) values ($1, $2, $3, 'other')
     returning *`,
    [user.id, slug, title.slice(0, 80)],
  );
  const site = await one<{ id: string }>(
    `insert into sources (brain_id, kind, url, original_name)
     values ($1, 'site', $2, $3) returning id`,
    [brain.id, check.url, `${url.hostname} (whole site)`],
  );
  await enqueueCrawl(site.id);

  revalidatePath("/brains");
  redirect(`/brains/${brain.slug}`);
}

export async function updateGoal(brainId: string, goal: string) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await query(`update brains set goal = $3 where id = $1 and owner_id = $2`, [
    brainId,
    user.id,
    goal.trim() || null,
  ]);
  revalidatePath("/brains");
}
