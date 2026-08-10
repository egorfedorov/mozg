import { translator } from "@/lib/t";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { currentUser } from "@/lib/session";
import { findWorkflow } from "@/lib/workflow-store";
import { listBrains } from "@/lib/brains";
import WorkflowEditor from "./WorkflowEditor";
import { query } from "@/db";
import { Section, Rows, Row } from "@/components/ui";
import type { StepReport } from "@/lib/workflows";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await translator();
  const { slug } = await params;

  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/workflows/${slug}`);

  const w = await findWorkflow(slug, user.id);
  if (!w || w.owner_id !== user.id) notFound();

  // The handles the owner can actually reach, so a step names a brain that
  // exists rather than one they half-remember.
  const brains = await listBrains(user.id);

  // What actually happened when agents walked it. The point of the list is
  // the steps that came back dry — those are the route's bugs, in the words
  // of whoever hit them.
  const runs = await query<{ steps: StepReport[]; summary: string | null; created_at: Date }>(
    `select steps, summary, created_at from workflow_runs
      where workflow_id = $1 order by created_at desc limit 10`,
    [w.id],
  );

  return (
    <AppShell active="/workflows" eyebrow={t("Workflow")} title={w.title}>
      <WorkflowEditor
        slug={w.slug}
        title={w.title}
        summary={w.summary ?? ""}
        visibility={w.visibility}
        steps={w.steps}
        handles={brains.map((b) => b.slug)}
      />

      {runs.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <Section title={t("Runs")} aside={`${runs.length}`}>
            <Rows>
              {runs.map((r, i) => {
                const dry = r.steps.filter((s) => s.found === false);
                const failed = r.steps.filter((s) => s.passed === false);
                return (
                  <Row
                    key={i}
                    title={r.summary ?? t("A run of this route")}
                    sub={
                      dry.length || failed.length
                        ? [
                            dry.length
                              ? `${t("no material at step")} ${dry.map((s) => s.step).join(", ")}`
                              : null,
                            failed.length
                              ? `${t("check failed at step")} ${failed.map((s) => s.step).join(", ")}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : t("every step found what it needed")
                    }
                    meta={new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}
                    tint={dry.length ? "orange" : failed.length ? "red" : undefined}
                    side={`${r.steps.length} ${t("steps")}`}
                  />
                );
              })}
            </Rows>
          </Section>
        </div>
      )}
    </AppShell>
  );
}
