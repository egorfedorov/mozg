import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { SketchDefs, Panel, Scribble } from "@/components/Sketch";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Making a brain, in six panels — mozg",
  description:
    "Pick one job, write the goal as an outcome, feed primary material, read the failures, connect it early, let agents correct it.",
};

/**
 * The guide as a strip.
 *
 * These really are six beats in order — each one needs the one before it, and
 * doing them out of order is the most common way a brain comes out useless. So
 * the numbering carries information rather than decorating, which is the only
 * reason to number anything.
 */
const BEATS: {
  n: string;
  title: string;
  tint: string;
  body: string[];
  aside: string;
}[] = [
  {
    n: "01",
    title: "Pick one job",
    tint: "var(--color-riso-red)",
    body: [
      "Not one topic. “Our frontend” produces a vague goal, a vague exam, and answers nobody trusts.",
      "“Match our design system exactly” has an edge, so it can be checked.",
    ],
    aside: "Caught yourself writing “and also”? That is the second brain asking to exist.",
  },
  {
    n: "02",
    title: "Write the goal as an outcome",
    tint: "var(--color-riso-orange)",
    body: [
      "The goal is not a label. It becomes the exam, so every noun in it turns into questions.",
      "“Design system” tests nothing. “Colour, type scale, spacing, and the empty and error states we actually ship” generates thirty, including about material you have not uploaded.",
    ],
    aside: "Those failures are the point. They are the shopping list.",
  },
  {
    n: "03",
    title: "Feed it the real thing",
    tint: "var(--color-riso-violet)",
    body: [
      "The actual screens, the actual docs page, the actual config. Not your summary — a summary has already thrown away the exact value, the exact wording, the ordering.",
      "Screenshots, PDFs, Markdown, and pages by URL. Paste twenty links at once.",
    ],
    aside: "A docs site that ships a JavaScript shell reads as “Loading”. Feed its repository instead.",
  },
  {
    n: "04",
    title: "Read the failures, not the number",
    tint: "var(--color-riso-green)",
    body: [
      "The score is a measurement, not a grade. What matters is which categories it cannot answer, and why.",
      "Three different reasons look identical in the number: the note is thin, the answer ranked too low, or the material is simply absent. The diagnosis separates them.",
    ],
    aside: "“Not in the documentation” is a correct answer. Do not chase it away with filler.",
  },
  {
    n: "05",
    title: "Connect it before it is finished",
    tint: "var(--color-riso-blue)",
    body: [
      "A half-built brain beats none, and using it is how you find out which gaps actually hurt.",
      "The exam ranks by coverage. Your work ranks by what you keep explaining twice.",
    ],
    aside: "One command. It is on the connect page for your client.",
  },
  {
    n: "06",
    title: "Let agents correct it",
    tint: "var(--graphite)",
    body: [
      "When an agent works something out — a convention, a pitfall, a thing the docs got wrong — it writes it back.",
      "The note waits for you. Approving is what makes it searchable, which is what keeps a brain sharpening instead of drifting.",
    ],
    aside: "Never save a credential. The scanner refuses them, but that is a backstop, not a licence.",
  },
];

export default async function MakePage() {
  const user = await currentUser();

  return (
    <>
      <SketchDefs />
      <TopBar active="guide" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">For people making brains</p>
        <h1 className="h1" style={{ margin: ".4rem 0 1rem" }}>
          Six panels, in order.
        </h1>
        <p className="lede" style={{ fontSize: "1.0625rem" }}>
          Almost everything that makes a brain useless happens in the first two.
          The rest is a loop you run until it stops telling you anything new.
        </p>

        <div style={{ margin: "2rem 0 clamp(2rem, 5vw, 3rem)" }}>
          <Scribble />
        </div>

        <ol className="strip" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {/* No arrows between panels: the strip wraps, and an arrow at the end
              of a row points at nothing. The numbers carry the order. */}
          {BEATS.map((b) => (
            <li key={b.n}>
              <Panel n={b.n} title={b.title} tint={b.tint} aside={b.aside}>
                {b.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </Panel>
            </li>
          ))}
        </ol>

        <section
          className="panel"
          style={{
            marginTop: "clamp(3rem, 7vw, 4rem)",
            borderWidth: "2px",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 30ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              Start with one folder.
            </h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              Something you explain to an agent over and over. Twenty minutes to
              the first score, and the first score will be low — that is the tool
              working.
            </p>
          </div>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <Link className="btn" href={user ? "/brains/new" : "/sign-in"}>
              Make one
            </Link>
            <Link className="btn btn-ghost" href="/guide">
              The long version
            </Link>
            <Link className="btn btn-ghost" href="/vs">
              Why not a file?
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
