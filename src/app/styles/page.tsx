import Link from "next/link";
import { fill, markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("Style brains — sell your style, not fight the scrapers"),
    description: t("Artists package their style as an exam-scored brain: palette, light, the hard nevers. Buyers' agents generate in it — licensed, attributed, revocable. The answer to style theft that pays the artist."),
  };
}

/**
 * The style-brains sub-project. The argument in one line: defensive cloaking
 * loses the arms race (Glaze → LightShed), so the winning move is to make
 * the style a licensed product instead of a guarded secret. Everything on
 * this page runs on machinery the product already has — brains, exams,
 * the marketplace — pointed at a new audience.
 */
export default async function StylesPage() {
  const t = await translator();

  const user = await currentUser();

  // Two numbers, not the grid: the directory has its own storefront now, and
  // this page only has to say how big it is and point at it.
  const [counts] = await query<{ styles: number; artists: number }>(
    `select count(*)::int as styles, count(distinct b.owner_id)::int as artists
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.topic = 'art' and u.handle is not null`,
  );
  const styleCount = counts?.styles ?? 0;
  const artistCount = counts?.artists ?? 0;

  return (
    <>
      <TopBar />
      <Contents active="/styles" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("Style brains · for illustrators and artists")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", margin: ".5rem 0 1rem", maxWidth: "20ch" }}>
          {t("Your style is being scraped anyway. Sell it instead.")}</h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          {markup(t("Cloaking tools promised to make styles untrainable — and each one has been broken within months. mozg takes the opposite road: your style becomes a <0>brain</0> — palette values, light rules, the hard nevers — that buyers' AI agents follow when they generate. Licensed and attributed, <1>95% of the price yours</1>, and unlike a fine-tune, access can be revoked."), [
          <strong key="s0" />,
          <strong key="s1" />,
        ])}</p>

        {/* The whole argument in two images: same subject, same model, the
            only difference is whether the agent read the style brain. */}
        <section style={{ marginTop: "3rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("One prompt, with and without the brain")}</h2>
            <span className="eyebrow">{t("same image model, nothing else changed")}</span>
          </div>
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", maxWidth: "60rem" }}>
            {[
              { src: t("/styles/fa-without.webp"), label: t("without — the model's default taste") },
              { src: t("/styles/fa-with.webp"), label: t("with the style brain — the artist's actual language") },
            ].map((d) => (
              <figure key={d.src} style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.src}
                  alt={d.label}
                  width={640}
                  height={640}
                  style={{ width: "100%", height: "auto", display: "block", border: "1.5px solid var(--ink)", boxShadow: "6px 6px 0 var(--ink)" }}
                />
                <figcaption className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", marginTop: ".6rem" }}>
                  {d.label}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
            {t("prompt: “a sticker illustration of a fox sitting and reading a small book” — the right one adds only what the brain teaches.")}</p>
        </section>

        {/* How it works, artist-side. Four steps, each one real machinery. */}
        <section style={{ marginTop: "3.5rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("How an artist sells a style")}</h2>
            <span className="eyebrow">{t("every step already works today")}</span>
          </div>
          <div className="rows" style={{ maxWidth: "56rem" }}>
            {[
              ["01", t("Drop your works in"), t("Upload 5–15 of your pieces — mozg reads them and writes the rules it sees: palette with values, how your light behaves, line character, the composition habits. Or write the rules yourself, or both. The brain sells rules, never your images.")],
              ["02", t("It sits an exam"), t("mozg writes control questions from your rules and grades itself — the score on the card is proof the style is actually learnable from the brain, measured by a judge, not claimed by you. Catalogue listing passes a human review; verified-artist badges are on the road.")],
              ["03", t("Price it once, sell it forever"), t("Set a price; buyers pay once from their balance. 95% lands in yours, withdrawable in crypto. Every buyer's agent — Claude Code, Codex, any MCP client — now follows your rules when it generates or art-directs.")],
              ["04", t("Stay in control"), t("You keep updating the brain and every buyer gets the updates. And because access runs through mozg — not through a model fine-tune someone downloaded — it is revocable. A LoRA in the wild is forever; a licence is not.")],
            ].map(([n, t, b]) => (
              <div key={n} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong>
                    <span className="mono" style={{ color: "var(--color-riso-red)", marginRight: ".6rem" }}>{n}</span>
                    {t}
                  </strong>
                  <span className="row-sub">{b}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* The directory itself now lives on its own storefront — this page is
            the argument and the machinery, and a grid of other people's work in
            the middle of it was two pages fighting for one scroll. */}
        <section style={{ marginTop: "3.5rem", border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "clamp(1.25rem, 4vw, 2rem)", maxWidth: "56rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>{t("The styles themselves")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 .5rem" }}>
            {styleCount > 0
              ? fill(
                  styleCount === 1
                    ? t("<0/> style on the shelf, by <1/> artists.")
                    : t("<0/> styles on the shelf, by <1/> artists."),
                  [styleCount, artistCount],
                )
              : t("The first styles are being written right now.")}
          </h2>
          <p style={{ color: "var(--ink-2)", margin: "0 0 1rem", maxWidth: "58ch" }}>
            {t("Browse them by artist, see what each one teaches and what it scored, and take one to your agent.")}</p>
          <Link className="btn" href="https://gallery.mozg.sh">
            {t("Open the gallery")}</Link>
        </section>

        {/* This block used to be titled "Next on this road". It shipped, so it
            says so — a roadmap item left standing after it is built reads as a
            product that never delivers. */}
        <section style={{ marginTop: "3.5rem", border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "clamp(1.25rem, 4vw, 2rem)", maxWidth: "56rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>{t("Live now")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 .5rem" }}>
            {t("People generate in your style without leaving the site, and you earn on every image.")}</h2>
          <p style={{ color: "var(--ink-2)", margin: "0 0 1rem", maxWidth: "58ch" }}>
            {markup(t("A buyer types what they want on your style's page in the gallery. Your rules — palette, line, shading, the nevers — are compiled in front of their sentence, so what comes back follows you rather than the model's idea of your name. 25¢ an image, <0>10¢ of it yours</0>, every time. Their own agents can still read the brain over MCP; this is for everyone who does not use one."), [
            <strong key="s0" />,
          ])}</p>
          <Link className="btn" href="https://gallery.mozg.sh">
            {t("See it in the gallery")}</Link>
        </section>

        <section style={{ marginTop: "3rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn" href={user ? "/styles/new" : "/sign-in?next=/styles/new"}>
            {t("Start your style brain — free, guided")}</Link>
          <Link className="btn btn-ghost" href="/explore?topic=art">
            {t("Browse art brains")}</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
