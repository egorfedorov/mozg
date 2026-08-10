import { translator } from "@/lib/t";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { currentUser } from "@/lib/session";
import { findWorkflow } from "@/lib/workflow-store";
import { listBrains } from "@/lib/brains";
import WorkflowEditor from "./WorkflowEditor";

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
    </AppShell>
  );
}
