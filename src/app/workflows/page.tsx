import { translator } from "@/lib/t";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Section, Rows, Row } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { listWorkflows, publicWorkflows } from "@/lib/workflow-store";
import NewWorkflowForm from "./NewWorkflowForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Workflows — mozg" };

/**
 * The routes through the shelf.
 *
 * A brain answers a question; a workflow is the order the questions get asked
 * in to build a whole thing. It lives here rather than in the agent because a
 * route is worth more shared than remembered — the same steps run from anyone's
 * terminal, and a good one is a product.
 */
export default async function WorkflowsPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/workflows");

  const [mine, shared] = await Promise.all([listWorkflows(user.id), publicWorkflows(20)]);
  const others = shared.filter((w) => w.owner_id !== user.id);

  return (
    <AppShell active="/workflows" eyebrow={t("Build")} title={t("Workflows")}>
      <div className="stack">
        <p style={{ maxWidth: "60ch" }}>
          {t(
            "A workflow is a named route through your brains: the steps of a whole job, " +
              "each naming the brain to read, what to ask it, and the check that ends it. " +
              "Your agent runs it with /mozg:build — nothing executes on our side.",
          )}
        </p>

        <Section title={t("Yours")} aside={`${mine.length}`}>
          <Rows empty={t("No workflows yet. The first one takes a minute.")}>
            {mine.map((w) => (
              <Row
                key={w.id}
                href={`/workflows/${w.slug}`}
                title={w.title}
                sub={w.summary ?? undefined}
                meta={
                  `${w.steps.length} ${w.steps.length === 1 ? t("step") : t("steps")} · ` +
                  (w.visibility === "public" ? t("public") : t("private"))
                }
                side={<code className="mono">/mozg:build {w.slug}</code>}
              />
            ))}
          </Rows>
        </Section>

        <Section title={t("New workflow")}>
          <NewWorkflowForm />
        </Section>

        {others.length > 0 && (
          <Section title={t("Published by others")} aside={`${others.length}`}>
            <Rows>
              {others.map((w) => (
                <Row
                  key={w.id}
                  href={w.handle ? `/w/${w.handle}/${w.slug}` : `/workflows`}
                  title={w.title}
                  sub={w.summary ?? undefined}
                  meta={`${w.handle ?? "—"}/${w.slug} · ${w.steps.length} ${t("steps")}`}
                />
              ))}
            </Rows>
          </Section>
        )}
      </div>
    </AppShell>
  );
}
