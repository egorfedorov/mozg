import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { notFound } from "next/navigation";
import GalleryShell from "../../GalleryShell";
import GenerateBox from "./GenerateBox";
import { query, maybeOne } from "@/db";
import { accessForSlug } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { coverUrl } from "@/lib/covers";
import { ARTIST_CENTS, GENERATION_PRICE_CENTS } from "@/lib/generate";
import { imageGenReady } from "@/lib/imagegen";

export const dynamic = "force-dynamic";

/**
 * A style's own room: the work, the rules it teaches, and the box that draws
 * in it.
 *
 * Deliberately not the same page as /b/handle/slug. That one is a brain's
 * storefront and speaks to someone deciding whether to connect it to an agent;
 * this speaks to someone who wants a picture in twenty seconds and may never
 * touch MCP at all. Same brain underneath, two audiences that want opposite
 * things from the first screen.
 */
export default async function StyleRoom({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const t = await translator();

  const { handle, slug } = await params;
  const user = await currentUser();
  const found = await accessForSlug(handle, slug, user?.id ?? null);
  if (!found?.brain || found.brain.kind !== "style") notFound();
  if (!found.access && !found.preview) notFound();

  const brain = found.brain;
  const locked = !found.access;
  const mine = brain.owner_id === user?.id;

  const [rules, balance, jobs] = await Promise.all([
    // What the style teaches, by shelf. Titles only for a style nobody has
    // bought — the rules are the product.
    query<{ category: string | null; title: string }>(
      `select category, title from notes
        where brain_id = $1 and status = 'active'
        order by category nulls last, created_at limit 40`,
      [brain.id],
    ),
    user
      ? maybeOne<{ balance_cents: number }>(
          `select balance_cents from "user" where id = $1`,
          [user.id],
        ).then((r) => r?.balance_cents ?? 0)
      : Promise.resolve(0),
    user
      ? query<{ id: string; status: string; prompt: string; error: string | null; created_at: string }>(
          `select id, status, prompt, error,
                  to_char(created_at at time zone 'UTC', 'MM-DD HH24:MI') as created_at
             from generations
            where buyer_id = $1 and brain_id = $2
            order by created_at desc limit 12`,
          [user.id, brain.id],
        )
      : Promise.resolve([]),
  ]);

  const byCategory = new Map<string, string[]>();
  for (const r of rules) {
    const k = r.category ?? "Other";
    byCategory.set(k, [...(byCategory.get(k) ?? []), r.title]);
  }

  const cover = coverUrl(brain);

  return (
    <GalleryShell>
      <main className="shell" style={{ paddingBlock: "clamp(1.5rem, 4vw, 2.5rem)" }}>
        <p className="eyebrow">
          <Link href="https://gallery.mozg.sh">{t("← the gallery")}</Link>
        </p>

        <div className="room-head">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="room-cover" src={cover} alt={`A work in ${brain.title}`} />
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="display room-title">{brain.title}</h1>
            <p className="mono room-by">
              {markup(t("by <0/> <1/> · <2/> rules"), [
              handle,
              brain.score !== null && ` · exam ${brain.score}%`,
              brain.note_count,
            ])}</p>
            {brain.goal && <p className="room-goal">{brain.goal.split("\n")[0]}</p>}
          </div>
        </div>

        {locked ? (
          <section className="panel" style={{ maxWidth: "44rem" }}>
            <h2 className="h2" style={{ marginTop: 0 }}>
              {markup(t("$<0/> to use this style"), [
              (brain.price_cents / 100).toFixed(0),
            ])}</h2>
            <p style={{ color: "var(--ink-2)" }}>
              {markup(t("Buying it once lets your own agents read the rules, and unlocks generating here. The artist keeps 95% of the purchase, and <0/>¢ of every image after that."), [
              ARTIST_CENTS,
            ])}</p>
            <Link className="btn" href={`https://mozg.sh/b/${handle}/${slug}`}>
              {t("Buy it on mozg.sh")}</Link>
          </section>
        ) : !imageGenReady() ? (
          <section className="panel" style={{ maxWidth: "44rem" }}>
            <p style={{ color: "var(--ink-2)", margin: 0 }}>
              {t("Generating here is not switched on for this deployment. The style still works in your own agents — that is what the rules are for.")}</p>
          </section>
        ) : !user ? (
          <section className="panel" style={{ maxWidth: "44rem" }}>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              {markup(t("Sign in to generate in this style. <0/>¢ an image, <1/>¢ of it to the artist."), [
              GENERATION_PRICE_CENTS,
              ARTIST_CENTS,
            ])}</p>
            <Link className="btn" href={`https://mozg.sh/sign-in?next=/gallery/${handle}/${slug}`}>
              {t("Sign in")}</Link>
          </section>
        ) : (
          <GenerateBox
            handle={handle}
            slug={slug}
            priceCents={GENERATION_PRICE_CENTS}
            artistCents={ARTIST_CENTS}
            balanceCents={balance}
            free={mine}
            jobs={jobs}
          />
        )}

        <section style={{ marginTop: "clamp(2rem, 5vw, 3rem)", maxWidth: "48rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("What this style teaches")}</h2>
            <span className="eyebrow">{t("the rules your agent reads")}</span>
          </div>
          {byCategory.size === 0 ? (
            <p className="lede">{t("No rules written yet.")}</p>
          ) : (
            <div className="rows">
              {[...byCategory.entries()].map(([cat, titles]) => (
                <div key={cat} className="row">
                  <span style={{ minWidth: 0 }}>
                    <strong>{cat}</strong>
                    <span className="row-sub">{titles.join(" · ")}</span>
                  </span>
                  <span className="row-side mono" style={{ fontSize: ".75rem" }}>
                    {titles.length}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
            {markup(t("Every image made here is compiled from these rules, not from the model's idea of the name. <0>Connect it to your own agent →</0>"), [
            <Link href={`https://mozg.sh/b/${handle}/${slug}`} key="s0" />,
          ])}</p>
        </section>
      </main>
    </GalleryShell>
  );
}
