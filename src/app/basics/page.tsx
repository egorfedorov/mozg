import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import AskedTwice from "@/components/AskedTwice";

export const metadata = {
  title: "Start from zero — what any of this is",
  description:
    "No jargon. What an AI agent actually is, why it gets your project wrong, what MCP means, and what a knowledge brain does about it — explained for somebody who has never heard any of these words.",
};

/**
 * The page for somebody who has heard none of these words.
 *
 * Every other page here assumes an agent is already installed and misbehaving.
 * That assumption loses the person who was told "you should use AI for this" and
 * has no idea what a protocol is — and that person is most people. So: plain
 * words, one idea per section, every term defined the first time it appears, and
 * an analogy for each that a non-programmer can hold.
 *
 * Deliberately not a feature list. Somebody at zero needs to understand the
 * problem before a solution means anything, and they need to be told what to
 * click at the end.
 */

const GLOSSARY: { term: string; plain: string }[] = [
  {
    term: "AI agent",
    plain:
      "A program you talk to that can also do things — read your files, write code, run commands. Claude Code, Cursor and Codex are agents. The chat window in a browser is not: it can only talk.",
  },
  {
    term: "Model",
    plain:
      "The part that does the thinking, trained once on a huge pile of text. Training has an end date, and after that date the model learns nothing new on its own.",
  },
  {
    term: "Context",
    plain:
      "Everything the agent can see right now: your question, the files it opened, the notes you pasted. It is limited, it is refilled from scratch every session, and everything in it costs money to read.",
  },
  {
    term: "MCP",
    plain:
      "Model Context Protocol — an agreed way for an agent to plug into an outside service. Like USB: one socket, and anything that fits it works with any agent that has the socket.",
  },
  {
    term: "Brain",
    plain:
      "A small, searchable body of knowledge about one subject. The agent asks it a question and gets back the two or three facts that answer, instead of reading a whole document.",
  },
  {
    term: "Note",
    plain:
      "One fact inside a brain, with a title, written so it stands alone. Notes are what the agent actually reads.",
  },
  {
    term: "Exam score",
    plain:
      "A percentage on every brain. Questions are generated from what the brain is supposed to cover, the brain is made to answer them, and a judge marks it. 84% means it answered 84% of them.",
  },
  {
    term: "Gap",
    plain:
      "A question the brain fails. Listed publicly, on purpose — knowing where knowledge ends is worth more than a promise that it does not.",
  },
  {
    term: "Token",
    plain:
      "Two meanings, unluckily. Text is billed in tokens (roughly ¾ of a word). And an access token is a password-like string that lets your agent into your account.",
  },
];

export default function BasicsPage() {
  return (
    <>
      <TopBar />
      <Contents active="/basics" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">Start from zero</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.1rem, 6vw, 4rem)", margin: ".4rem 0 1.25rem" }}
        >
          Never heard of
          <br />
          any of this?
          <br />
          Good. Start here.
        </h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "54ch",
            marginTop: 0,
          }}
        >
          No jargon, one idea at a time. By the end of this page you will know
          what an AI agent is, why it gets confident things wrong, what MCP means,
          and what this service actually does about it. If a word here needs
          explaining, it gets explained — and there is a list of them at the
          bottom.
        </p>

        {/* ── 1. what an agent is ───────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)", maxWidth: "62ch" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>One</p>
          <h2 className="h2" style={{ margin: ".3rem 0 1rem" }}>
            An AI agent is a colleague with two odd properties.
          </h2>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, margin: "0 0 1rem" }}>
            Imagine hiring someone who has read almost everything ever published —
            every manual, every forum, every tutorial — and can write code, edit
            your files and run commands. That is an AI agent: Claude Code, Cursor,
            Codex. Genuinely useful, and strange in two specific ways.
          </p>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--ink-2)", margin: "0 0 1rem" }}>
            <strong style={{ color: "var(--ink)" }}>It stopped reading on a date.</strong>{" "}
            Its knowledge was fixed when it was trained. Anything published after
            that — a new version of the tool you use, an option that got renamed,
            the API that changed last Tuesday — it has never seen, and it does not
            know that it has not seen it. So it answers from what it remembers,
            with total confidence, and sometimes that answer is a year out of date.
          </p>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--ink-2)", margin: "0 0 1rem" }}>
            <strong style={{ color: "var(--ink)" }}>It forgets everything between conversations.</strong>{" "}
            Explain your project&apos;s rules today and tomorrow it starts blank.
            Everything it knows about your work has to be handed to it again, every
            single session — and every word of that costs money to read.
          </p>
        </section>

        {/* ── 2. why that hurts ─────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)", maxWidth: "62ch" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>Two</p>
          <h2 className="h2" style={{ margin: ".3rem 0 1rem" }}>
            Which is why the answers look right and are not.
          </h2>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, margin: "0 0 1rem" }}>
            Two kinds of knowledge are missing, and they fail differently.
            <strong> Public knowledge that moved</strong> — the documentation of
            whatever you are building with, which changed after the model stopped
            reading. And <strong>knowledge that was never public at all</strong> —
            your project&apos;s conventions, your company&apos;s internal system,
            the way your studio does things. No model has ever seen that, so
            everything it says about it is invention.
          </p>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--ink-2)", margin: "0 0 1rem" }}>
            The usual fix is to paste it all in — a long file of instructions the
            agent reads every session. That works until it does not: the file grows
            past what fits, you pay for all of it whether today&apos;s task needed
            it or not, and worst of all it cannot tell you when it went stale. A
            document is silent about its own age.
          </p>
        </section>

        {/* ── 3. what MCP is ───────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>Three</p>
          <h2 className="h2" style={{ margin: ".3rem 0 1rem", maxWidth: "62ch" }}>
            MCP is a socket. That is genuinely all it is.
          </h2>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, maxWidth: "62ch", margin: "0 0 1rem" }}>
            Agents need to reach things outside themselves — your files, a
            database, a service. Every agent used to do that its own way, so every
            service had to be built once per agent. MCP (Model Context Protocol) is
            the agreed shape of that connection: build the service once, and any
            agent with the socket can use it. Like USB, and about as interesting —
            what matters is what you plug in.
          </p>

          <figure style={{ margin: "1.5rem 0 0", maxWidth: "62ch" }}>
            <div
              style={{
                border: "1.5px solid var(--ink)",
                background: "var(--paper-2)",
                padding: "1rem .75rem .5rem",
              }}
            >
              <svg
                viewBox="0 0 414 150"
                role="img"
                aria-label="Three agents connect through one MCP socket to a brain; the brain answers with a few notes"
                style={{ width: "100%", height: "auto", color: "var(--ink)", display: "block" }}
              >
                <defs>
                  <marker id="basics-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                {["Claude Code", "Cursor", "Codex"].map((name, i) => (
                  <g key={name}>
                    <rect
                      x="10"
                      y={18 + i * 42}
                      width="96"
                      height="30"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <text x="58" y={37 + i * 42} textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
                      {name}
                    </text>
                    <path
                      d={`M110 ${33 + i * 42} L164 75`}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.6"
                      markerEnd="url(#basics-arrow)"
                    />
                  </g>
                ))}
                <rect x="168" y="58" width="34" height="34" fill="var(--color-riso-red)" opacity="0.85" />
                <text x="185" y="112" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
                  MCP
                </text>
                <path d="M208 75 L244 75" stroke="currentColor" strokeWidth="2" markerEnd="url(#basics-arrow)" />
                <rect x="250" y="48" width="72" height="54" fill="none" stroke="currentColor" strokeWidth="2.5" />
                <text x="286" y="70" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
                  brain
                </text>
                <text x="286" y="86" textAnchor="middle" className="mono" fontSize="11" fill="var(--color-riso-green)">
                  84%
                </text>
                <path d="M328 75 L356 75" stroke="currentColor" strokeWidth="2" markerEnd="url(#basics-arrow)" />
                {[0, 1, 2].map((i) => (
                  <rect
                    key={i}
                    x="362"
                    y={58 + i * 12}
                    width="42"
                    height="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                ))}
                <text x="383" y="112" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
                  3 notes
                </text>
              </svg>
            </div>
            <figcaption className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".5rem" }}>
              One connection, any agent, and only the few notes the question needed
            </figcaption>
          </figure>
        </section>

        {/* ── 4. what we do ────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)", maxWidth: "62ch" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-green)" }}>Four</p>
          <h2 className="h2" style={{ margin: ".3rem 0 1rem" }}>
            We keep the knowledge, and we measure it.
          </h2>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, margin: "0 0 1rem" }}>
            A <strong>brain</strong>{" "}
            is a small library about one subject —
            SvelteKit, your company&apos;s billing service, the way your studio
            builds games. Inside it are notes: one fact each, written to stand
            alone. Your agent connects once and then asks the brain whenever a
            question depends on that subject, getting back the two or three notes
            that answer instead of a document it has to read whole.
          </p>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--ink-2)", margin: "0 0 1rem" }}>
            The part nobody else does is the exam. Every brain is given questions
            drawn from what it claims to cover, made to answer them, and marked —
            so it carries a percentage, and a public list of the questions it
            fails. That is the difference between &ldquo;here is a document,
            good luck&rdquo; and &ldquo;this knows 84% of its subject, and here is
            exactly where it does not&rdquo;. An agent that is told where knowledge
            ends can say &ldquo;I don&apos;t know&rdquo; instead of inventing.
          </p>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--ink-2)", margin: "0 0 1rem" }}>
            Where do brains come from? Some are made already — the catalogue holds
            the documentation of a hundred popular tools, free to use, kept
            current. Some you make: paste a documentation link and it gets read for
            you, or point your own agent at your own files and let it write the
            notes. And some people sell theirs.
          </p>
        </section>

        {/* ── 5. the concrete difference ───────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-green)" }}>Five</p>
          <h2 className="h2" style={{ margin: ".3rem 0 1rem", maxWidth: "62ch" }}>
            What it looks like in a real morning.
          </h2>
          <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, maxWidth: "62ch", margin: "0 0 1rem" }}>
            You do not have to know the right word for what you want. That is the
            whole point of asking something that actually knows the subject.
          </p>
          <AskedTwice
            ask={
              "“Make the spin feel more exciting when two of the special symbols land. I have no idea how these games do that.”"
            }
            without={
              "A shake and a louder noise once the reels have stopped — reasonable, generic, and pointed at the wrong moment. Nothing was wrong with the request; the agent simply answered exactly it."
            }
            withBrain={
              "It asks the brain first and comes back with the name of the thing: anticipation. The last reel slows down and plays a build-up animation while it is still spinning, which is where the tension in these games actually lives — plus the two house rules about when it must not fire. You had never heard the word, and got what somebody with ten years in the industry would have specified."
            }
            accent="var(--color-riso-green)"
          />
        </section>

        {/* ── 6. what to do ───────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)", maxWidth: "62ch" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-green)" }}>Six</p>
          <h2 className="h2" style={{ margin: ".3rem 0 1rem" }}>
            Three steps, about ten minutes.
          </h2>
          <ol style={{ paddingLeft: "1.25rem", display: "grid", gap: ".9rem", fontSize: "1.0625rem", lineHeight: 1.6 }}>
            <li>
              <strong>Take a brain.</strong> Open the{" "}
              <Link className="linkish" href="/explore">
                catalogue
              </Link>{" "}
              and find the tool you are working with. Free, no card, and you can
              read what it knows before deciding.
            </li>
            <li>
              <strong>Connect your agent.</strong> One command, copied from{" "}
              <Link className="linkish" href="/connect">
                the connect page
              </Link>
              . It works with Claude Code, Cursor, Codex and anything else that
              speaks MCP — this is where that socket earns its keep.
            </li>
            <li>
              <strong>Ask normally.</strong> You do not change how you talk to your
              agent. It searches the brain when a question touches that subject,
              and tells you when the brain does not know.
            </li>
          </ol>
          <p style={{ color: "var(--ink-2)", marginTop: "1.25rem" }}>
            Reading and connecting is free, forever, and so is the whole catalogue.
            Money only appears when you want <em>our</em> AI to read documentation
            for you — and even then you can point your own agent at it instead and
            pay us nothing. The{" "}
            <Link className="linkish" href="/pricing">
              pricing page
            </Link>{" "}
            says exactly which is which.
          </p>
        </section>

        {/* ── glossary ────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 8vw, 5rem)" }}>
          <div className="section-head">
            <h2 className="h2">Words you will run into</h2>
            <span className="eyebrow">in plain language</span>
          </div>
          <div className="rows">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong>{g.term}</strong>
                  <span className="row-sub" style={{ maxWidth: "70ch" }}>
                    {g.plain}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            marginTop: "clamp(3rem, 8vw, 5rem)",
            paddingTop: "2rem",
            borderTop: "1.5px solid var(--ink)",
          }}
        >
          <h2 className="h2">Still not sure this is for you?</h2>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)", fontSize: "1.0625rem", lineHeight: 1.65 }}>
            Fair. Read{" "}
            <Link className="linkish" href="/stories">
              how people actually use it
            </Link>{" "}
            — an artist selling his method, a company teaching the AI its own
            software, a game studio, a maintainer, an agency. One of them is
            probably closer to your situation than anything on this page.
          </p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <Link className="btn" href="/explore">
              Look at the catalogue
            </Link>
            <Link className="btn btn-ghost" href="/start">
              Set it up, step by step
            </Link>
            <Link className="btn btn-ghost" href="/stories">
              How people use it
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
