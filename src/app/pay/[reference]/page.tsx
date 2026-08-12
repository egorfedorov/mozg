import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { COINS } from "@/lib/mozgpay-chains";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import AutoRefresh from "@/components/AutoRefresh";
import { maybeOne } from "@/db";
import { currentUser } from "@/lib/session";
import { formatCents } from "@/lib/money-math";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay — mozg" };

/**
 * A mozgpay invoice: the address, the EXACT amount, and a page that watches
 * itself. The exactness is load-bearing — the last decimals are how the
 * watcher tells this payment from every other one, so the copy button copies
 * all six decimals and the text says why.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const t = await translator();

  const { reference } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/pay/${reference}`)}`);

  const invoice = await maybeOne<{
    reference: string;
    amount_cents: number;
    status: string;
    chain: string | null;
    pay_address: string | null;
    pay_amount: string | null;
    pay_coin: string | null;
    purpose: string;
    buy_title: string | null;
    expires_at: Date | null;
  }>(
    `select t.reference, t.amount_cents, t.status, t.chain, t.pay_address,
            t.pay_amount::text, t.pay_coin, t.purpose, b.title as buy_title, t.expires_at
       from topups t left join brains b on b.id = t.buy_brain_id
      where t.reference = $1 and t.user_id = $2 and t.provider = 'mozgpay'`,
    [reference, user.id],
  );
  if (!invoice) notFound();

  const pending = invoice.status === "pending";
  const paid = invoice.status === "paid";

  const coin = COINS.find((c) => c.key === invoice.pay_coin) ?? COINS[0];
  const symbol = coin.label.split(" ")[0];

  // "100", not "100.000000" — the tail shows only when it means something.
  const shownAmount = (invoice.pay_amount ?? "").replace(/\.?0+$/, "");
  const hasFingerprint = shownAmount.includes(".") && coin.stable;

  const qr =
    pending && invoice.pay_address
      ? await QRCode.toString(invoice.pay_address, {
          type: "svg",
          margin: 0,
          width: 168,
          color: { dark: "#14161a", light: "#0000" },
        })
      : null;

  return (
    <>
      <TopBar />
      <main className="shell" style={{ paddingBlock: "clamp(3rem, 8vw, 5rem)", maxWidth: 760 }}>
        <p className="eyebrow">
          {invoice.purpose === "buy" && invoice.buy_title
            ? markup(t("Buying “<0/>”"), [invoice.buy_title])
            : t("Topping up your balance")}
        </p>
        <h1 className="h1" style={{ margin: ".5rem 0 1rem" }}>
          {paid ? t("Paid. You're set.") : pending ? t("Send the exact amount") : t("This invoice expired")}
        </h1>

        {paid ? (
          <>
            <p className="lede">
              {markup(t("<0/> landed <1/>"), [
              formatCents(invoice.amount_cents),
              invoice.purpose === "buy" && invoice.buy_title
                ? ` and “${invoice.buy_title}” is unlocked for your agents.`
                : t(" on your balance."),
            ])}</p>
            <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
              <Link className="btn" href={invoice.purpose === "buy" ? "/brains" : "/settings/balance"}>
                {invoice.purpose === "buy" ? t("Open your brains") : t("See the balance")}
              </Link>
            </div>
          </>
        ) : pending ? (
          <>
            <div className="panel" style={{ display: "grid", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 260px", display: "grid", gap: "1rem" }}>
                  <div>
                    <p className="eyebrow" style={{ margin: "0 0 .3rem" }}>
                      {t("Amount — send exactly this")}</p>
                    <code className="mono" style={{ fontSize: "1.5rem", userSelect: "all" }}>
                      {shownAmount} {symbol}
                    </code>
                    {hasFingerprint && (
                      <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: ".35rem 0 0" }}>
                        {t("the decimals are how this payment is recognised — a rounded amount will not match")}</p>
                    )}
                  </div>
                  <div>
                    <p className="eyebrow" style={{ margin: "0 0 .3rem" }}>
                      {markup(t("To this address · <0/> · <1/>"), [
                      coin.label,
                      coin.network,
                    ])}</p>
                    <code className="mono" style={{ fontSize: ".9375rem", userSelect: "all", overflowWrap: "anywhere" }}>
                      {invoice.pay_address}
                    </code>
                  </div>
                </div>
                {qr && (
                  <div
                    aria-label={t("Address as a QR code")}
                    style={{ padding: ".75rem", border: "1.5px solid var(--ink)", background: "var(--paper)" }}
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                )}
              </div>
              <AutoRefresh
                active
                intervalMs={10_000}
                label={
                  t("Watching the network — this page updates itself on confirmation") +
                  (coin.note ? ` (${coin.note})` : "")
                }
              />
            </div>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
              {t("The invoice stays open for 24 hours, and paying a little over the asked amount is fine — it still lands. Paid straight to the author's wallet, no processor in the middle.")}</p>
          </>
        ) : (
          <p className="lede">
            {markup(t("Nothing was received in time. Nothing was charged — <0>start a fresh one</0> ."), [
            <Link href="/settings/topup" style={{ textDecoration: "underline" }} key="s0" />,
          ])}</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
