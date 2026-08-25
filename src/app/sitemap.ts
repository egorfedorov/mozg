import type { MetadataRoute } from "next";
import { query } from "@/db";
import { env } from "@/lib/env";
import { sitemapCategories, sitemapNoteIndexes } from "@/lib/public-notes";

export const dynamic = "force-dynamic";

/**
 * Public brains are the growth channel — a page per brain that search engines
 * can find. Private ones must never appear here, so the query filters on
 * visibility rather than listing everything and trusting robots.txt.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL;

  const brains = await query<{ handle: string; slug: string; updated_at: Date }>(
    `select u.handle, b.slug, b.updated_at
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null
      order by b.updated_at desc limit 5000`,
  ).catch(() => []);

  // The reading surface: one page per subject of every free brain. This is the
  // long tail — 3,281 pages against the 184 the site had — and it is why the
  // notes routes exist at all.
  const categories = await sitemapCategories().catch(() => []);
  // Derived from what is actually open, not from every public brain: the first
  // version listed 165 index URLs and thirty-odd answered 404, because paid
  // brains and empty umbrellas were in the list.
  const noteIndexes = await sitemapNoteIndexes().catch(() => []);

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/start`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/why`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/connect`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/guide`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.8 },
    // Canonical for the gallery is the subdomain; see app/gallery/page.tsx.
    { url: "https://gallery.mozg.sh", changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/vs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/vs-skills`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/stories`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/answerable`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/basics`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/roadmap`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/collective`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/make`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/earn`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/status`, changeFrequency: "daily", priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookies`, changeFrequency: "yearly", priority: 0.3 },
    ...brains.map((b) => ({
      url: `${base}/b/${b.handle}/${b.slug}`,
      lastModified: b.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...noteIndexes.map((b) => ({
      url: `${base}/b/${b.handle}/${b.slug}/notes`,
      lastModified: b.updated,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...categories.map((c) => ({
      url:
        `${base}/b/${c.handle}/${c.slug}/notes/` +
        c.category.split("/").map(encodeURIComponent).join("/"),
      lastModified: c.updated,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
