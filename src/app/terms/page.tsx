import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { env } from "@/lib/env";

export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("Terms of Service — mozg"),
    description: t("The agreement between you and mozg: what the service does, what you own, what we may remove, how money and plans work, and the limits of the guarantee."),
  };
}

const UPDATED = "6 August 2026";

/**
 * Written to be read, not to be survived. Every clause says the thing it means
 * in the shortest sentence that is still true — a term nobody understands is a
 * term nobody agreed to, whatever the checkbox says.
 */
export default async function TermsPage() {
  const t = await translator();

  const contact = env.OPERATOR_EMAIL;

  return (
    <>
      <TopBar />
      <Contents active="/terms" />

      <main className="shell legal" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: "44rem" }}>
        <p className="eyebrow">{t("Legal")}</p>
        <h1 className="display" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", margin: ".4rem 0 .75rem" }}>
          {t("Terms of Service")}</h1>
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
          {markup(t("Last updated <0/> · mozg is in beta, and these terms change with it."), [
          UPDATED,
        ])}</p>

        <h2 className="h2">{t("1. What this is")}</h2>
        <p>
          {t("mozg (“we”, “the service”) lets you build knowledge brains from pages, files and screenshots, and connect them to AI agents over MCP. Using mozg.sh, learn.mozg.sh, the API or the MCP server means you accept these terms. If you do not, do not use the service.")}</p>
        <p>
          {markup(t("The service is operated from Europe by the individual reachable at <0/>. It is in beta: features move, endpoints change, and occasionally something breaks. The <1>status page</1> says what is broken right now."), [
          <a key="s0" href={`mailto:${contact}`}>{contact}</a>,
          <Link href="/status" key="s1" />,
        ])}</p>

        <h2 className="h2">{t("2. Your account")}</h2>
        <p>
          {markup(t("You need an account to build brains. You are responsible for what happens under it, including what your API tokens and connected agents do — a token is a key, and a leaked key is your leak. Revoke tokens from <0>settings</0> the moment one goes missing."), [
          <Link href="/settings/tokens" key="s0" />,
        ])}</p>
        <p>
          {t("One human per account. You must be old enough to enter a contract where you live. We may suspend an account that is being used to abuse the service, and we will say why.")}</p>

        <h2 className="h2">{t("3. Your content stays yours")}</h2>
        <p>
          {t("Sources you upload, notes your brains distil, and everything you write remain yours. You grant us the licence we need to actually run the service: to store your content, to send it to the AI providers that read it for you, to index it for search, and — for brains you publish — to show and distribute them under the licence you picked.")}</p>
        <p>
          {t("You promise you have the right to upload what you upload. Feeding a brain material you may not copy is your call and your liability, not ours.")}</p>

        <h2 className="h2">{t("4. Publishing and selling")}</h2>
        <p>
          {t("A brain you publish carries the licence you choose — CC BY-NC-SA by default, MIT, or closed. Published brains are readable by others through the catalogue and over MCP under those terms. You can unpublish at any time; that stops new access, and people who already bought keep what they bought.")}</p>
        <p>
          {t("Selling a brain means you keep the seller's share of each sale as credit on your balance, and we keep the platform's share. Payouts go to the address you give us. You may not sell material you do not have the right to sell, and you may not resell someone else's brain — the default licence forbids it, and so do we.")}</p>

        <h2 className="h2">{t("5. Money")}</h2>
        <p>
          {markup(t("Free accounts get a monthly allowance of AI reading. Paid plans buy more; the numbers are on <0>pricing</0>. Balance is credit for use inside mozg, not a deposit account and not e-money."), [
          <Link href="/pricing" key="s0" />,
        ])}</p>
        <p>
          {t("Top-ups are made in cryptocurrency through our payment provider and are final once confirmed on-chain — we cannot reverse a blockchain transaction. If you bought something the service then failed to deliver, write to us and we will make it right. Reading your own material with your own API key (bring-your-own-key) is unmetered by us because that spend was never ours.")}</p>

        <h2 className="h2">{t("6. What you may not do")}</h2>
        <ul>
          <li>{t("Upload other people's secrets, credentials or personal data as brain material.")}</li>
          <li>{t("Use the service to build knowledge bases for illegal purposes.")}</li>
          <li>{t("Attack the service — scraping the catalogue at load, bypassing budgets, hammering the API.")}</li>
          <li>{t("Resell access to the service itself, or sell brains you have no rights to.")}</li>
        </ul>
        <p>
          {t("We scan uploads for secrets and redact what we find in public pages. That check is a safety net, not a promise: assume anything you upload to a public brain is public.")}</p>

        <h2 className="h2">{t("7. AI, and being wrong")}</h2>
        <p>
          {t("Brains are built by models reading sources, and graded by models sitting an exam. Both can be wrong. The score on a brain is evidence, not a warranty. Do not use a brain as the only basis for a decision that matters — medical, legal, financial or safety-critical — without checking the source it came from.")}</p>

        <h2 className="h2">{t("8. Availability and liability")}</h2>
        <p>
          {t("The service is provided as-is, without warranties. We aim for it to be up and we publish its health openly, but we do not promise an uptime figure, and beta means data loss is possible — keep your own copy of anything you cannot lose.")}</p>
        <p>
          {t("To the extent the law allows, our total liability to you is limited to what you paid us in the twelve months before the claim. Nothing here limits liability that cannot be limited, including for fraud or for death or personal injury caused by negligence.")}</p>

        <h2 className="h2">{t("9. Ending it")}</h2>
        <p>
          {markup(t("Delete your account whenever you like; write to <0/> and we will remove your content within 30 days, except what we must keep for accounting. We may close an account that breaks these terms, and will refund unused balance where the law requires it."), [
          <a key="s0" href={`mailto:${contact}`}>{contact}</a>,
        ])}</p>

        <h2 className="h2">{t("10. Changes, and the law that applies")}</h2>
        <p>
          {markup(t("We will post material changes on the <0>changelog</0> before they take effect. Continuing to use the service after that is acceptance. These terms are governed by the laws of the operator's country of residence, and if you are a consumer you keep the protections your own country gives you."), [
          <Link href="/changelog" key="s0" />,
        ])}</p>

        <p style={{ color: "var(--ink-3)", fontSize: ".9375rem", marginTop: "2.5rem" }}>
          {markup(t("Questions about any of this: <0/>. See also the <1>Privacy Policy</1> and the <2>Cookie Policy</2>."), [
          <a key="s0" href={`mailto:${contact}`}>{contact}</a>,
          <Link href="/privacy" key="s1" />,
          <Link href="/cookies" key="s2" />,
        ])}</p>
      </main>

      <SiteFooter />
    </>
  );
}
