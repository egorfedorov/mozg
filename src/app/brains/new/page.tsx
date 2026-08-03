import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { currentUser } from "@/lib/session";
import { possibleParents } from "@/lib/families";
import NewBrainForm from "./NewBrainForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "New brain — mozg" };

export default async function NewBrainPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/brains/new");

  const parents = await possibleParents(user.id);

  return (
    <AppShell active="/brains/new" eyebrow="One job per brain" title="New brain" narrow>
      <NewBrainForm parents={parents.map((p) => ({ id: p.id, title: p.title }))} />
    </AppShell>
  );
}
