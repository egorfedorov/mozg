import Link from "next/link";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { msg } from "@/lib/msg";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { publicWorkflows } from "@/lib/workflow-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workflows — the order your work actually goes in",
  description:
    "A workflow is a named route through your brains: every step names what to read, what to ask it, the rules that hold, and the check that ends it. Your agent walks it with /mozg:build. Nothing runs on our side.",
};

/**
 * The workflows page.
 *
 * It shipped as a page about one slot game, because that was the first route
 * published — and so it read as a feature for one studio. The thing being
 * sold is wider than that: every trade has an order it works in, the order is
 * the expensive part to learn, and it lives in whoever learned it. So the
 * page argues from the general case, and the published routes are evidence
 * rather than subject.
 *
 * The illustration is drawn from a real route for the same reason it was the
 * last time: a hand-drawn one was wrong within the hour, naming brains that
 * do not exist and a check that ran on one laptop.
 */

/** Route shapes across trades. Labelled as shapes on the page, never dressed
 *  up as listings — the catalogue lower down is the real one. */
const SHAPES: { trade: string; goal: string; steps: string[]; tint: string }[] = [
  {
    trade: msg("Game studio"),
    goal: msg("Ship a slot to a platform that reviews it"),
    steps: [msg("spec"), msg("math"), msg("books"), msg("front end"), msg("approval")],
    tint: "violet",
  },
  {
    trade: msg("Web team"),
    goal: msg("Move a framework major version without breaking a Friday"),
    steps: [
      msg("read the migration"),
      msg("inventory"),
      msg("codemod"),
      msg("tests"),
      msg("staged rollout"),
    ],
    tint: "blue",
  },
  {
    trade: msg("Solo developer"),
    goal: msg("Take a prototype to something with saves and settings"),
    steps: [msg("save format"), msg("versioning"), msg("scene flow"), msg("input"), msg("build")],
    tint: "green",
  },
  {
    trade: msg("Agency"),
    goal: msg("Onboard a codebase nobody here wrote"),
    steps: [msg("map"), msg("conventions"), msg("run it"), msg("first change"), msg("write back")],
    tint: "orange",
  },
  {
    trade: msg("Anyone with an API"),
    goal: msg("Write documentation an agent can actually follow"),
    steps: [msg("audit"), msg("shape"), msg("examples"), msg("verify"), msg("publish")],
    tint: "red",
  },
  {
    trade: msg("Research"),
    goal: msg("Turn a week of reading into a brief somebody can act on"),
    steps: [msg("sources"), msg("extract"), msg("contradictions"), msg("brief"), msg("review")],
    tint: "yellow",
  },
];

const ANATOMY: { k: string; v: string }[] = [
  {
    k: msg("The brain"),
    v: msg("What to read before writing anything — material that sat an exam and has a score, not something remembered from training."),
  },
  {
    k: msg("The prompt"),
    v: msg("What to ask it, in that brain's own words. Those are the words it can actually find."),
  },
  {
    k: msg("The rules"),
    v: msg("What always and never holds while the step runs. \"Never hand-edit a generated file.\" They survive after the question is answered."),
  },
  {
    k: msg("The check"),
    v: msg("How the agent knows the step is done. A command that exits zero, not a feeling."),
  },
];

const RUNTIME: { k: string; v: string }[] = [
  {
    k: msg("One command"),
    v: msg("/mozg:build handle/route — from Claude Code, Codex, Cursor, anything that speaks MCP."),
  },
  {
    k: msg("It checks the shelf first"),
    v: msg("A route names the brains it needs. Missing or unbought ones are named before any work starts, not at step nine."),
  },
  {
    k: msg("It can go back"),
    v: msg("A failing check sends the agent back a step. That is judgement at runtime, which no drawn arrow can express."),
  },
  {
    k: msg("It reports"),
    v: msg("Which step found nothing, which check did not pass. The author then fixes the route from data rather than memory."),
  },
];

function Canvas({ steps }: { steps: { title: string; brain?: string; done_when?: string }[] }) {
  return (
    <div className="wf-canvas" style={{ marginBlock: "1.5rem" }}>
      <div className="wf-node wf-node-end">
        <span className="eyebrow">Start</span>
        <strong>What the user asked for</strong>
      </div>
      {steps.map((s, i) => (
        <div key={i} className="wf-chain">
          <span className="wf-edge" aria-hidden />
          <div className="wf-node" style={{ cursor: "default" }}>
            <span className="eyebrow">Step {i + 1}</span>
            <strong>{s.title}</strong>
            {s.brain && <code className="mono wf-node-brain">reads {s.brain}</code>}
            {s.done_when && <span className="wf-node-check">✓ {s.done_when}</span>}
          </div>
        </div>
      ))}
      <span className="wf-edge" aria-hidden />
      <div className="wf-node wf-node-end">
        <span className="eyebrow">Done</span>
        <strong>The thing exists, and its checks passed</strong>
      </div>
    </div>
  );
}

export default async function BuildPage() {
  const t = await translator();
  const published = await publicWorkflows(12);
  const featured = published[0];

  return (
    <>
      <TopBar />
      <Contents active="/build" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("Workflows")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.1rem, 6vw, 4rem)", margin: ".4rem 0 1.25rem" }}
        >
          {markup(t("Knowing things is not the hard part. <0/>Knowing the order is."), [
            <br key="s0" />,
          ])}
        </h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "56ch",
            marginTop: 0,
          }}
        >
          {t("Every trade has a sequence: what gets settled before anyone builds, what nobody touches until the numbers agree, what has to pass before it goes out. It takes a year to learn, it lives in whoever learned it, and it leaves when they do. A workflow is that sequence written down once — and walked by the agent you already pay for.")}
        </p>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
          <Link className="btn" href="/workflows">
            {t("Write one")}
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            {t("See what is published")}
          </Link>
        </div>

        <h2 className="h2" style={{ marginTop: "3rem" }}>
          {t("A step carries four things")}
        </h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          {t("Together they are the difference between an instruction an agent interprets and one it can be held to.")}
        </p>
        <div className="grid-brains" style={{ marginTop: "1.25rem" }}>
          {ANATOMY.map((x) => (
            <div key={x.k} className="panel" style={{ display: "grid", gap: ".4rem" }}>
              <span className="eyebrow">{t(x.k)}</span>
              <p style={{ margin: 0, fontSize: ".95rem" }}>{t(x.v)}</p>
            </div>
          ))}
        </div>

        <h2 className="h2" style={{ marginTop: "3rem" }}>
          {t("Routes worth writing")}
        </h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          {t("Shapes, not listings — the published ones are further down. The test is simple: if your team repeats a sequence and argues about it, that sequence is a route.")}
        </p>
        <div className="grid-brains" style={{ marginTop: "1.25rem" }}>
          {SHAPES.map((s) => (
            <div key={s.trade} className="card" data-tint={s.tint} style={{ minHeight: 200 }}>
              <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
                {t(s.trade)}
              </span>
              <h3 className="card-title" style={{ fontSize: "1.18rem" }}>
                {t(s.goal)}
              </h3>
              <p
                className="mono"
                style={{ fontSize: ".72rem", marginTop: "auto", marginBottom: 0, opacity: 0.85 }}
              >
                {s.steps.map((step) => t(step)).join("  →  ")}
              </p>
            </div>
          ))}
        </div>

        {featured && (
          <>
            <h2 className="h2" style={{ marginTop: "3rem" }}>
              {t("A published route, drawn from itself")}
            </h2>
            <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
              {t("Not a screenshot — this is read from the route, so what you see is what your agent gets.")}
            </p>
            <Canvas steps={featured.steps.slice(0, 6)} />
            {featured.handle && (
              <p className="mono" style={{ fontSize: ".8125rem" }}>
                <Link href={`/w/${featured.handle}/${featured.slug}`}>
                  {featured.title} — {featured.steps.length}{" "}
                  {t("steps, with every prompt and rule")}
                </Link>
              </p>
            )}
          </>
        )}

        <h2 className="h2" style={{ marginTop: "3rem" }}>
          {t("Your agent runs it. Nothing runs here.")}
        </h2>
        <div className="grid-brains" style={{ marginTop: "1.25rem" }}>
          {RUNTIME.map((x) => (
            <div key={x.k} className="panel" style={{ display: "grid", gap: ".4rem" }}>
              <span className="eyebrow">{t(x.k)}</span>
              <p style={{ margin: 0, fontSize: ".95rem" }}>{t(x.v)}</p>
            </div>
          ))}
        </div>
        <pre
          className="mono panel"
          style={{ padding: "1rem", overflowX: "auto", marginTop: "1.25rem" }}
        >
          <code>
            /mozg:build{" "}
            {featured?.handle ? `${featured.handle}/${featured.slug}` : "your-route"}
          </code>
        </pre>

        <h2 className="h2" style={{ marginTop: "3rem" }}>
          {t("Why this is a list and not a canvas of boxes")}
        </h2>
        <p style={{ maxWidth: "60ch" }}>
          {t("Visual builders are good at what they do — wiring services together, where every branch is known before it runs. A build is not that. Nobody can draw the arrow for \"the RTP came out at 94.2%, go back two steps and reweight\"; you can only write the check and let something with judgement decide. So a route here is an ordered list with a check on every step, and the judgement belongs to the agent walking it. The day real branches are needed, that is a graph — and a graph is a different product.")}
        </p>

        {published.length > 0 && (
          <>
            <h2 className="h2" style={{ marginTop: "3rem" }}>
              {t("Published routes")}
            </h2>
            <div className="rows">
              {published.map((w) => (
                <Link
                  key={w.id}
                  className="row"
                  href={w.handle ? `/w/${w.handle}/${w.slug}` : "/workflows"}
                >
                  <span style={{ minWidth: 0 }}>
                    <strong>{w.title}</strong>
                    {w.summary && <span className="row-sub">{w.summary}</span>}
                    <span className="row-meta">
                      {w.handle ?? "—"}/{w.slug} · {w.steps.length} {t("steps")} ·{" "}
                      {new Set(w.steps.map((s) => s.brain).filter(Boolean)).size} {t("brains")}
                    </span>
                  </span>
                  <span className="row-side">{t("Open")}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <section
          className="panel"
          style={{
            marginTop: "3rem",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 30ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              {t("Write down the order once.")}
            </h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              {t("Then it runs from anyone's terminal, on the same material, with the same checks — including the terminal of whoever joins next month.")}
            </p>
          </div>
          <Link className="btn" href="/workflows">
            {t("Build a workflow")}
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
