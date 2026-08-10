import { translator } from "@/lib/t";
import { notFound } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Section } from "@/components/ui";
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
 * Shows every step, including the prompts and the rules: a workflow is bought
 * — or trusted — on whether its steps are the right ones, and a page that hid
 * them would be asking for faith. The brains behind it are what stay paid.
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
    <AppShell active="/workflows" eyebrow={`${handle}/${slug}`} title={w.title}>
      <div className="stack">
        {w.summary && <p style={{ maxWidth: "60ch" }}>{w.summary}</p>}

        <p className="mono" style={{ fontSize: ".8125rem" }}>
          {t("Run it from any agent:")} <code>/mozg:build {handle}/{slug}</code>
        </p>

        <Section title={t("The route")} aside={`${w.steps.length} ${t("steps")}`}>
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
        </Section>

        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
          <Link href="/build">{t("What workflows are")}</Link>
        </p>
      </div>
    </AppShell>
  );
}
