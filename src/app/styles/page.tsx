import Link from "next/link";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Style brains — sell your style, not fight the scrapers",
  description:
    "Artists package their style as an exam-scored brain: palette, light, the hard nevers. Buyers' agents generate in it — licensed, attributed, revocable. The answer to style theft that pays the artist.",
};

/**
 * The style-brains sub-project. The argument in one line: defensive cloaking
 * loses the arms race (Glaze → LightShed), so the winning move is to make
 * the style a licensed product instead of a guarded secret. Everything on
 * this page runs on machinery the product already has — brains, exams,
 * the marketplace — pointed at a new audience.
 */
export default async function StylesPage() {
  const user = await currentUser();

  // Every public style brain, the flagship first. The gallery IS the pitch:
  // real brains with real exam scores, not mockups.
  const styleBrains = await query<{
    handle: string;
    slug: string;
    title: string;
    goal: string | null;
    score: number | null;
    note_count: number;
    price_cents: number;
  }>(
    `select u.handle, b.slug, b.title, b.goal, b.score, b.note_count, b.price_cents
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.topic = 'art' and u.handle is not null
      order by b.created_at asc`,
  );

  return (
    <>
      <TopBar />
      <Contents active="/styles" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">Style brains · for illustrators and artists</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", margin: ".5rem 0 1rem", maxWidth: "20ch" }}>
          Your style is being scraped anyway. Sell it instead.
        </h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          Cloaking tools promised to make styles untrainable — and each one has
          been broken within months. mozg takes the opposite road: your style
          becomes a <strong>brain</strong> — palette values, light rules, the
          hard nevers — that buyers&apos; AI agents follow when they generate.
          Licensed and attributed, <strong>95% of the price yours</strong>, and
          unlike a fine-tune, access can be revoked.
        </p>

        {/* The whole argument in two images: same subject, same model, the
            only difference is whether the agent read the style brain. */}
        <section style={{ marginTop: "3rem" }}>
          <div className="section-head">
            <h2 className="h2">One prompt, with and without the brain</h2>
            <span className="eyebrow">same image model, nothing else changed</span>
          </div>
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", maxWidth: "60rem" }}>
            {[
              { src: "/styles/fa-without.webp", label: "without — the model's default taste" },
              { src: "/styles/fa-with.webp", label: "with the style brain — the artist's actual language" },
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
            prompt: “a sticker illustration of a fox sitting and reading a small
            book” — the right one adds only what the brain teaches.
          </p>
        </section>

        {/* How it works, artist-side. Four steps, each one real machinery. */}
        <section style={{ marginTop: "3.5rem" }}>
          <div className="section-head">
            <h2 className="h2">How an artist sells a style</h2>
            <span className="eyebrow">every step already works today</span>
          </div>
          <div className="rows" style={{ maxWidth: "56rem" }}>
            {[
              ["01", "Put the style into a brain", "Palette with exact values, how light behaves, line weight, composition habits — and the hard nevers. Twenty focused notes beat two hundred vague ones. No uploads of your art required: the brain holds rules, not images."],
              ["02", "It sits an exam", "mozg writes control questions from your rules and grades itself — the score on the card is proof the style is actually learnable from the brain, measured by a judge, not claimed by you."],
              ["03", "Price it once, sell it forever", "Set a price; buyers pay once from their balance. 95% lands in yours, withdrawable in crypto. Every buyer's agent — Claude Code, Codex, any MCP client — now follows your rules when it generates or art-directs."],
              ["04", "Stay in control", "You keep updating the brain and every buyer gets the updates. And because access runs through mozg — not through a model fine-tune someone downloaded — it is revocable. A LoRA in the wild is forever; a licence is not."],
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

        {/* The gallery — real style brains for sale, exam scores included. */}
        <section style={{ marginTop: "3.5rem" }}>
          <div className="section-head">
            <h2 className="h2">Style brains in the catalogue</h2>
            <span className="eyebrow">exam-scored · bought once · updates included</span>
          </div>
          {styleBrains.length === 0 ? (
            <p className="lede">The first ones are being written right now.</p>
          ) : (
            <div className="rows" style={{ maxWidth: "56rem" }}>
              {styleBrains.map((b) => (
                <Link key={b.slug} className="row" href={`/b/${b.handle}/${b.slug}`}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{b.title}</strong>
                    <span className="row-sub">{b.goal}</span>
                    <span className="row-meta">
                      {b.note_count} rules · {b.score === null ? "exam pending" : `trained ${b.score}%`}
                    </span>
                  </span>
                  <span className="row-side mono">
                    {b.price_cents > 0 ? `$${(b.price_cents / 100).toFixed(0)}` : "free"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* What is coming — honest about the phase line. */}
        <section style={{ marginTop: "3.5rem", border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "clamp(1.25rem, 4vw, 2rem)", maxWidth: "56rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>Next on this road</p>
          <h2 className="h2" style={{ margin: ".4rem 0 .5rem" }}>
            Hosted generation, per image, your cut on every one.
          </h2>
          <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "58ch" }}>
            Today a buyer&apos;s own agent does the generating. The next phase
            runs it here: anyone pays per image, the style brain steers the
            model, the artist takes the majority of every generation. If you
            want your style in the first batch —{" "}
            <Link href="/chat" style={{ textDecoration: "underline" }}>
              write to chatmozg
            </Link>
            .
          </p>
        </section>

        <section style={{ marginTop: "3rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn" href={user ? "/brains/new" : "/sign-in?next=/brains/new"}>
            Start your style brain — free
          </Link>
          <Link className="btn btn-ghost" href="/explore?topic=art">
            Browse art brains
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
