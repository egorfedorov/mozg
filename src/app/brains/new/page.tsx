import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { currentUser } from "@/lib/session";
import NewBrainForm from "./NewBrainForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "New brain — mozg" };

export default async function NewBrainPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/brains/new");

  return (
    <AppShell active="/brains/new" eyebrow="One job per brain" title="New brain" narrow>
      <NewBrainForm />
    </AppShell>
  );
}
