import Link from "next/link";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { publicWorkflows } from "@/lib/workflow-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workflows — build with the brains, in order",
  description:
    "A workflow is a named route through your brains: the steps of a whole job, each naming the brain to read, the prompt, the rules and the check. Your agent runs it with /mozg:build.",
};

/** The canvas, drawn from the same classes the editor uses — a screenshot of
 *  the product goes stale the week after it ships; this cannot. */
function Canvas() {
  const steps = [
    { n: 1, title: "Concept and theme", brain: "slot-design", check: "a one-page spec exists" },
    { n: 2, title: "Math model", brain: "stake-engine-math-sdk", check: "RTP within 0.1% of target" },
    { n: 3, title: "Books and LUTs", brain: "stake-engine-canonical-books", check: "validator exits zero" },
    { n: 4, title: "Front end", brain: "pixijs-casino", check: "runs at 60fps on the mid profile" },
    { n: 5, title: "Publish checks", brain: "stake-engine-approval", check: "/checkgame says GO" },
  ];

  return (
    <div className="wf-canvas" style={{ marginBlock: "1.5rem" }}>
      <div className="wf-node wf-node-end">
        <span className="eyebrow">Start</span>
        <strong>&ldquo;Make me a slot game for Stake Engine&rdquo;</strong>
      </div>
      {steps.map((s) => (
        <div key={s.n} className="wf-chain">
          <span className="wf-edge" aria-hidden />
          <div className="wf-node" style={{ cursor: "default" }}>
            <span className="eyebrow">Step {s.n}</span>
            <strong>{s.title}</strong>
            <code className="mono wf-node-brain">reads {s.brain}</code>
            <span className="wf-node-check">✓ {s.check}</span>
          </div>
        </div>
      ))}
      <span className="wf-edge" aria-hidden />
      <div className="wf-node wf-node-end">
        <span className="eyebrow">Done</span>
        <strong>The game exists, and its checks passed</strong>
      </div>
    </div>
  );
}

export default async function BuildPage() {
  const t = await translator();
  const published = await publicWorkflows(12);

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
          {t("A brain knows things. A workflow gets things built.")}
        </h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "54ch",
            marginTop: 0,
          }}
        >
          {t(
            "Knowing which brain answers a question is easy. Knowing the order — concept, " +
              "then math, then books, then the front end, then the publish checks — is the part " +
              "that takes a year to learn and one page to write down.",
          )}
        </p>

        <Canvas />

        <h2 className="h2">{t("Every step carries four things")}</h2>
        <ul style={{ maxWidth: "60ch", lineHeight: 1.7 }}>
          <li>
            <strong>{t("The brain")}</strong> — {t("what to read before writing anything.")}
          </li>
          <li>
            <strong>{t("The prompt")}</strong> —{" "}
            {t("what to ask it, in the words that brain actually uses.")}
          </li>
          <li>
            <strong>{t("The rules")}</strong> —{" "}
            {t("what always and never holds while the step runs.")}
          </li>
          <li>
            <strong>{t("The check")}</strong> —{" "}
            {t("how the agent knows the step is done. A command, not a feeling.")}
          </li>
        </ul>

        <h2 className="h2">{t("Your agent runs it — nothing runs here")}</h2>
        <p style={{ maxWidth: "60ch" }}>
          {t(
            "mozg stores the route and serves it over MCP. The agent you already pay for " +
              "executes it: it reads the brains, writes the files, runs the checks, and can go " +
              "back a step when a check fails — which is exactly what a drawn arrow cannot do. " +
              "No tokens of ours, no sandbox, no second bill.",
          )}
        </p>
        <pre className="mono panel" style={{ padding: "1rem", overflowX: "auto" }}>
          <code>/mozg:build stake-slot</code>
        </pre>

        {published.length > 0 && (
          <>
            <h2 className="h2">{t("Published routes")}</h2>
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
                      {w.handle ?? "—"}/{w.slug} · {w.steps.length} {t("steps")}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        <p style={{ marginTop: "2rem" }}>
          <Link className="btn" href="/workflows">
            {t("Build a workflow")}
          </Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
