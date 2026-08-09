import { translator } from "@/lib/t";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { anyCryptoReady, recentTopups } from "@/lib/payments";
import { availableCoins } from "@/lib/mozgpay-chains";
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
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/topup");

  const topups = await recentTopups(user.id, 8);

  return (
    <AppShell active="/settings/balance" eyebrow={user.email} title={t("Top up balance")}>
      <div className="stack">
        <TopUpMethods
          ready={anyCryptoReady}
          coins={(await availableCoins()).map((c) => ({ key: c.key, label: c.label, note: c.note }))}
        />

        <Section title={t("Recent top-ups")} aside={<Link href="/settings/balance">{t("balance →")}</Link>}>
          <Rows empty={t("Nothing yet. A top-up appears here the moment it is started, and turns into balance when the payment lands.")}>
            {topups.map((topup) => (
              <Row
                key={topup.reference}
                title={formatCents(topup.amount_cents)}
                sub={STATUS_LABEL[topup.status] ?? topup.status}
                meta={topup.created_at}
                side={
                  topup.status === "pending" ? (
                    <a
                      href={topup.pay_url ?? `/pay/${topup.reference}`}
                      target={topup.pay_url ? "_blank" : undefined}
                      rel="noreferrer noopener"
                    >
                      {t("pay →")}
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
