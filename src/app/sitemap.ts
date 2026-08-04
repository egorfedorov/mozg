import type { MetadataRoute } from "next";
import { query } from "@/db";
import { env } from "@/lib/env";

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

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/why`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/connect`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/guide`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/vs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/vs-skills`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/collective`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/make`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    ...brains.map((b) => ({
      url: `${base}/b/${b.handle}/${b.slug}`,
      lastModified: b.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
