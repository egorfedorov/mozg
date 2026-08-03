import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How to build a brain worth using — mozg",
  description:
    "What separates a brain an agent actually reads from a folder of screenshots: one job, a testable goal, primary material, and letting the exam tell you what is missing.",
};

/** Numbered because this genuinely is a sequence — each step needs the last. */
const STEPS = [
  {
    n: "01",
    title: "Pick one job, not one topic",
    body: "A brain about “our frontend” produces a vague goal, a vague exam and answers nobody trusts. A brain about “match our design system exactly” has a boundary, so it can be checked. When you catch yourself writing “and also”, that is the second brain asking to exist.",
    aside: "Rule of thumb: if two people would draw the boundary differently, it is two brains.",
  },
  {
    n: "02",
    title: "Write the goal as an outcome, not a subject",
    body: "The goal is not a label — it becomes the exam. “Design system” generates nothing testable. “Match our design system exactly: colour, type scale, spacing, component rules, and the empty and error states we actually ship” generates thirty concrete questions, including ones about material you have not uploaded yet. Those failures are the point.",
    aside: "Name the specifics you care about. Every noun in the goal turns into checks.",
  },
  {
    n: "03",
    title: "Feed it primary material",
    body: "Screenshots of the real screens, the actual docs pages, the actual config file. Not your summary of them — a summary has already thrown away the exact pixel value, the exact wording, the ordering. Extraction is asked for concrete values, and it can only find what you gave it.",
    aside: "Screenshots, PDFs, Markdown, and docs pages by URL. Paste twenty links at once.",
  },
  {
    n: "04",
    title: "Let the exam tell you what is missing",
    body: "After the first upload the brain sits its exam and shows a score per category. Ignore the number and read the failures: they name the material you have not added. “No source covers this” is a shopping list, not a criticism.",
    aside: "This is the loop. Upload, read the gaps, upload what they name, repeat.",
  },
  {
    n: "05",
    title: "Connect it before it is finished",
    body: "A half-trained brain is already more useful than none, and using it is how you find out which gaps actually hurt. The exam ranks by coverage; your work ranks by what you keep having to explain twice.",
    aside: "One command. See the connect page for your client.",
  },
  {
    n: "06",
    title: "Let agents write back, then review",
    body: "When an agent works out a convention or hits a pitfall, it can save it. Those notes wait in a review queue rather than going straight into search — which is what keeps a brain sharpening instead of drifting. Approving takes a second; the alternative is a brain full of half-true things nobody checked.",
    aside: "Review is on by default. Turn it off per brain once you trust the source.",
  },
];

const SELLING = [
  {
    step: "01",
    title: "Make it public and pick a field",
    body: "Both live on the brain's sharing page. The field is how someone browsing the catalogue finds you.",
  },
  {
    step: "02",
    title: "Keep the licence at CC BY-NC-SA",
    body: "Buyers may use and adapt it; reselling it is not allowed. MIT would let them resell, so a priced brain refuses that combination.",
  },
  {
    step: "03",
    title: "Set a price",
    body: "Paid once, not per month — buyers keep access as you keep adding to it. You receive 70% of each sale on your balance.",
  },
  {
    step: "04",
    title: "Withdraw when you want",
    body: "Earnings sit on your balance. Ask for a withdrawal from the balance page; payouts are sent in crypto by hand.",
  },
];

const MISTAKES = [
  {
    wrong: "“Everything about our product”",
    right: "One brain per thing an agent keeps getting wrong.",
  },
  {
    wrong: "Uploading your own notes about the docs",
    right: "Upload the docs. The model extracts better than you summarise.",
  },
  {
    wrong: "Waiting until the brain is “ready”",
    right: "Connect it at 30%. The gaps that matter reveal themselves in use.",
  },
  {
    wrong: "Chasing 100%",
    right:
      "The exam includes questions about material you may never need. A stable 70% on the categories you actually use beats a padded 95%.",
  },
];

export default async function GuidePage() {
  const user = await currentUser();

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">For people building brains</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", margin: ".4rem 0 1rem" }}
        >
          How to build a brain
          <br />
          worth connecting.
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0, fontSize: "1.0625rem" }}>
          The difference between a brain an agent reads and a folder of screenshots
          is almost entirely in the first two steps. The rest is a loop.
        </p>

        <ol style={{ listStyle: "none", padding: 0, margin: "clamp(2.5rem, 6vw, 4rem) 0 0" }}>
          {STEPS.map((step) => (
            <li
              key={step.n}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 3.5rem) 1fr",
                gap: "clamp(1rem, 3vw, 2rem)",
                paddingBottom: "2.5rem",
                marginBottom: "2.5rem",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <span
                className="display"
                style={{ fontSize: "1.75rem", color: "var(--color-riso-red)", lineHeight: 1 }}
              >
                {step.n}
              </span>
              <div>
                <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: ".6rem" }}>
                  {step.title}
                </h2>
                <p style={{ color: "var(--ink-2)", margin: "0 0 .75rem", maxWidth: "62ch" }}>
                  {step.body}
                </p>
                <p
                  className="mono"
                  style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: 0 }}
                >
                  {step.aside}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* A real run, so the numbers are not aspirational. */}
        <section style={{ marginTop: "1rem" }}>
          <h2 className="display" style={{ fontSize: "1.75rem", marginBottom: ".5rem" }}>
            What this looks like in practice
          </h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
            A design-system brain with eight notes in it, after its first exam:
          </p>

          <div className="scorecard" style={{ marginTop: "1.25rem", maxWidth: 620 }}>
            <div className="score-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                  30 checks · 7 categories
                </p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                  8 notes
                </span>
              </div>
              <div className="score-big">
                37<sup>%</sup>
              </div>
            </div>
            {[
              ["partial", "▲", "Colour and elevation", "3 / 6", null],
              ["partial", "▲", "Components", "2 / 7", "not enough material"],
              ["partial", "▲", "Empty and error states", "1 / 5", "not enough material"],
              ["fail", "✕", "Applying the system", "0 / 2", "no source covers this"],
            ].map(([state, sigil, name, count, gap]) => (
              <div key={name as string} className="score-row" data-state={state as string}>
                <span className="sig">{sigil}</span>
                <span>
                  {name}
                  {gap && <span className="score-gap">missing · {gap}</span>}
                </span>
                <span className="count">{count}</span>
              </div>
            ))}
          </div>

          <p style={{ color: "var(--ink-2)", marginTop: "1.25rem", maxWidth: "62ch" }}>
            37% is not a bad brain — it is eight notes measured against a goal that
            asks for far more. The value is the right-hand column: it says exactly
            which screenshots to take next. Nothing else in this product tells you
            that.
          </p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="display" style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
            Four ways it goes wrong
          </h2>
          <div className="panel" style={{ padding: 0 }}>
            {MISTAKES.map((m) => (
              <div
                key={m.wrong}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
                  gap: "1.25rem",
                  padding: ".9rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--color-riso-red)" }}>{m.wrong}</span>
                <span style={{ color: "var(--ink-2)", fontSize: ".9375rem" }}>{m.right}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          id="selling"
          style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", scrollMarginTop: "5rem" }}
        >
          <h2 className="display" style={{ fontSize: "1.75rem", marginBottom: ".5rem" }}>
            Selling one
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "64ch", marginTop: 0 }}>
            A brain is worth money when it holds something a buyer cannot read off a
            docs site: the shape of a real integration, a pipeline that took a month
            to get right, conventions nobody wrote down. Publishing costs nothing and
            the exam does the selling — a buyer sees the goal, the score, and every
            note title before paying.
          </p>

          <div className="panel" style={{ padding: 0, maxWidth: "64ch" }}>
            {SELLING.map((s) => (
              <div
                key={s.step}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.5rem 1fr",
                  gap: "1rem",
                  padding: ".9rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <span className="mono" style={{ color: "var(--ink-3)", fontSize: ".75rem" }}>
                  {s.step}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".9375rem" }}>
                    {s.body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ marginTop: "clamp(3rem, 7vw, 4rem)", maxWidth: "64ch" }}>
          <p className="eyebrow">One thing never to do</p>
          <h2 className="display" style={{ fontSize: "1.5rem", margin: ".5rem 0 .75rem" }}>
            Do not feed it secrets.
          </h2>
          <p style={{ color: "var(--ink-2)", margin: 0 }}>
            Screenshots of terminals and editors are full of tokens. Every source is
            scanned before anything is stored, and again on whatever an agent writes
            back — a brain that trips the scanner cannot be shared or published at
            all. Treat that as a backstop, not a licence: it is a filter, not a
            guarantee.
          </p>
        </section>

        <div style={{ display: "flex", gap: ".75rem", marginTop: "2.5rem", flexWrap: "wrap" }}>
          <Link className="btn" href={user ? "/brains/new" : "/sign-in"}>
            Build one
          </Link>
          <Link className="btn btn-ghost" href="/connect">
            Connect it
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
