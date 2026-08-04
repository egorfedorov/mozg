import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
    purpose: string;
    buy_title: string | null;
    expires_at: Date | null;
  }>(
    `select t.reference, t.amount_cents, t.status, t.chain, t.pay_address,
            t.pay_amount::text, t.purpose, b.title as buy_title, t.expires_at
       from topups t left join brains b on b.id = t.buy_brain_id
      where t.reference = $1 and t.user_id = $2 and t.provider = 'mozgpay'`,
    [reference, user.id],
  );
  if (!invoice) notFound();

  const pending = invoice.status === "pending";
  const paid = invoice.status === "paid";

  return (
    <>
      <TopBar />
      <main className="shell" style={{ paddingBlock: "clamp(3rem, 8vw, 5rem)", maxWidth: 760 }}>
        <p className="eyebrow">
          {invoice.purpose === "buy" && invoice.buy_title
            ? `Buying “${invoice.buy_title}”`
            : "Topping up your balance"}
        </p>
        <h1 className="h1" style={{ margin: ".5rem 0 1rem" }}>
          {paid ? "Paid. You're set." : pending ? "Send the exact amount" : "This invoice expired"}
        </h1>

        {paid ? (
          <>
            <p className="lede">
              {formatCents(invoice.amount_cents)} landed
              {invoice.purpose === "buy" && invoice.buy_title
                ? ` and “${invoice.buy_title}” is unlocked for your agents.`
                : " on your balance."}
            </p>
            <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
              <Link className="btn" href={invoice.purpose === "buy" ? "/brains" : "/settings/balance"}>
                {invoice.purpose === "buy" ? "Open your brains" : "See the balance"}
              </Link>
            </div>
          </>
        ) : pending ? (
          <>
            <div className="panel" style={{ display: "grid", gap: "1rem" }}>
              <div>
                <p className="eyebrow" style={{ margin: "0 0 .3rem" }}>
                  Amount — all six decimals matter
                </p>
                <code className="mono" style={{ fontSize: "1.5rem", userSelect: "all" }}>
                  {invoice.pay_amount} USDT
                </code>
                <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: ".35rem 0 0" }}>
                  the decimals are how this payment is recognised — a rounded
                  amount will not match
                </p>
              </div>
              <div>
                <p className="eyebrow" style={{ margin: "0 0 .3rem" }}>
                  To this address · {String(invoice.chain).toUpperCase()} · TRC-20
                </p>
                <code className="mono" style={{ fontSize: ".9375rem", userSelect: "all", overflowWrap: "anywhere" }}>
                  {invoice.pay_address}
                </code>
              </div>
              <AutoRefresh
                active
                intervalMs={10_000}
                label="Watching the network — this page updates itself on confirmation (usually under a minute)"
              />
            </div>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
              The invoice stays open for 3 hours. Paid straight to the author&apos;s
              wallet — no processor in the middle.
            </p>
          </>
        ) : (
          <p className="lede">
            Nothing was received in time. Nothing was charged —{" "}
            <Link href="/settings/topup" style={{ textDecoration: "underline" }}>
              start a fresh one
            </Link>
            .
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
