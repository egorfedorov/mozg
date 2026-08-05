import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { STORIES } from "./stories";
import StoryArt from "./StoryArt";
import AskedTwice from "@/components/AskedTwice";

export const metadata = {
  title: "Seven ways in — mozg",
  description:
    "An artist who sold his method. A company that taught its own software without letting it leave. A studio shipping on a platform whose docs move weekly. Five ways people actually use a knowledge brain.",
  openGraph: {
    title: "Five ways in — mozg",
    description:
      "An artist who sold his method. A company that taught its own software privately. A studio shipping on a moving platform. Five ways people use a knowledge brain.",
    type: "article",
  },
};

/**
 * The long read.
 *
 * Every other page here explains the mechanism. This one shows what the
 * mechanism is *for*, because "exam-scored knowledge brains over MCP" answers a
 * question nobody asked yet. Five stories, each one somebody's actual morning:
 * what they were stuck on, what they did, and what it cost.
 *
 * Each story is its own anchor, so a link can point at the one that fits the
 * person being sent it — which is how anything on this page ever gets read.
 */
export default function StoriesPage() {
  return (
    <>
      <TopBar />
      <Contents active="/stories" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">Seven ways in</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.1rem, 6vw, 4rem)", margin: ".4rem 0 1.25rem" }}
        >
          Somebody knows
          <br />
          something.
          <br />
          Now the agent does.
        </h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "54ch",
            marginTop: 0,
          }}
        >
          A brain is a small, measured body of knowledge that agents can search
          and people can sell, share or keep private. That sentence means nothing
          until you see it used, so here are seven people using it — an artist, a
          company, a game studio, a maintainer, an agency, a first-time founder,
          an engineer with three agents open. Every one starts from something they
          already have.
        </p>

        {/* The index, so a reader picks their own story instead of reading five. */}
        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: "1rem" }}>
          The people below are composites, and the portraits are drawn — not
          customers, and not photographs pretending to be. The situations and the
          mechanics are real.
        </p>

        <nav
          aria-label="The stories"
          style={{
            marginTop: "clamp(2rem, 5vw, 3rem)",
            display: "grid",
            gap: ".5rem",
            maxWidth: "62ch",
          }}
        >
          {STORIES.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="row"
              // .row is a two-column grid of `1fr auto`, which is right for a
              // label-then-value line and wrong here: the number took the wide
              // column and shoved every title against the right edge. The index
              // wants the opposite — a narrow number, then the text, left-aligned.
              style={{
                textDecoration: "none",
                alignItems: "baseline",
                gap: ".75rem",
                gridTemplateColumns: "2rem minmax(0, 1fr)",
              }}
            >
              <span className="mono" style={{ color: "var(--ink-3)", fontSize: ".8125rem" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ minWidth: 0 }}>
                <strong>{s.title}</strong>
                <span className="row-sub">{s.oneLine}</span>
              </span>
            </a>
          ))}
        </nav>

        {STORIES.map((s, i) => (
          <article
            key={s.id}
            id={s.id}
            style={{
              marginTop: "clamp(3rem, 8vw, 5.5rem)",
              scrollMarginTop: "8rem",
            }}
          >
            <p className="eyebrow" style={{ color: s.accent }}>
              {String(i + 1).padStart(2, "0")} · {s.who}
            </p>
            <h2
              className="display"
              style={{ fontSize: "clamp(1.6rem, 4vw, 2.6rem)", margin: ".3rem 0 1rem" }}
            >
              {s.title}
            </h2>

            {/* The person, before the mechanism. A reader recognises a situation
                faster than an architecture — and the portrait is drawn rather than
                photographed on purpose: these are composites, and a photograph
                would be claiming a customer we do not have. */}
            <div
              style={{
                display: "flex",
                gap: "1.1rem",
                alignItems: "flex-start",
                maxWidth: "62ch",
                marginBottom: "1.5rem",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size
                  local illustration; next/image buys nothing here and adds a
                  loader to a page that is otherwise all text. */}
              <img
                src={s.person.portrait}
                alt={`Illustrated portrait of ${s.person.name}, ${s.person.role}`}
                width={104}
                height={104}
                style={{
                  width: "104px",
                  height: "104px",
                  flex: "0 0 auto",
                  objectFit: "cover",
                  border: "1.5px solid var(--ink)",
                  background: "var(--paper-2)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 650 }}>{s.person.name}</p>
                <p
                  className="mono"
                  style={{ margin: ".1rem 0 .6rem", fontSize: ".8125rem", color: "var(--ink-3)" }}
                >
                  {s.person.role}
                </p>
                <p
                  style={{
                    margin: "0 0 .5rem",
                    fontSize: ".9375rem",
                    lineHeight: 1.55,
                    color: "var(--ink-2)",
                  }}
                >
                  <span className="mono" style={{ color: "var(--color-riso-red)" }}>
                    the problem ·{" "}
                  </span>
                  {s.person.problem}
                </p>
                <p style={{ margin: 0, fontSize: ".9375rem", lineHeight: 1.55 }}>
                  <span className="mono" style={{ color: "var(--color-riso-green)" }}>
                    after ·{" "}
                  </span>
                  {s.person.resolution}
                </p>
              </div>
            </div>

            <StoryArt kind={s.art} accent={s.accent} />

            <div style={{ maxWidth: "62ch", marginTop: "1.5rem" }}>
              {s.body.map((p, n) => (
                <p
                  key={n}
                  style={{
                    fontSize: "1.0625rem",
                    lineHeight: 1.65,
                    color: n === 0 ? "var(--ink)" : "var(--ink-2)",
                    // Tailwind's preflight zeroes paragraph margins, so prose has
                    // to ask for its own spacing or it reads as one block.
                    margin: "0 0 1rem",
                  }}
                >
                  {p}
                </p>
              ))}
            </div>

            <AskedTwice
              ask={s.moment.ask}
              without={s.moment.without}
              withBrain={s.moment.withBrain}
              accent={s.accent}
            />

            {/* The steps are the product, named. A story that cannot be followed
                is an advert. */}
            <div className="panel" style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
              <p
                className="eyebrow"
                style={{ margin: "0 0 .75rem", color: "var(--ink-3)" }}
              >
                How it is actually done
              </p>
              <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: ".5rem" }}>
                {s.steps.map((step, n) => (
                  <li key={n} style={{ fontSize: ".9375rem", color: "var(--ink-2)" }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Every story gets its limit stated. A page of five unqualified wins
                reads as a brochure, and the reader knows it. */}
            <p
              style={{
                maxWidth: "62ch",
                marginTop: "1rem",
                paddingLeft: ".9rem",
                borderLeft: `3px solid ${s.accent}`,
                color: "var(--ink-2)",
                fontSize: ".9375rem",
              }}
            >
              <strong style={{ color: "var(--ink)" }}>Where it stops: </strong>
              {s.limit}
            </p>

            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: "1rem" }}>
              share this one: mozg.sh/stories#{s.id}
            </p>
          </article>
        ))}

        <section
          style={{
            marginTop: "clamp(3.5rem, 9vw, 6rem)",
            paddingTop: "2rem",
            borderTop: "1.5px solid var(--ink)",
          }}
        >
          <h2 className="h2">The part all five share</h2>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)", fontSize: "1.0625rem", lineHeight: 1.65 }}>
            None of them wrote a context file. Each one took knowledge that
            already existed — a method, a manual, a platform&apos;s docs, a
            client&apos;s conventions — and made it something an agent can search
            and a person can measure. The measurement is the part that matters:
            every brain here can tell you its score and list the questions it
            still fails, which is the one thing a pasted document will never do.
          </p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <Link className="btn" href="/start">
              Start here
            </Link>
            <Link className="btn btn-ghost" href="/explore">
              Take one from the catalogue
            </Link>
            <Link className="btn btn-ghost" href="/pricing">
              What it costs
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
