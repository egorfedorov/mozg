import { translator } from "@/lib/t";
import { notFound } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { currentUser } from "@/lib/session";
import { findWorkflow } from "@/lib/workflow-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const w = await findWorkflow(`${handle}/${slug}`, null);
  return {
    title: w ? `${w.title} — mozg` : "Workflow — mozg",
    description: w?.summary ?? undefined,
  };
}

/**
 * The public face of a route.
 *
 * Public chrome, not the workspace shell: AppShell renders nothing without a
 * session, so a signed-out visitor got a page with correct metadata and an
 * empty body — the one reader this page exists for saw the least.
 *
 * Every step is shown in full, prompts and rules included. A route is trusted
 * on whether its steps are the right ones, and a page that hid them would be
 * asking for faith. What stays paid is the brains behind it.
 */
export default async function PublicWorkflowPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const t = await translator();
  const { handle, slug } = await params;

  const user = await currentUser();
  const w = await findWorkflow(`${handle}/${slug}`, user?.id ?? null);
  if (!w) notFound();

  return (
    <>
      <TopBar />
      <Contents active="/build" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          {handle}/{slug}
        </p>
        <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".4rem 0 1rem" }}>
          {w.title}
        </h1>
        {w.summary && (
          <p style={{ maxWidth: "60ch", color: "var(--ink-2)", marginTop: 0 }}>{w.summary}</p>
        )}

        <p className="mono" style={{ fontSize: ".8125rem" }}>
          {t("Run it from any agent:")}{" "}
          <code>
            /mozg:build {handle}/{slug}
          </code>
        </p>

        <h2 className="h2">
          {t("The route")} · {w.steps.length} {t("steps")}
        </h2>

        <div className="wf-canvas">
          <div className="wf-node wf-node-end">
            <span className="eyebrow">{t("Start")}</span>
            <strong>{t("What the user asked for")}</strong>
          </div>
          {w.steps.map((s, i) => (
            <div key={i} className="wf-chain">
              <span className="wf-edge" aria-hidden />
              <div className="wf-node" style={{ cursor: "default" }}>
                <span className="eyebrow">
                  {t("Step")} {i + 1}
                </span>
                <strong>{s.title}</strong>
                {s.brain && (
                  <code className="mono wf-node-brain">
                    {t("reads")} {s.brain}
                  </code>
                )}
                {s.ask && <span className="wf-node-check">{s.ask}</span>}
                {s.rules && <span className="wf-node-check">⚑ {s.rules}</span>}
                {s.done_when && <span className="wf-node-check">✓ {s.done_when}</span>}
              </div>
            </div>
          ))}
          <span className="wf-edge" aria-hidden />
          <div className="wf-node wf-node-end">
            <span className="eyebrow">{t("Done")}</span>
            <strong>{t("The thing exists, and its checks passed")}</strong>
          </div>
        </div>

        <p style={{ marginTop: "2rem" }}>
          <Link className="btn" href="/workflows">
            {t("Build your own route")}
          </Link>{" "}
          <Link href="/build" className="mono" style={{ fontSize: ".8125rem" }}>
            {t("What workflows are")}
          </Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
