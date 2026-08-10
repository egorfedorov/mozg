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

/**
 * The illustration is a real route, not a drawing of one.
 *
 * The first version of this page invented its own five steps, and within an
 * hour they were wrong in both directions: they named brains that do not
 * exist in the catalogue and a check that only runs on one laptop. A picture
 * of the product that nobody has to keep in step with the product is the only
 * kind that stays true, so this renders whichever route is published.
 */
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
  // Whatever is published leads the page. No route published yet means no
  // canvas — an illustration of a product with nothing in it would be a
  // drawing again, and drawings drift.
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

        {featured && (
          <>
            <Canvas steps={featured.steps} />
            <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              {featured.handle ? (
                <Link href={`/w/${featured.handle}/${featured.slug}`}>
                  {featured.title} — {featured.steps.length} {t("steps, with every prompt and rule")}
                </Link>
              ) : (
                featured.title
              )}
            </p>
          </>
        )}

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
          <code>
            /mozg:build {featured?.slug ?? "your-route"}
          </code>
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
