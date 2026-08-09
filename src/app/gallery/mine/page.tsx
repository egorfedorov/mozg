import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { redirect } from "next/navigation";
import GalleryShell from "../GalleryShell";
import AutoRefresh from "@/components/AutoRefresh";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { recentGenerations } from "@/lib/generate";
import { formatCents } from "@/lib/money-math";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your images — mozg gallery" };

/**
 * Everything you have made here, and what it cost.
 *
 * A buyer who spends money on pictures needs somewhere those pictures live —
 * the style's own room only shows what was made in that style, and after a
 * week of using three of them there is no single place to look. The spend
 * total is on the same page deliberately: a per-image charge is easy to lose
 * track of, and a product that makes that easy is one people stop trusting.
 */
export default async function MyGenerations() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("https://mozg.sh/sign-in?next=/gallery/mine");

  const [jobs, totals, balance] = await Promise.all([
    recentGenerations(user.id, 60),
    query<{ images: number; spent: number; earned: number }>(
      `select
         (select count(*)::int from generations
           where buyer_id = $1 and status = 'done') as images,
         (select coalesce(sum(price_cents), 0)::int from generations
           where buyer_id = $1 and status = 'done') as spent,
         (select coalesce(sum(artist_cents), 0)::int from generations
           where artist_id = $1 and buyer_id <> $1 and status = 'done') as earned`,
      [user.id],
    ).then((r) => r[0]),
    query<{ balance_cents: number }>(`select balance_cents from "user" where id = $1`, [
      user.id,
    ]).then((r) => r[0]?.balance_cents ?? 0),
  ]);

  const live = jobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <GalleryShell>
      <main className="shell" style={{ paddingBlock: "clamp(1.5rem, 4vw, 2.5rem)" }}>
        <p className="eyebrow">
          <Link href="https://gallery.mozg.sh">{t("← the gallery")}</Link>
        </p>
        <h1 className="display" style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.8rem)", margin: ".3rem 0 1rem" }}>
          {t("Your images")}</h1>

        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", marginBottom: "1.5rem" }}>
          {markup(t("<0/> made · <1/> spent · <2/> balance <3/> <4/>"), [
          totals.images,
          formatCents(totals.spent),
          formatCents(balance),
          totals.earned > 0 && ` · ${formatCents(totals.earned)} earned from your own styles`,
          <AutoRefresh key="s4" active={live} intervalMs={5000} label="drawing" />,
        ])}</p>

        {jobs.length === 0 ? (
          <div className="panel" style={{ maxWidth: "44rem" }}>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              {t("Nothing yet. Pick a style and ask it for something.")}</p>
            <Link className="btn" href="https://gallery.mozg.sh">
              {t("Open the gallery")}</Link>
          </div>
        ) : (
          <div className="gen-grid" style={{ marginTop: 0 }}>
            {jobs.map((j) => (
              <figure key={j.id} className="gen-item">
                {j.status === "done" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/generations/${j.id}/image`} alt={j.prompt} loading="lazy" />
                ) : (
                  <span className="gen-placeholder mono" data-failed={j.status === "failed"}>
                    {j.status === "failed" ? (j.error ?? "failed") : t("drawing…")}
                  </span>
                )}
                <figcaption className="mono">
                  {j.prompt}
                  <br />
                  <Link href={`/gallery/${j.handle}/${j.slug}`} style={{ color: "var(--ink-3)" }}>
                    {j.brain_title}
                  </Link>{" "}
                  · {j.created_at}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </main>
    </GalleryShell>
  );
}
