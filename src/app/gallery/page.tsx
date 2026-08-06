import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { query } from "@/db";
import { coverUrl } from "@/lib/covers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The style gallery — buy the way someone works",
  description:
    "Styles from illustrators, photographers, animators and composers, packaged as exam-scored brains. Your agent follows the artist's own rules — licensed, attributed, and paid for on every call.",
  openGraph: {
    title: "The style gallery — mozg",
    description:
      "Buy the way someone works. Every style is licensed by its author, scored on an exam, and pays them per call.",
    type: "website",
  },
};

interface StyleCard {
  id: string;
  slug: string;
  handle: string;
  artist: string;
  title: string;
  goal: string | null;
  score: number | null;
  note_count: number;
  price_cents: number;
  buyers: number;
  cover_key: string | null;
}

/**
 * The shop floor.
 *
 * /styles argues the case; this is where you look at the work and take one
 * home. That split matters — an argument and a catalogue on the same scroll
 * were two pages competing, and the catalogue always lost because the reader
 * arrived already halfway through a paragraph.
 *
 * Covers do the selling. A style is judged with the eyes in about a second,
 * and a card that shows a title, a score and a count of rules is a card that
 * describes a knowledge base rather than showing a way of drawing. Brains
 * without one still list — they just sit under the ones that show their work,
 * which is the correct incentive.
 */
export default async function GalleryPage() {
  const styles = await query<StyleCard>(
    `select b.id, b.slug, u.handle, coalesce(u.name, u.handle) as artist,
            b.title, b.goal, b.score, b.note_count, b.price_cents, b.cover_key,
            (select count(*)::int from purchases p where p.brain_id = b.id) as buyers
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.topic = 'art' and u.handle is not null
      order by (b.cover_key is not null) desc,
               b.score desc nulls last, b.created_at asc
      limit 60`,
  );

  const artists = new Set(styles.map((s) => s.handle)).size;

  return (
    <>
      <TopBar />

      <main>
        {/* Its own front door rather than the product's contents strip: the
            person arriving here is looking for work to buy, not for docs. */}
        <header className="gal-hero">
          <div className="shell">
            <p className="eyebrow" style={{ color: "var(--paper-2)", opacity: 0.75 }}>
              Style gallery · illustration · photography · motion · sound
            </p>
            <h1 className="display gal-title">
              Buy the way
              <br />
              someone works.
            </h1>
            <p className="gal-lede">
              Not a filter. Not a fine-tune scraped off their portfolio. The
              artist&apos;s own rules — palette, light, line, the things they
              refuse to do — written down, exam-scored, and licensed to your
              agent. They are paid every time it is used, and access can be
              taken back.
            </p>
            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
              <Link className="btn gal-btn" href="/styles">
                How it works for artists
              </Link>
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--paper-2)", opacity: 0.6 }}>
                {styles.length} style{styles.length === 1 ? "" : "s"} ·{" "}
                {artists} artist{artists === 1 ? "" : "s"} · 95% to the author
              </span>
            </div>
          </div>
        </header>

        <div className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
          {styles.length === 0 ? (
            <div className="panel" style={{ maxWidth: "44rem" }}>
              <h2 className="h2" style={{ marginTop: 0 }}>Nothing on the wall yet.</h2>
              <p style={{ color: "var(--ink-2)" }}>
                The first styles are being written right now. If yours should be
                among them, it takes an afternoon and the catalogue listing is
                free.
              </p>
              <Link className="btn" href="/styles">
                Put your style up
              </Link>
            </div>
          ) : (
            <div className="gal-grid">
              {styles.map((s) => {
                const cover = coverUrl(s);
                return (
                  <Link key={s.id} className="gal-card" href={`/b/${s.handle}/${s.slug}`}>
                    <span className="gal-cover">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt={`A work in ${s.title}`} loading="lazy" />
                      ) : (
                        <span className="gal-cover-empty mono">no cover yet</span>
                      )}
                      {s.score !== null && (
                        <span className="gal-score mono">exam {s.score}%</span>
                      )}
                    </span>
                    <span className="gal-meta">
                      <strong className="gal-name">{s.title}</strong>
                      <span className="gal-artist mono">
                        {s.artist} · @{s.handle}
                      </span>
                      {s.goal && <span className="gal-goal">{s.goal.split("\n")[0]}</span>}
                      <span className="gal-foot mono">
                        <span>
                          {s.note_count} rule{s.note_count === 1 ? "" : "s"}
                          {s.buyers > 0 && ` · ${s.buyers} using it`}
                        </span>
                        <span className="gal-price">
                          {s.price_cents > 0 ? `$${(s.price_cents / 100).toFixed(0)}` : "free"}
                        </span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <section className="gal-note">
            <h2 className="h2" style={{ marginTop: 0 }}>What you are actually buying</h2>
            <p>
              A brain, not a picture pack and not a model. It holds the rules an
              artist works by, and any agent you use — Claude Code, Codex,
              Cursor, anything that speaks MCP — reads them before it generates
              or art-directs. Bought once from your balance; the author keeps
              updating it and you get the updates.
            </p>
            <p>
              Because it runs through mozg rather than as a fine-tune on
              somebody&apos;s disk, the licence is real: attribution stays
              attached and access can be revoked. That is the difference the
              whole thing rests on — a LoRA in the wild is forever, a licence is
              not.
            </p>
            <p style={{ marginBottom: 0 }}>
              <Link href="/styles">The full argument, and how to sell one →</Link>
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
