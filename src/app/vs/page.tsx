import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { SketchDefs, Divergence, Scribble, Panel } from "@/components/Sketch";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "A brain and a Skill file — mozg",
  description:
    "A Skill file is written once and is the same three months later. A brain is served, re-read and corrected. When each one is the right answer.",
};

/**
 * Why not just write a Skill file?
 *
 * The honest answer has two halves, and a page that only gives the first is an
 * advertisement. A file wins on independence: offline, no account, no latency,
 * nothing to go down. A brain wins on time: it is re-read, corrected, and
 * measured. Say both, and the reader can tell which one they need.
 */

const DIFFERENCES: {
  q: string;
  file: string;
  brain: string;
  tint: string;
}[] = [
  {
    q: "Where does it live?",
    file: "A file in your repository, on your disk.",
    brain: "On the server, read over MCP as the agent works.",
    tint: "var(--color-riso-blue)",
  },
  {
    q: "What happens when the source changes?",
    file: "Nothing. Someone has to notice and rewrite it.",
    brain:
      "The pages behind it are re-read every six hours by content hash. What changed is replaced; what did not costs one request.",
    tint: "var(--color-riso-green)",
  },
  {
    q: "How big can it get?",
    file: "As big as the context you are willing to spend on it, every call.",
    brain:
      "Our largest brain holds nearly seven hundred notes. The agent searches and takes the five it needs.",
    tint: "var(--color-riso-violet)",
  },
  {
    q: "Do you know what it does not know?",
    file: "No. It answers with whatever it happens to contain.",
    brain:
      "Its goal becomes an exam. The score names the categories it cannot answer, and the agent is told the gaps before it searches.",
    tint: "var(--color-riso-red)",
  },
  {
    q: "What happens when someone learns something new?",
    file: "They edit their copy. Yours stays as it was.",
    brain:
      "An agent writes it back, the owner approves it, and every agent has it.",
    tint: "var(--color-riso-orange)",
  },
];

export default async function VsPage() {
  const t = await translator();

  const user = await currentUser();

  return (
    <>
      <SketchDefs />
      <TopBar />
      <Contents active="/vs" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("A brain and a file")}</p>
        <h1 className="h1" style={{ margin: ".4rem 0 1rem" }}>
          {markup(t("Both are just text <0/> an agent reads."), [
          <br key="s0" />,
        ])}</h1>
        <p className="lede" style={{ fontSize: "1.0625rem" }}>
          {t("The difference is not format. It is what happens to them over the next three months, while you are busy.")}</p>

        {/* The signature. Time is the axis because time is the actual
            difference — a table of ticks would have said less. */}
        <figure style={{ margin: "clamp(2.5rem, 6vw, 4rem) 0 0" }}>
          <Divergence />
          <figcaption
            className="mono"
            style={{
              fontSize: ".75rem",
              color: "var(--ink-3)",
              marginTop: ".5rem",
              maxWidth: "56ch",
            }}
          >
            {t("The crosses are re-reads: a page changed, the notes taken from it were replaced. Nobody typed anything on those days.")}</figcaption>
        </figure>

        <div style={{ margin: "clamp(2.5rem, 6vw, 3.5rem) 0" }}>
          <Scribble />
        </div>

        <section>
          <h2 className="h2" style={{ marginBottom: "1.25rem" }}>
            {t("Five questions, answered twice")}</h2>

          <div className="vs-grid">
            {/* The labels ride the same grid as the answers, so they line up
                with the columns they name instead of near them. */}
            <div className="vs-row vs-head">
              <div className="vs-pair">
                <span className="eyebrow">{t("A Skill file")}</span>
                <span className="eyebrow" style={{ color: "var(--color-riso-red)" }}>
                  {t("A brain")}</span>
              </div>
            </div>

            {DIFFERENCES.map((d) => (
              <div key={d.q} className="vs-row" style={{ ["--q" as string]: d.tint }}>
                <p className="vs-q">{d.q}</p>
                <div className="vs-pair">
                  <p className="vs-file">{d.file}</p>
                  <p className="vs-brain">{d.brain}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The half that makes the rest believable. */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            {t("When a file is the right answer")}</h2>
          <p className="lede" style={{ marginBottom: "1.25rem" }}>
            {t("Often. A brain is a service, and a service is a dependency.")}</p>

          <div className="sk-strip">
            <Panel n="—" title={t("It never changes")} tint="var(--ink-2)">
              <p>
                {t("Your commit conventions, your directory layout, the three rules everyone breaks. Written once, true for years. Re-reading a source that has no source is machinery for nothing.")}</p>
            </Panel>
            <Panel n="—" title={t("You work offline")} tint="var(--ink-2)">
              <p>
                {t("A brain needs the network and an account. A file needs neither, and on a plane that is the whole argument.")}</p>
            </Panel>
            <Panel n="—" title={t("It is three paragraphs")} tint="var(--ink-2)">
              <p>
                {t("Search earns its keep somewhere past a hundred notes. Below that, putting the whole thing in context is simpler and cheaper.")}</p>
              <p>
                {markup(t("Any brain exports to <0>CLAUDE.md</0>, a Skill or <1>AGENTS.md</1> — take the snapshot and go."), [
                <code className="mono" key="s0" />,
                <code className="mono" key="s1" />,
              ])}</p>
            </Panel>
          </div>
        </section>

        <section
          className="panel"
          style={{
            marginTop: "clamp(3rem, 7vw, 4rem)",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            borderWidth: "2px",
          }}
        >
          <div style={{ flex: "1 1 32ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              {t("Use both.")}</h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              {t("A file for what you decided and will not revisit. A brain for anything with a source that keeps moving — an SDK, an API, a design system, a platform someone else maintains.")}</p>
          </div>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <Link className="btn" href={user ? "/brains/new" : "/sign-in"}>
              {t("Build one")}</Link>
            <Link className="btn btn-ghost" href="/explore">
              {t("Take one that exists")}</Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
