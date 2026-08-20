import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { msg } from "@/lib/msg";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("ichi — the other half of the same problem"),
    description: t("A brain gives your agent your project's knowledge. ichi gives it a persistent character and the standards you laid down. Why we build both, and why they are one idea."),
  };
}

const HALVES: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: msg("mozg answers: what does it know about the work?"),
    body: msg("Your components, your retries, the deploy sequence nobody wrote down. Uploaded once, searchable over MCP, and scored against an exam so you can see what is missing instead of guessing."),
  },
  {
    n: "02",
    title: msg("ichi answers: what does it know about you?"),
    body: msg("That you want the tests run first. That the schema is not touched without asking. That you were sharp with it on Tuesday and it has not entirely let that go. Knowledge of the work is not the same as knowledge of the person doing it."),
  },
];

const SHARED: { title: string; body: string }[] = [
  {
    title: msg("Your context, not the vendor's"),
    body: msg("Both live on a server you can point at, reachable by any MCP client. Teach one and every agent you use knows it — Claude Code, Cursor, Codex, whatever replaces them next year. Built-in agent memory belongs to whoever made the agent; this does not."),
  },
  {
    title: msg("Legible, not magic"),
    body: msg("A brain shows you its exam score and its gaps. An ichi shows you the event log that produced its mood — which scolding, what it cost, what has recovered since. Neither asks you to take its word for anything, because a black box you cannot audit is a black box you stop trusting the first time it is wrong."),
  },
  {
    title: msg("Honest about what they do not do"),
    body: msg("A brain does not make an agent smarter, it makes it informed. An ichi does not make it smarter either — its character shapes tone, and never the quality of the help. Both are precise about their own edges, because the alternative is the thing every AI product does, and it is why nobody believes any of them."),
  },
];

export default async function IchiPage() {
  const t = await translator();

  return (
    <>
      <TopBar />
      <Contents active="/ichi" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("A sibling project")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.1rem, 6vw, 4rem)", margin: ".4rem 0 1.25rem" }}
        >
          {markup(t("Your agent knows the codebase. <0/> It does not know <1>you</1>."), [
            <br key="s0" />,
            <em key="s1" />,
          ])}
        </h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "54ch",
            marginTop: 0,
          }}
        >
          {t("ichi is a persistent character that rides with your agent over MCP. It remembers how it was treated, takes offence, grows attached — and it holds the rules you laid down, in every session, in every tool you work in.")}
        </p>

        <p style={{ marginTop: "1.5rem" }}>
          <a
            className="btn"
            href="https://ichi.mozg.sh"
            target="_blank"
            rel="noreferrer"
          >
            {t("Open ichi.mozg.sh →")}
          </a>
        </p>

        {/* The relationship, stated as two halves of one complaint. */}
        <section style={{ marginTop: "clamp(3rem, 8vw, 5rem)" }}>
          <h2 className="h2" style={{ marginBottom: ".75rem" }}>
            {t("One complaint, two halves.")}
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "56ch", marginTop: 0 }}>
            {t("Every session with an agent starts from zero. That sentence hides two different problems, and solving one does nothing for the other.")}
          </p>

          <div style={{ display: "grid", gap: "1.25rem", marginTop: "1.75rem" }}>
            {HALVES.map((item) => (
              <article
                key={item.n}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 3rem) 1fr",
                  gap: "1rem",
                  background: "var(--paper-2)",
                  padding: "1.25rem",
                }}
              >
                <span className="mono" style={{ color: "var(--color-riso-green)" }}>
                  {item.n}
                </span>
                <div>
                  <h3 className="h3" style={{ margin: "0 0 .4rem" }}>
                    {t(item.title)}
                  </h3>
                  <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>
                    {t(item.body)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Why it is ours rather than somebody else's. */}
        <section style={{ marginTop: "clamp(3rem, 8vw, 5rem)" }}>
          <h2 className="h2" style={{ marginBottom: ".75rem" }}>
            {t("Why we build it, and why here.")}
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "56ch", marginTop: 0 }}>
            {t("Not because it is adjacent. Because it is the same argument, applied to the other half — and the two share every conviction that made mozg what it is.")}
          </p>

          <div
            style={{
              display: "grid",
              gap: "1.25rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              marginTop: "1.75rem",
            }}
          >
            {SHARED.map((item) => (
              <article key={item.title} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
                <h3 className="h3" style={{ margin: "0 0 .4rem" }}>
                  {t(item.title)}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>
                  {t(item.body)}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* The line that makes it usable rather than a toy. */}
        <section style={{ marginTop: "clamp(3rem, 8vw, 5rem)" }}>
          <p className="eyebrow">{t("The line that matters")}</p>
          <h2 className="h2" style={{ margin: ".6rem 0 1rem" }}>
            {t("Mood colours the voice. Standards bind the work.")}
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
            {markup(t("A sulking assistant that quietly does worse work is not a feature, it is a defect with a personality. So an ichi's mood shapes <0>how</0> it speaks and never the quality, completeness or honesty of its help — and that rule ships in the payload on every single call, in writing."), [
              <em key="s0" />,
            ])}
          </p>
          <p style={{ color: "var(--ink-2)", maxWidth: "58ch" }}>
            {markup(t("There is exactly one exception, and it is the useful half: a memory saved as a <0>standard</0> is a rule you stated yourself, replayed to every future session. Those do bind. Two rules, stated separately, enforced separately — which is the part most projects in this space never draw."), [
              <code key="s0" />,
            ])}
          </p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 8vw, 5rem)", marginBottom: "2rem" }}>
          <h2 className="h2" style={{ marginBottom: ".75rem" }}>
            {t("Go and scold it.")}
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "54ch", marginTop: 0 }}>
            {t("The landing is the product: a console you can talk to. Praise it and the room warms; scold it and the screen tears. Then close the tab and come back tomorrow — it remembers you were gone, and it remembers what you said.")}
          </p>
          <p style={{ marginTop: "1.25rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <a className="btn" href="https://ichi.mozg.sh" target="_blank" rel="noreferrer">
              {t("Try it →")}
            </a>
            <a
              className="btn btn-ghost"
              href="https://github.com/egorfedorov/ichi"
              target="_blank"
              rel="noreferrer"
            >
              {t("Source on GitHub")}
            </a>
            <Link className="btn btn-ghost" href="/why">
              {t("Why mozg exists")}
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
