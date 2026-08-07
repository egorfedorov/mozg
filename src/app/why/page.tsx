import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator, msg } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Why mozg exists",
  description:
    "Agents forget between sessions, memory is locked to one vendor, and nobody can tell you what a knowledge base does not know. mozg fixes the third one first.",
};

export default async function WhyPage() {
  const t = await translator();

  const user = await currentUser();

  return (
    <>
      <TopBar />
      <Contents active="/why" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        {/* Open on the problem, in the reader's own words. */}
        <p className="eyebrow">{t("Why this exists")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.1rem, 6vw, 4rem)", margin: ".4rem 0 1.25rem" }}
        >
          {markup(t("You have explained <0/> the same thing <1/> forty times."), [
          <br key="s0" />,
          <br key="s1" />,
        ])}</h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "52ch",
            marginTop: 0,
          }}
        >
          {t("Every session starts from zero. You paste the same conventions, correct the same assumptions, and watch the agent produce something that looks nothing like your product. Tomorrow, again.")}</p>

        <section style={{ marginTop: "clamp(3rem, 8vw, 5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1.5rem" }}>
            {t("Three things are broken.")}</h2>

          <div style={{ display: "grid", gap: "1.25rem" }}>
            {[
              {
                n: "01",
                title: msg("Memory is locked to one vendor"),
                body: msg("Built-in agent memory belongs to whoever made the agent. Teach Claude something and Codex still knows nothing about it. You are not building knowledge, you are building it once per tool."),
              },
              {
                n: "02",
                title: msg("Your context lives in screenshots"),
                body: msg("The things an agent most needs — how the product actually looks, what the docs actually say, what the team actually decided — exist as images, PDFs and pages. None of it is in a form an agent can search."),
              },
              {
                n: "03",
                title: msg("Nobody can tell you what it does not know"),
                body: msg("Every knowledge base is a black box. Answers come back confident whether the material is there or not, and you find the hole when an agent confidently gets something wrong in front of someone else."),
              },
            ].map((item) => (
              <article
                key={item.n}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 3rem) 1fr",
                  gap: "clamp(1rem, 3vw, 2rem)",
                  paddingBottom: "1.25rem",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <span
                  className="display"
                  style={{ fontSize: "1.5rem", color: "var(--color-riso-red)", lineHeight: 1.1 }}
                >
                  {item.n}
                </span>
                <div>
                  <h3 className="h2" style={{ marginBottom: ".4rem" }}>
                    {t(item.title)}
                  </h3>
                  <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "60ch" }}>{t(item.body)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* The differentiator gets the loudest moment on the page. */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 6rem)" }}>
          <p className="eyebrow">{t("What we do about the third one")}</p>
          <h2
            className="display"
            style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".6rem 0 1.25rem" }}
          >
            {markup(t("A brain that can be <0/> wrong on purpose."), [
            <br key="s0" />,
          ])}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0, fontSize: "1.0625rem" }}>
            {markup(t("You write what the brain is <0>for</0>. That goal becomes an exam — including questions about material you have not uploaded. The brain sits it after every change and reports which categories it cannot answer. Failing is the feature: those failures are the list of what to add next."), [
            <em key="s0" />,
          ])}</p>

          <div
            className="panel"
            style={{ marginTop: "1.75rem", maxWidth: "62ch", borderLeft: "4px solid var(--color-riso-green)" }}
          >
            <p style={{ margin: 0, color: "var(--ink-2)" }}>
              {t("Every other knowledge product reports what it holds. This one reports what it is missing, and that is the number that changes what you do tomorrow morning.")}</p>
          </div>
        </section>

        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1.5rem" }}>
            {t("The rest of it")}</h2>

          <div
            style={{
              display: "grid",
              gap: "1.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {[
              ["Screenshots in, knowledge out", "Drop a folder. Each image is read against the brain's goal, and comes back as searchable facts with the exact values kept — not a description of what the picture showed."],
              ["One brain, every agent", "Claude Code, Codex, Kimi CLI, Qwen Code, Cursor, VS Code, Cline. The brain speaks MCP, so the client does not matter."],
              ["Search that understands", "Meaning and keywords together. A Russian question finds an English note; “what if there is no data to show” finds the rule about empty states."],
              ["Agents write back", "An agent that works out a convention saves it. It waits in a review queue, so the brain sharpens instead of drifting."],
              ["Secrets never get in", "Terminal screenshots are full of tokens. Every source is scanned before storage, and again on whatever an agent writes. A brain that trips it cannot be shared."],
              ["Yours to take", "Export any brain as CLAUDE.md, a Claude Skill, or AGENTS.md. It keeps working if you stop paying us — which is the point."],
            ].map(([title, body]) => (
              <div key={title}>
                <h3 className="h3" style={{ marginBottom: ".45rem" }}>
                  {title}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Being explicit about who this is not for is more persuasive than
            claiming it is for everyone. */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5rem)" }}>
          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <div>
              <p className="eyebrow" style={{ color: "var(--color-riso-green)" }}>
                {t("Worth it when")}</p>
              <ul style={{ margin: ".75rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", display: "grid", gap: ".4rem" }}>
                <li>{t("You explain the same context to an agent every week")}</li>
                <li>{t("The knowledge lives in screenshots, docs and people's heads")}</li>
                <li>{t("You use more than one agent, or switch between them")}</li>
                <li>{t("Getting it wrong is expensive — design, math, contracts, protocol")}</li>
              </ul>
            </div>
            <div>
              <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>
                {t("Not worth it when")}</p>
              <ul style={{ margin: ".75rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", display: "grid", gap: ".4rem" }}>
                <li>{t("The knowledge is already in your repo — the agent can read it")}</li>
                <li>{t("A CLAUDE.md file covers it and never changes")}</li>
                <li>{t("You work alone in one tool on one project, forever")}</li>
              </ul>
            </div>
          </div>
        </section>

        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5rem)", textAlign: "center" }}>
          <h2 className="h1" style={{ marginBottom: "1.25rem" }}>
            {t("Teach it once.")}</h2>
          <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn" href={user ? "/brains/new" : "/sign-in"}>
              Build a brain
            </Link>
            <Link className="btn btn-ghost" href="/guide">
              How to build a good one
            </Link>
            <Link className="btn btn-ghost" href="/connect">
              Connect it
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
