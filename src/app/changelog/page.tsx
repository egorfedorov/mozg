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

export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("Changelog — mozg"),
    description: t("What shipped, dated. A beta whose pace you can see."),
  };
}

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
    date: "2026-08-20",
    title: msg("Every page speaks the language you picked"),
    body: msg("The language choice was scoped to the host it was made on, so picking Russian on mozg.sh left gen.mozg.sh in English — and the pages built this week had no translations at all, which made them half one language and half the other. Mixed is worse than English, because English at least looks deliberate. The cookie is shared across the subdomains now, the leftover copy is cleared rather than left to win by being more specific, and every title is translated too: metadata was a static export evaluated before there was a reader to have a language, so the tab said one thing while the page said another."),
  },
  {
    date: "2026-08-20",
    title: msg("gen.mozg.sh plans the set before you pay for it"),
    body: msg("The old flow was a brief box and a button that spent money — nowhere to see what you were buying, nowhere to change one symbol, nowhere your last game lived. Now a project is a folder: name the game, and the whole set appears as a list you can rewrite. Describe the premium yourself, leave the rest to the world you wrote, drop what you do not want. All of that is free; the price is shown before the one button that charges. Assets land one by one with the art visible, not a status word. A run is a pack, so redoing a symbol next week is another batch in the same project rather than an edit to a receipt. And it is not only slots: a storefront listing is its own kind, drawn as the separate layers a storefront actually composites, and a custom project starts empty for work we have no rules for."),
  },
  {
    date: "2026-08-20",
    title: msg("A rig-ready set, and the hands to rig it"),
    body: msg("A set of flat symbols cannot be animated without redrawing half of it. What a slot needs to move is a handful of state variants — the mascot's win face and its blink, the wild and scatter at the moment they land — and they have to be drawn with the set, because a model has no memory between calls and a variant generated later will not match. So rig-ready is a set you order rather than a step you take afterwards, and mozg-spine turns it into an animated Spine skeleton on your own machine. Rigging needs no Spine licence at all; a licence only adds the packer and the editable project."),
  },
  {
    date: "2026-08-20",
    title: msg("Brains now say what hands they need"),
    body: msg("A brain teaches how something is done, and some of what it teaches is done far better by a program on your own machine — the agent had no way to know, so it hand-wrote a Spine skeleton next to a machine that would have exported one. Brains now name their tools, and mozg publishes them: mozg-spine rigs and animates, mozg-devtools measures a running game against the budgets the PixiJS brain teaches, mozg-stake uploads and publishes a build. The command is generated from what mozg actually ships rather than typed by a brain's owner, so a brain cannot tell your agent to install something that does not exist. They run on your machine and mozg runs none of them."),
  },
  {
    date: "2026-08-20",
    title: msg("Earn with mozg: 20% of every month"),
    body: msg("Send somebody here and take a fifth of every plan payment they make, for as long as they keep paying — not a bounty on the first invoice. Your handle is the link, the window is thirty days, and the commission lands on your balance the second they pay, with a ledger row you can read. It stops when they stop, and nothing is clawed back. Free to join and nothing to apply for: if you have signed in, you already have the link."),
  },
  {
    date: "2026-08-10",
    title: msg("A route hands you the shelf it needs"),
    body: msg("A workflow names the brains each step reads — and now it tells your agent, before any work starts, which of them you actually have. Missing or unbought ones are named up front with what they cost, because a route run without its material still produces files and they look exactly like the ones built with it. On the route's page, one button shelves the free brains and buys the paid ones from your balance. The route itself stays free: what costs money to make is the material, and charging twice for one body of knowledge is not how this catalogue earns trust."),
  },
  {
    date: "2026-08-10",
    title: msg("Nothing empty gets on the shelf any more"),
    body: msg("Publishing a brain now requires material and a measured score — before this, a visitor could open a public brain with zero notes and reasonably conclude the whole catalogue was empty. Twelve were in that state. The same gate sits on all three doors, and the catalogue refuses to list an empty shelf whatever published it. The listing also paginates now, so what was published last is not buried at the bottom of an endless column."),
  },
  {
    date: "2026-08-10",
    title: msg("Say it in one field, or ask without naming a brain"),
    body: msg("Two things agents got wrong constantly, both now answered instead of refused. A note sent as a single field is titled by its own first sentence rather than rejected — half of every brain_write was being lost to \"both title and body are required\". And brain_search called without a brain searches your whole shelf and says which brain each passage came from, instead of refusing a question we could have answered."),
  },
  {
    date: "2026-08-10",
    title: msg("The catalogue, measured in public"),
    body: msg("mozg.sh/health: how many brains are published, how many have sat an exam, what they average, how many were fed this week and how many have gone a month untouched. A young catalogue asks to be trusted, and the honest form of that argument is a number anyone can check. Gap suggestions now close themselves too — a question the brain could not answer in June and can answer today stops sitting in a list nobody reads."),
  },
  {
    date: "2026-08-10",
    title: msg("Workflows: the order the brains are read in"),
    body: msg("A brain answers a question. A workflow is the order the questions get asked in to build a whole thing — concept, then math, then the front end, then the checks that decide whether it ships. Build one on a canvas in your workspace: each step names the brain to read, the prompt to ask it in that brain's own words, the rules that hold while the step runs, and the check that ends it. Then run it from any agent with /mozg:build. Nothing executes on our side — we store the route, your agent walks it, and it can go back a step when a check fails. Published routes are readable by anyone: the first is a Stake Engine slot game end to end, twelve steps across ten brains."),
  },
  {
    date: "2026-08-10",
    title: msg("A brain with nothing to say now says nothing"),
    body: msg("Ask a brain something outside its subject and hybrid search almost never came back empty — it handed over its five least-unrelated passages, and the agent reading them answered confidently from material about something else. Measured across the catalogue, ordinary questions passed at 82% while the probes that ask a brain to admit a subject is not covered passed at 64%. The cross-encoder always knew the difference; its verdict is now enforced for every search, so an off-topic question gets \"no matches\" and the name of a brain that does hold the subject."),
  },
  {
    date: "2026-08-10",
    title: msg("A dense reference page no longer costs itself"),
    body: msg("Pages like Electron's window API or Loki's configuration produce more notes than one model reply can hold. That used to fail the whole page — the answer was cut off, and everything in it was lost. Now the segment is halved and both halves are read, so the densest pages in a repository, which are the ones worth having, actually land. The same rule covers exam generation: a brain too big for a hundred questions in one reply sits an exam of fifty instead of none."),
  },
  {
    date: "2026-08-10",
    title: msg("A repository's plumbing is not its documentation"),
    body: msg("Pointing a brain at a GitHub repository read every markdown file in the tree, which meant a brain about a product also swallowed the repository's own tooling: code-review agent prompts, skill files, licence text, and CHANGELOG files whose four hundred notes say which release fixed what. Those are skipped now, and the crawl says how many it skipped. Directories named build or test are deliberately not on the list — real chapters live there."),
  },
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
