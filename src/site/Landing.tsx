import CopyButton from "@/components/CopyButton";
import Announcements from "@/components/site/Announcements";
import Laurel from "@/components/site/Laurel";
import StickyInstall from "@/components/site/StickyInstall";
import Voices from "@/components/site/Voices";
import SiteFooter from "@/components/SiteFooter";
import TopBar from "@/components/TopBar";
import { Gap, Panel, Scribble, SketchDefs } from "@/components/Sketch";
import { Board } from "@/components/board/Board";
import Asks from "@/components/landing/Asks";
import ExplainBack from "@/components/landing/ExplainBack";
import Pricing from "@/site/Pricing";
import Questions from "@/site/Questions";
import Thesis from "@/components/landing/Thesis";
import { decideGate } from "@/core/gate";
import { SAMPLE_NOW, SAMPLE_PROJECT, sampleDesk, sampleStore } from "@/core/sample";
import { DEFAULT_SETTINGS } from "@/core/store";
import { INSTALL } from "@/lib/install";
import { msg, t, type Lang } from "@/lib/i18n";

/**
 * The landing.
 *
 * One subject: the board. It is the product on a sample session, built by the
 * same code that builds the real desk, so what a visitor sees is what they
 * will get. Everything after it explains the board, and the page ends on the
 * way to try it.
 */

const STEPS: { n: string; title: string; body: string; aside: string }[] = [
  {
    n: "01",
    title: msg("Watch"),
    body: msg("mozg reads the session log your agent already writes. Every edit, which folder it landed in, and who let it through: you, for that one change, or a rule that did not ask."),
    aside: msg("Nothing is installed in your editor. The log is already there."),
  },
  {
    n: "02",
    title: msg("Explain"),
    body: msg("When a session ends, it names the change with the most at stake. Your agent asks you one question about it. You answer in your own words. About a minute."),
    aside: msg("Nobody reads the whole diff. One question, on the part that would hurt if wrong."),
  },
  {
    n: "03",
    title: msg("Own"),
    body: msg("An examiner that did not write the code grades your answer. A pass makes that module yours, and the agent is free to work there. Until then, its first edit in that module asks you first."),
    aside: msg("A miss costs nothing: you get the lesson, and the same question once more."),
  },
];

const PILLARS: { name: string; text: string }[] = [
  { name: msg("Local"), text: msg("Your logs never leave your machine. mozg reads them where they sit and keeps its own notes in one folder.") },
  { name: msg("Honest"), text: msg("It says nobody was asked only when the log says so, and that the log does not say when it does not. Nothing is estimated and then shown as measured.") },
  { name: msg("Independent"), text: msg("Your answer is graded by an examiner that did not write the code and has no reason to want to please you.") },
  { name: msg("Yours"), text: msg("One folder holds everything. Delete it and mozg remembers nothing.") },
];

export default function Landing({ lang }: { lang: Lang }) {
  const desk = sampleDesk();
  // The slip shows the gate's own words, decided on the sample session.
  const gateFile = "src/payments/refund.ts";
  const gate = decideGate(
    { file: gateFile, cwd: SAMPLE_PROJECT, session: "landing" },
    { ...sampleStore(), settings: DEFAULT_SETTINGS, askedAt: () => null },
    SAMPLE_NOW,
  );
  const slip = gate.kind === "ask" ? gate : null;
  const next = desk.feed.find((card) => card.change)?.module ?? "status";
  // The two lines a person pastes into Claude Code, in order. The page shows
  // the way everyone will install it; a path on the author's machine is for
  // the README, not for a public page.
  const install = `${INSTALL.marketplace}\n${INSTALL.plugin}`;

  return (
    <>
      <SketchDefs />
      <Announcements lang={lang} close={t("Close")} />
      <TopBar lang={lang} path="/" />

      <main>
        <section className="hero shell">
          <StickyInstall said={t("No account. No key. Nothing to pay.")} button={t("Install the plugin")} close={t("Close")} />
          <p className="eyebrow">{t("For people who ship with coding agents")}</p>
          <h1 className="display hero-title">{t("Own what your AI writes.")}</h1>
          <p className="hero-sub">
            {t("mozg reads what your agent changed. You explain the risky part in a minute. The agent earns its freedom.")}
          </p>
          <div className="hero-actions">
            <a className="btn btn-plate" href="#install">
              {t("Install the plugin")}
            </a>
            <a className="btn btn-ghost" href="#how">
              {t("See how it works")}
            </a>
          </div>

          {/* The printer's "look here", around the one thing the product can
              vouch for: there are no keys and no accounts, and that is a fact
              of the code, not a prize. */}
          <Laurel>{t("Local only. No keys, no accounts.")}</Laurel>
          <Voices />

          {/* The subject of the page, and the only thing on it that moves. */}
          <div id="desk" style={{ scrollMarginTop: 76 }}>
            <div className="board-label">{t("The desk, on a sample session")}</div>
            <Board
              state={desk}
              sample
              play
              command={t("explain <0/>").replace("<0/>", next)}
              commandNote={t("what you would say to your agent next")}
            />
          </div>
        </section>

        <section className="thesis shell" aria-label={t("The problem, in two lines")}>
          <Thesis />
          <div className="thesis-figure">
            <Gap />
          </div>
          <p className="lede" style={{ marginTop: "1.5rem", fontSize: "1.125rem" }}>
            {t("The log already records every change your agent makes and who let it through. mozg reads that log, finds the changes with the most at stake, and asks you one question about each. A minute later you can vouch for what shipped.")}
          </p>
        </section>

        <section id="how" className="section shell" style={{ scrollMarginTop: 76 }}>
          <div className="section-head">
            <span className="eyebrow">{t("Three steps, about a minute")}</span>
            <h2 className="h1">{t("Say you understand it. Mean it.")}</h2>
          </div>
          <div className="sk-strip">
            {STEPS.map((step) => (
              <Panel key={step.n} n={step.n} title={t(step.title)} aside={t(step.aside)}>
                <p>{t(step.body)}</p>
              </Panel>
            ))}
          </div>

          <div className="xb-wrap">
            <div className="section-head">
              <span className="eyebrow">{t("One explain-back, on a sample change")}</span>
              <h3 className="h3">{t("A minute, out loud. Three voices.")}</h3>
            </div>
            <ExplainBack explain={desk.explains.find((e) => e.bug?.found) ?? desk.explains[0]} />
          </div>

          {slip && <Asks file={gateFile} why={slip.why} next={slip.next} />}
        </section>

        {/* The one inverted sheet: ink for the person, paper for everything else. */}
        <section className="for" id="for" aria-labelledby="for-title">
          <div className="shell section">
            <div className="for-grid">
              <div>
                <p className="eyebrow">{t("Who it is for")}</p>
                <h2 className="display for-title" id="for-title">
                  {t("I don't just approve. I understand what I ship.")}
                </h2>
                <p className="for-lede">
                  {t("For the developer whose agent now writes most of the code, and who has noticed that approving is not the same as knowing. You do not need to read every line. You do need to be able to explain the ones that matter.")}
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local illustration at its intrinsic size */}
              <img className="for-face" src="/brand/mascot.webp" alt={t("mozg, a coral brain with a small smile")} width={200} height={200} />
            </div>
            <div className="pillars">
              {PILLARS.map((pillar, i) => (
                <div key={pillar.name} className="pillar">
                  <span className="pillar-n">
                    {String(i + 1).padStart(2, "0")} / {String(PILLARS.length).padStart(2, "0")}
                  </span>
                  <span className="pillar-name">{t(pillar.name)}</span>
                  <span className="pillar-text">{t(pillar.text)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Pricing lang={lang} />
        <Questions />

        <section id="install" className="section shell" style={{ scrollMarginTop: 76 }}>
          <div className="section-head">
            <span className="eyebrow">{t("For Claude Code · needs Node 20 or newer")}</span>
            <h2 className="h1">{t("A plugin. Nothing else.")}</h2>
          </div>
          <div className="two">
            <div>
              <p className="lede">
                {t("There is no account and no key. The plugin reads the logs Claude Code already writes on your machine and keeps its notes in one folder. Uninstall it, or delete the folder, and nothing is left.")}
              </p>
              <p style={{ color: "var(--ink-2)" }}>
                {t("After one session that edits files, the desk has your numbers. Say 'status' to your agent, or 'explain' when you have a minute.")}
              </p>
            </div>
            <div>
              <div className="term">
                <div className="term-bar">
                  <span className="term-dot" />
                  <span className="term-dot" />
                  <span className="term-dot" />
                  <span style={{ marginLeft: ".5rem" }}>{t("inside Claude Code")}</span>
                </div>
                <div style={{ overflowWrap: "anywhere" }}>
                  <span className="u">$</span> {INSTALL.marketplace}
                </div>
                <div style={{ overflowWrap: "anywhere" }}>
                  <span className="u">$</span> {INSTALL.plugin}
                </div>
              </div>
              <div style={{ marginTop: ".75rem" }}>
                <CopyButton text={install} label={t("Copy both lines")} copied={t("Copied. Paste them one at a time.")} />
              </div>
              <p className="set-text" style={{ marginTop: "1rem" }}>
                {t("Then your desk is a page on this machine:")}{" "}
                <a className="tlink" href={INSTALL.desk} target="_blank" rel="noopener noreferrer">
                  {INSTALL.desk}
                </a>
                . {t("Or just say 'desk' to your agent.")}
              </p>
            </div>
          </div>
        </section>

        <div className="shell closing">
          {/* The house emphasis: one yellow plate on the page, and this is it. */}
          <div className="plate">
            <div>
              <h2 className="display plate-title">{t("Stop shipping what you can't explain.")}</h2>
              <p className="plate-text">
                {t("After your next session, say 'explain'. One question. About a minute. Then that part is yours.")}
              </p>
            </div>
            <CopyButton
              className="btn"
              text={t("Explain-back time. Start with the change from today's session that has the most at stake.")}
              label={t("Copy what to say")}
              copied={t("Copied. Say it to your agent.")}
            />
          </div>
          <div style={{ margin: "clamp(2.5rem, 6vw, 4rem) 0 0" }}>
            <Scribble />
          </div>
        </div>
      </main>

      <SiteFooter lang={lang} />
    </>
  );
}
