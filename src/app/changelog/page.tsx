import TopBar from "@/components/TopBar";
import { translator } from "@/lib/t";
import { msg } from "@/lib/msg";
import { newsArchive } from "@/lib/announcements";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";

// Announcements are posted without a deploy, so this page is rendered per
// request rather than baked at build time — a news page a day behind is worse
// than no news page.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Changelog — mozg",
  description: "What shipped, dated. A beta whose pace you can see.",
};

/**
 * Curated, not generated: one entry per thing a user can feel, written when
 * it ships. During a beta the visible pace of a changelog is itself the
 * product's best argument.
 *
 * Announcements posted from /admin/announcements land above this list, dated the
 * same way. The two are different in origin, not in kind: this list is written
 * with the release, those are written in the moment — a pack that landed, an
 * outage that ended — and nobody should have to redeploy to say one.
 */
const ENTRIES: { date: string; title: string; body: string }[] = [
  {
    date: "2026-08-07",
    title: msg("Where two brains in a pack disagree, both sides show"),
    body: msg("The brains in a pack are read as one, so a conflict between two of them used to reach you as one confident answer with the argument invisible. Every night they are now read against each other; a real conflict is published on the pack page and flagged inside brain_search, naming both claims and the brain each came from. Nothing is merged and nothing is quietly picked — an agent that meets one is told to report both."),
  },
  {
    date: "2026-08-07",
    title: msg("The sentences with links in them speak eleven languages too"),
    body: msg("A hundred and fifty-nine paragraphs stayed English after the first pass — every one of them a sentence with a link, a bold run or a number in the middle. Splitting those into fragments is what makes translated pages read like assembly instructions, so instead the whole sentence now travels with its markup marked in it, and the translator is free to put the link wherever the grammar wants it. Nothing on a public page is English by accident any more."),
  },
  {
    date: "2026-08-06",
    title: msg("The site reads in eleven languages"),
    body: msg("Every public page now speaks Arabic, Chinese (both scripts), French, Hindi, Japanese, Portuguese, Russian, Spanish, Thai and Urdu — picked from your browser, changeable from the footer, right-to-left where it belongs. The brains themselves stay English on purpose: a translated note is a note nobody examined, and retrieval is already cross-lingual, so asking in your own language works today."),
  },
  {
    date: "2026-08-04",
    title: msg("The questions you ask become the exam"),
    body: msg("When any agent searches a brain and gets nothing back, that query is now added to the brain's exam automatically — and the next re-read of the sources chases it. Hitting a gap is the bug report. The whole loop is written up on /collective."),
  },
  {
    date: "2026-08-04",
    title: msg("Umbrella brains sit fair exams"),
    body: msg("A family's parent brain used to generate its exam blind to what the children hold, so it failed questions its own family could answer. Generation now sees the family — the same scope the exam searches. Scores jumped accordingly."),
  },
  {
    date: "2026-08-04",
    title: msg("Pay in crypto, straight to the author"),
    body: msg("Top-ups and purchases now settle over our own checkout: USDT, USDC and BTC across four chains, a QR on the payment page, round amounts. No processor between you and the balance."),
  },
  {
    date: "2026-08-04",
    title: msg("Talk to the developer, in the product"),
    body: msg("hi@mozg.sh is gone. Every page that pointed at email now opens /chat — a direct thread to the person who builds this, answered from the same screen the beta reports arrive on."),
  },
  {
    date: "2026-08-04",
    title: msg("Agents become the QA"),
    body: msg("A new brain_feedback tool lets any agent flag a note that reality contradicted — the report lands on the owner's dashboard, the note keeps answering until a human decides. Plus: the plugin now sniffs your repo at session start and points the agent at matching brains."),
  },
  {
    date: "2026-08-04",
    title: msg("Paid brains demo themselves"),
    body: msg("Five real queries into any paid brain, free, straight from your agent — then it asks to be bought. Storefronts show the questions a brain passed on its own exam, and /pricing finally says out loud what costs money and what never will."),
  },
  {
    date: "2026-08-04",
    title: msg("The catalogue triples"),
    body: msg("Svelte 5, Tailwind v4, Vercel AI SDK, OWASP cheat sheets and ASVS 5.0, Anthropic's prompt-engineering tutorial — free. Slot Studio, Slot Animation Craft and Slot Art Direction — a working studio's paid knowledge, $19–29 once."),
  },
  {
    date: "2026-08-04",
    title: msg("Learning got fast and cheap"),
    body: msg("Extraction moved to a faster model after an A/B on the same exam showed no quality loss, big pages extract their segments in parallel, identical text is never paid for twice, and interactive uploads jump the queue ahead of background refreshes."),
  },
  {
    date: "2026-08-04",
    title: msg("Teach it from one link"),
    body: msg("Paste a documentation URL — the whole site is discovered (GitHub tree, llms.txt, sitemap, or a link walk), read into notes, a goal is drafted from the material, and the exam runs itself. JS-only sites fall back to their source repository."),
  },
  {
    date: "2026-08-04",
    title: msg("The exam stopped being noisy"),
    body: msg("Every check is judged three times, majority wins — two re-sits on unchanged material now agree. The scorecard names what stands between a brain and 100%, tagged add-material or deepen-notes."),
  },
  {
    date: "2026-08-03",
    title: msg("Money moves"),
    body: msg("Balance top-ups (crypto now, cards on the way), one-time brain purchases with 95% to the author, and a price field at creation for both the web form and agents over MCP."),
  },
];

export default async function ChangelogPage() {
  const t = await translator();

  const news = await newsArchive(20);
  return (
    <>
      <TopBar />
      <Contents active="/changelog" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("Changelog")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", margin: ".5rem 0 1rem" }}>
          {t("Shipped, dated, felt.")}</h1>
        <p className="lede" style={{ maxWidth: "56ch" }}>
          {t("Only things a user can notice make this list. The pace is the point — this is what beta means here.")}</p>

        <div style={{ marginTop: "2.5rem", display: "grid", gap: "1.5rem", maxWidth: "72ch" }}>
          {news.map((n) => (
            <article
              key={n.id}
              style={{
                borderLeft: `3px solid ${
                  n.kind === "news" ? "var(--color-riso-green)" : "var(--ink-3)"
                }`,
                paddingLeft: "1.25rem",
              }}
            >
              <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: 0 }}>
                {n.starts_at.slice(0, 10)}
              </p>
              <h2 className="h3" style={{ margin: ".25rem 0 .4rem" }}>
                {n.title}
              </h2>
              {n.body.trim() && (
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem", whiteSpace: "pre-line" }}>
                  {n.body}
                </p>
              )}
            </article>
          ))}
          {ENTRIES.map((e, i) => (
            <article
              key={i}
              style={{ borderLeft: "3px solid var(--ink)", paddingLeft: "1.25rem" }}
            >
              <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: 0 }}>
                {e.date}
              </p>
              <h2 className="h3" style={{ margin: ".25rem 0 .4rem" }}>
                {t(e.title)}
              </h2>
              <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{t(e.body)}</p>
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
