import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { anyCryptoReady, recentTopups } from "@/lib/payments";
import { formatCents } from "@/lib/money-math";
import AppShell from "@/components/AppShell";
import { Section, Rows, Row } from "@/components/ui";
import TopUpMethods from "./TopUpMethods";

export const dynamic = "force-dynamic";

export const metadata = { title: "Top up — mozg" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for payment",
  paid: "Credited",
  failed: "Failed",
};

export default async function TopUpPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/topup");

  const topups = await recentTopups(user.id, 8);

  return (
    <AppShell active="/settings/balance" eyebrow={user.email} title="Top up balance">
      <div className="stack">
        <TopUpMethods ready={anyCryptoReady} email={user.email} />

        <Section title="Recent top-ups" aside={<Link href="/settings/balance">balance →</Link>}>
          <Rows empty="Nothing yet. A top-up appears here the moment it is started, and turns into balance when the payment lands.">
            {topups.map((t) => (
              <Row
                key={t.reference}
                title={formatCents(t.amount_cents)}
                sub={STATUS_LABEL[t.status] ?? t.status}
                meta={t.created_at}
                side={
                  t.status === "pending" ? (
                    <a
                      href={t.pay_url ?? `/pay/${t.reference}`}
                      target={t.pay_url ? "_blank" : undefined}
                      rel="noreferrer noopener"
                    >
                      pay →
                    </a>
                  ) : undefined
                }
              />
            ))}
          </Rows>
        </Section>
      </div>
    </AppShell>
  );
}
