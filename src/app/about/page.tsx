import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";

export const metadata = {
  title: "Manifesto — mozg",
  description:
    "Everything we know is being poured into one memory that belongs to nobody, pays nobody, and cannot say what it does not know. mozg is the opposite architecture. By Egor Fedorov, Sakha Republic.",
  openGraph: {
    title: "The manifesto — mozg",
    description:
      "One memory for everything, owned by nobody — or many minds, each with an author, a price and an honest edge. A manifesto by Egor Fedorov.",
    type: "article",
  },
};

/**
 * The manifesto.
 *
 * A longread, deliberately: this is the one page whose job is to change what
 * someone believes rather than to explain a feature, and belief does not fit
 * in a card grid. Full-bleed riso plates carry the argument between the
 * sections — the same ink language as the achievement badges, because this
 * page is the product's own face and should look like the rest of it.
 */

function Plate({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="lr-plate">
      {/* Local, already the size it renders at — next/image would add a loader
          round trip for a file that never changes dimensions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default async function AboutPage() {
  const t = await translator();

  return (
    <>
      <TopBar />
      <Contents active="/about" />

      <main className="longread">
        <header className="lr-hero">
          <div>
            <p className="eyebrow">{t("Manifesto")}</p>
            <h1 className="display lr-title">
              {t("Everything we know is going into one memory that belongs to nobody.")}</h1>
            <p className="lr-lede">
              {t("I am building the opposite: many minds, each owned by the person who filled it, each examined, each able to say where it stops — and every one of them paid when a machine uses it.")}</p>
            <p className="mono lr-byline">
              {t("Egor Fedorov · Uraanghay Saqa · Sakha Republic")}</p>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="lr-portrait"
            src="/about/portrait.webp"
            alt={t("Egor Fedorov, drawn as a riso print")}
            width={320}
            height={427}
          />
        </header>

        <section className="lr-body">
          <h2 className="h2">{t("Who is writing this")}</h2>
          {/* The link wrapped an <em>, which is a slot inside a slot and the
              one shape the codemod refuses. The italic moves onto the link:
              same page, one slot, and the name inside it survives translation
              because it is a name — the rule that keeps "brain" in Latin
              script keeps this too. */}
          <p>
            {markup(
              t(
                "My name is Egor Fedorov. I am Sakha — <0>Uraanghay Saqa</0>, which is what we call ourselves, not what the maps call us. I come from the Sakha Republic: three million square kilometres, a million people, and the coldest inhabited places on earth. Winter goes to sixty below. Nothing up there survives on its own — a house, a herd, a skill, a language. Somebody has to keep it. You learn that early, and then you start noticing it is true of everything.",
              ),
              [
                <a
                  href="https://egorfedorov.github.io/Saqa/index.en.html"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontStyle: "italic" }}
                  key="s0"
                />,
              ],
            )}
          </p>
          <p>
            {t("I build software, lately with AI agents every day. And every morning they began again from nothing, because everything I taught them the day before was gone.")}</p>

          <h2 className="h2">{t("The shape of the mistake")}</h2>
          <p>
            {t("We are building one memory for the whole species. Everything anyone ever wrote down goes in; what comes out is fluent, instant, and detached from every person it came from. Three things follow from that shape. None of them is a bug — they are what the shape produces.")}</p>

          <p className="lr-quote">
            {markup(t("It knows what we know. <0/> It cannot tell you who taught it."), [
            <br key="s0" />,
          ])}</p>

          <p>
            {markup(t("<0>It dissolves the author.</0> An illustrator's line. A doctor's judgement about a case that did not read like the textbook. A welder's feel for a bad seam. A translator's ear. Thirty years of somebody answering strangers on a forum at two in the morning. All of it went in; none of it was bought. What comes out can do the work at scale for a fraction of the rate, and there is no thread leading back, because the thread was dissolved on the way in. That is not theft by a villain. It is what happens when the only way to use what someone knows is to absorb it."), [
            <strong key="s0" />,
          ])}</p>

          <Plate
            src="/about/taken.webp"
            alt={t("A press swallowing framed pictures and returning empty frames")}
            caption={t("Everything went in. The frames came back empty.")}
          />

          <p>
            {markup(t("<0>It does not know your particular world.</0> Having read the entire internet, it still does not know the decision your team made in March, the version you are actually pinned to, or why the obvious approach is forbidden in this building. So you explain it again every session. You are not accumulating anything — you are renting the same explanation back, one conversation at a time, from something built to forget."), [
            <strong key="s0" />,
          ])}</p>

          <p>
            {markup(t("<0>It cannot say “I don't know”.</0> The worst of the three, and the least argued about. A single memory with no edges has no way to represent its own boundary, so everything arrives at the same confidence — what it learned from ten thousand sources and what it is inventing this second sound identical. Every other instrument we ever built tells you when it is out of range. This one smiles and guesses."), [
            <strong key="s0" />,
          ])}</p>

          <h2 className="h2">{t("A different shape")}</h2>
          <p>
            {markup(t("The fix is not a bigger model or a better crawler. It is a different architecture: <0>not one memory that swallows everything, but many, each of which still belongs to someone.</0>"), [
            <strong key="s0" />,
          ])}</p>
          <p>
            {markup(t("A <0>brain</0> is one of those. You fill it — from pages, files, screenshots, or simply by working while your agent writes down what it learned. It then sits an exam it did not write, generated from the goal you gave it, and gets a score you can watch move. It publishes its own gaps: the questions it failed are printed beside the questions it passed, so anything reading it knows precisely where to stop trusting it. When its sources change it re-reads them and sits the exam again. It has an author, a licence, a price if you want one, and a meter."), [
            <strong key="s0" />,
          ])}</p>
          <p>
            {t("Every part of that is a refusal of one of the three consequences above. The author stays attached. The knowledge is yours and particular. The edge is stated out loud.")}</p>

          <h2 className="h2">{t("One place to ask. Many minds behind it.")}</h2>
          <p>
            {markup(t("Here is what I want mozg to be: <0>the place every agent asks first</0> — one address, one protocol, whatever tool you happen to use — and behind that address, not a vat. A library of minds that each still belong to whoever filled them."), [
            <strong key="s0" />,
          ])}</p>
          <p>
            {t("Ask about slot mathematics and you reach the studio that actually ships them. Ask about a drug interaction and you reach the pharmacist who curates that brain and stakes their name on its score. Ask in Sakha and you reach people who speak it. Every answer arrives with its source, its exam result, and the name of whoever is answerable for it. No blending, no averaging, nobody's life's work quietly folded into a grey median.")}</p>
          <p>
            {markup(t("And using it improves it. Ask a brain something it cannot answer and the miss is recorded — the brain now knows its own gap, and so does its owner. Find a note wrong in the real world and say so; it sinks. Work something out the hard way and hand it back — on a brain you only read, that arrives as a <0>proposal</0>, waiting for the owner, never touching what the brain answers until a human takes it. Contribution without the power to corrupt. It is the only version of an open mind that survives contact with the internet."), [
            <em key="s0" />,
          ])}</p>

          <Plate
            src="/about/collective.webp"
            alt={t("Many hands placing notes into one growing brain")}
            caption={t("Everyone who asks makes it sharper. Everyone who teaches keeps their name on it.")}
          />

          <h2 className="h2">{t("And it has to pay")}</h2>
          <p>
            {t("A collective mind running on donated expertise is a collective mind that gets abandoned. The meter is not an afterthought here — it is the load-bearing wall.")}</p>
          <p>
            {markup(t("Take the clearest case. An illustrator spends fifteen years arriving at a line nobody else draws. Today that line is free training data and the only remedy on offer is a lawsuit. There is a third option: <0>the line becomes a brain.</0> The palette, the weight, how the shadow falls, the things they refuse to do — written down, priced by them, licensed by them. An agent that wants to work in that manner calls that brain, and the artist is paid for the call. Not once, when a crawler passed through. Every time."), [
            <strong key="s0" />,
          ])}</p>
          <p>
            {t("The same mechanism, unchanged, pays a composer for their voicings, a colourist for their grade, an editor for their pacing, a surveyor for forty years of knowing which ground moves, a studio for its house rules, a translator for an ear no corpus contains. The craft was never the problem. The problem was that a machine could only use it by swallowing it.")}</p>

          <Plate
            src="/about/paid.webp"
            alt={t("A brain handing a gold coin to an artist beside a signed painting")}
            caption={t("The same knowledge, moving the same way. This time the money moves too.")}
          />

          <p>
            {t("This part already runs. Brains carry prices, sales, balances and payouts; someone's agent asks and the author earns. It is small, and it is honestly labelled a beta. But it is not a proposal — it is a thing you can use this afternoon.")}</p>

          <h2 className="h2">{t("Why this is being built from Yakutia")}</h2>
          <p>
            {t("About four hundred and fifty thousand people speak Sakha. Ask any frontier model something in it and watch what happens: total confidence, and wrong, because there was never enough of us online to be worth learning properly. We are a rounding error in the training set.")}</p>
          <p>
            {markup(t("Try it with something real. Ask about the <0>Olonkho</0> — an epic sung across two consecutive nights — or about the nine commandments of the <1>Aiyy</1>, or the three <2>kut</2> a person is made of. You will get an answer. It will be fluent, and it will be invented, and nothing in it will tell you so. I wrote <3>the actual code of honour down, in English, on one page</3> — because that is the whole argument in miniature. The knowledge exists. It has people who are answerable for it. It was simply never worth enough pages for the vat to bother learning."), [
            <em key="s0" />,
            <em key="s1" />,
            <em key="s2" />,
            <a href="https://egorfedorov.github.io/Saqa/index.en.html" target="_blank" rel="noreferrer" key="s3" />,
          ])}</p>
          <p>
            {t("That is where most of the world already stands. Not only languages — trades, regions, small disciplines, and the part of every craft that lives in people rather than in indexed pages. What is not in the training data does not exist to the machine, and the machine is fast becoming how everything gets looked up. One memory for the species turns out to mean one memory belonging to whoever wrote the most English.")}</p>
          <p>
            {t("We are not going to out-shout the internet, and we do not have to. A brain does not need a billion pages. It needs the right four hundred, from people who actually know, kept current, and scored so a stranger can tell whether it is any good. Five people can build that in a month — for a language, a trade, a village, a studio. And it does not have to be given away to be worth having.")}</p>

          <Plate
            src="/about/sakha.webp"
            alt={t("A brain wrapped in Sakha ornament under northern lights")}
            caption={t("Uraanghay Saqa. Not enough of us to be learned. Enough of us to teach.")}
          />

          <h2 className="h2">{t("What I am actually claiming")}</h2>
          <ol className="lr-claims">
            <li>
              {markup(t("<0>Knowledge should keep its author.</0> If a machine uses what you know, your name stays attached to it — and so does the meter."), [
              <strong key="s0" />,
            ])}</li>
            <li>
              {markup(t("<0>Nobody's expertise should be free training data.</0> The alternative to being scraped is not being ignored. It is being licensed."), [
              <strong key="s0" />,
            ])}</li>
            <li>
              {markup(t("<0>A thing that claims to know should be examined.</0> Not vibes, not stars — a score, on questions it did not write, re-sat when its material moves."), [
              <strong key="s0" />,
            ])}</li>
            <li>
              {markup(t("<0>It must be able to say where it stops.</0> A confident wrong answer is worse than silence, and nearly everything built so far is optimised to produce one."), [
              <strong key="s0" />,
            ])}</li>
            <li>
              {markup(t("<0>Everyone who uses it should be able to improve it,</0> and nobody should be able to break it doing so."), [
              <strong key="s0" />,
            ])}</li>
          </ol>

          <h2 className="h2">{t("Come and build it")}</h2>
          <p>
            {markup(t("I am one person from a cold place, shipping in the open, in beta, with the failures on a public <0>status page</0> and the changelog dated. It is nowhere near finished. That is the invitation, not the disclaimer."), [
            <Link href="/status" key="s0" />,
          ])}</p>
          <p>
            {markup(t("If you know something worth keeping — make a brain and put it in the <0>catalogue</0>. If you draw, compose, shoot or cut — <1>turn your style into one and price it</1>. If you write code — <2>connect an agent</2> and let it stop forgetting. Every official brain is free to read, so you can find out today whether any of this is real."), [
            <Link href="/explore" key="s0" />,
            <Link href="/styles" key="s1" />,
            <Link href="/connect" key="s2" />,
          ])}</p>

          <p className="lr-sign">
            <span className="mono">{t("Egor Fedorov")}</span>
            <br />
            <span className="mono lr-sign-sub">
              {t("Uraanghay Saqa · Sakha Republic · building mozg in the open")}</span>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
