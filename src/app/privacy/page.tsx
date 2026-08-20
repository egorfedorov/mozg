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
    title: t("Privacy Policy — mozg"),
    description: t("What mozg stores, who it is sent to, how long it is kept, and how to get it back or have it deleted."),
  };
}

const UPDATED = "6 August 2026";

/**
 * The honest version: every table this product writes to, named, with the
 * reason it exists. A privacy policy that describes a generic SaaS is a
 * privacy policy nobody checked against the schema.
 */
export default async function PrivacyPage() {
  const t = await translator();

  const contact = env.OPERATOR_EMAIL;

  return (
    <>
      <TopBar />
      <Contents active="/privacy" />

      <main className="shell legal" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: "44rem" }}>
        <p className="eyebrow">{t("Legal")}</p>
        <h1 className="display" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", margin: ".4rem 0 .75rem" }}>
          {t("Privacy Policy")}</h1>
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
          {markup(t("Last updated <0/>"), [
          UPDATED,
        ])}</p>

        <p className="lede">
          {t("The short version: we store what the product needs to work, we send your source material to an AI provider so it can be read, we do not sell anything to anyone, and analytics stays off until you switch it on.")}</p>

        <h2 className="h2">{t("Who is responsible")}</h2>
        <p>
          {markup(t("The data controller is the individual operating mozg, reachable at <0/>. Write there for any request in this policy — access, export, correction, deletion, or a complaint."), [
          <a key="s0" href={`mailto:${contact}`}>{contact}</a>,
        ])}</p>

        <h2 className="h2">{t("What we store, and why")}</h2>
        <ul>
          <li>
            {markup(t("<0>Account</0> — email, name and avatar (from GitHub or Google if you sign in that way), your handle, plan and balance. Needed to have an account at all. Legal basis: performing our contract with you."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Brain material</0> — the pages, files, screenshots and text you add, plus the notes distilled from them and their search vectors. This is the product. Whatever you put in it, we hold."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Agent calls</0> — which tool was called, on which brain, the query text, how many results came back, and whether it failed. This is what meters usage, what fills your activity view, and what tells a brain's owner which questions it cannot answer. Legal basis: contract and our legitimate interest in running a service that can be debugged."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Errors</0> — when something fails, the message and stack trace, and the account it happened to. Kept so failures can be fixed rather than guessed at."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Learning progress</0> — which cards you have seen and when they are due, your study days, and the achievements you earned. Only if you use learn."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Money</0> — top-ups, purchases, payouts and the ledger behind your balance. Kept for as long as accounting law requires, which is longer than account deletion."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Messages</0> — anything you write to us in chat, and push subscriptions if you enable notifications."), [
            <strong key="s0" />,
          ])}</li>
        </ul>
        <p>
          {t("We do not run advertising, we do not build profiles for sale, and we do not use your private brains' content to train anything.")}</p>

        <h2 className="h2">{t("Who it is sent to")}</h2>
        <p>{t("These are the only third parties that see any of it:")}</p>
        <ul>
          <li>
            {markup(t("<0>Anthropic</0> (or an Anthropic-compatible provider we route through) — receives the source material being read, and exam questions and answers. This is how a brain is built. Providers are used under their API terms, which exclude training on API traffic."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Our own embedding service</0> — self-hosted, on our infrastructure. Your text does not leave it."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>GitHub / Google</0> — only if you use them to sign in, and only to confirm who you are."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>Resend</0> — sends the emails we have to send (verification, a receipt, an alert)."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>NOWPayments</0> — processes crypto top-ups. They see the payment, not your brains."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>S3-compatible object storage</0> — holds the files and images you upload."), [
            <strong key="s0" />,
          ])}</li>
          <li>
            {markup(t("<0>PostHog</0> — product analytics, and only if you accepted analytics cookies. See the <1>Cookie Policy</1>."), [
            <strong key="s0" />,
            <Link href="/cookies" key="s1" />,
          ])}</li>
        </ul>

        <h2 className="h2">{t("Public brains are public")}</h2>
        <p>
          {t("Publishing a brain puts its title, goal, note titles, exam results and your handle on a page anyone can read and search engines can index. Uploads are scanned for secrets and what we find is redacted, but treat that as a safety net rather than a guarantee: do not put anything in a public brain you would not put on a public page.")}</p>

        <h2 className="h2">{t("How long")}</h2>
        <p>
          {t("Account and brain data live until you delete them. Call and error records are kept while they are useful for debugging and metering, and pruned after that. Financial records are kept as long as the law requires. Ask us to delete your account and everything not legally pinned goes within 30 days.")}</p>

        <h2 className="h2">{t("Your rights")}</h2>
        <p>
          {markup(t("If you are in the EU/EEA or the UK you have the right to access, correct, export, delete and restrict your data, to object to processing based on legitimate interest, and to complain to your data protection authority. Everywhere else, we apply the same rights anyway — it is simpler than two behaviours, and fairer. Email <0/>; we answer within 30 days."), [
          <a key="s0" href={`mailto:${contact}`}>{contact}</a>,
        ])}</p>

        <h2 className="h2">{t("Security, honestly")}</h2>
        <p>
          {t("Traffic is encrypted, secrets are encrypted at rest, tokens are hashed, and uploads are scanned before they become notes. mozg is a small operation in beta: keep your own copy of anything you cannot afford to lose.")}</p>

        <h2 className="h2">{t("Children")}</h2>
        <p>{t("The service is not for people under 16. We do not knowingly hold their data.")}</p>

        <h2 className="h2">{t("Changes")}</h2>
        <p>
          {markup(t("Material changes get an entry on the <0>changelog</0> before they take effect, and the date at the top of this page moves."), [
          <Link href="/changelog" key="s0" />,
        ])}</p>

        <p style={{ color: "var(--ink-3)", fontSize: ".9375rem", marginTop: "2.5rem" }}>
          {markup(t("See also the <0>Terms of Service</0> and the <1>Cookie Policy</1>."), [
          <Link href="/terms" key="s0" />,
          <Link href="/cookies" key="s1" />,
        ])}</p>
      </main>

      <SiteFooter />
    </>
  );
}
