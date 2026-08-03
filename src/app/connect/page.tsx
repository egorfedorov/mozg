import Link from "next/link";
import TopBar from "@/components/TopBar";
import AppShell from "@/components/AppShell";
import SiteFooter from "@/components/SiteFooter";
import ClientList from "./ClientList";
import { CLIENTS, MODELS } from "@/lib/clients";
import { currentUser } from "@/lib/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect a brain — mozg",
  description:
    "Exact configuration for Claude Code, Codex, Kimi CLI, Qwen Code, Cursor, VS Code, Cline and Claude Desktop.",
};

export default async function ConnectPage() {
  const user = await currentUser();

  // Same page, two frames: signed in it is a workspace screen, signed out it
  // is a marketing page that has to introduce itself and link onward.
  const body = (
    <>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          A brain speaks MCP, so any client that speaks MCP can read it. Below is
          the exact configuration for each one, taken from that client&apos;s own
          documentation.
        </p>

        {/* The single most common misunderstanding, answered before it is asked. */}
        <aside
          className="panel"
          style={{ marginTop: "2rem", maxWidth: "64ch", borderLeft: "4px solid var(--color-riso-blue)" }}
        >
          <p className="eyebrow" style={{ marginBottom: ".5rem" }}>
            First, the thing everyone asks
          </p>
          <p style={{ margin: 0, color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink)" }}>MCP is a client feature, not a
            model feature.</strong>{" "}
            Kimi, DeepSeek, GLM and Qwen are models. You run them inside one of the
            clients on this page, and the brain connects to the client. Asking
            whether mozg &quot;supports DeepSeek&quot; is really asking which client
            you run DeepSeek in.
          </p>
        </aside>

        {/* The shortest path first. Everything below it is the manual way. */}
        <section
          className="panel"
          style={{ marginTop: "2rem", borderLeft: "4px solid var(--color-riso-green)" }}
        >
          <p className="eyebrow">Claude Code · the short way</p>
          <h2 className="h3" style={{ margin: ".4rem 0 .6rem" }}>
            Install the plugin instead of editing config.
          </h2>
          <pre
            className="mono"
            style={{
              margin: "0 0 .75rem",
              fontSize: ".8125rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
{`/plugin marketplace add mozg-sh/mozg
/plugin install mozg@mozg
export MOZG_TOKEN=mzg_...`}
          </pre>
          <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>
            It brings the MCP connection and two commands: <code className="mono">/brains</code>{" "}
            to see what you can read, <code className="mono">/learn</code> to save what a
            session worked out. Make the token below — the button fills it into the
            command.
          </p>
        </section>

        <ClientList
          clients={CLIENTS}
          url={`${env.NEXT_PUBLIC_APP_URL}/mcp`}
          signedIn={Boolean(user)}
        />

        <section id="models" style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", scrollMarginTop: "5rem" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            Models, and where they fit
          </h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
            None of these connect to a brain directly. Each one runs inside a client
            from the list above.
          </p>

          <div className="panel" style={{ padding: 0, marginTop: "1.25rem" }}>
            {MODELS.map((m) => (
              <div
                key={m.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 1fr) 2fr",
                  gap: "1rem",
                  padding: ".8rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                  alignItems: "baseline",
                }}
              >
                <span>
                  <strong>{m.name}</strong>
                  <span
                    className="mono"
                    style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}
                  >
                    {m.vendor}
                  </span>
                </span>
                <span style={{ color: "var(--ink-2)", fontSize: ".9375rem" }}>
                  {m.verdict}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: ".75rem" }}>
            What the agent gets
          </h2>
          <p className="lede">
            Seven tools, the same in every client on this page — a brain is not a
            Claude feature. The descriptions tell the agent <em>when</em> to reach
            for each one, which is the difference between a brain that gets used
            and one that sits there.
          </p>

          <div className="panel" style={{ padding: 0, marginTop: "1.25rem" }}>
            {[
              ["brain_list", "What brains am I allowed to read?"],
              ["brain_brief", "What does this brain cover — and what is it known to be missing?"],
              ["brain_search", "Find what this project actually decided, before answering from general knowledge."],
              ["brain_read", "Open one note in full."],
              ["brain_write", "Save a convention or a pitfall worth keeping."],
              ["brain_create", "Start a new brain, without leaving the editor."],
              ["brain_add_source", "Feed it documentation pages or a block of text to read."],
            ].map(([name, what]) => (
              <div
                key={name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(130px, auto) 1fr",
                  gap: "1rem",
                  padding: ".7rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                  alignItems: "baseline",
                }}
              >
                <code className="mono" style={{ color: "var(--color-riso-blue)" }}>
                  {name}
                </code>
                <span style={{ color: "var(--ink-2)", fontSize: ".9375rem" }}>{what}</span>
              </div>
            ))}
          </div>
        </section>

        <div
          style={{
            display: "flex",
            gap: ".75rem",
            marginTop: "clamp(3rem, 7vw, 4rem)",
            flexWrap: "wrap",
          }}
        >
          <Link className="btn" href={user ? "/brains" : "/sign-in"}>
            {user ? "Your brains" : "Build a brain"}
          </Link>
          <Link className="btn btn-ghost" href="/guide">
            How to build a good one
          </Link>
        </div>
    </>
  );

  if (user) {
    return (
      <AppShell
        active="/connect"
        eyebrow="Model Context Protocol"
        title="Connect a brain to whatever you code in."
      >
        {body}
      </AppShell>
    );
  }

  return (
    <>
      <TopBar active="connect" />
      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">Model Context Protocol</p>
        <h1
          className="h1" style={{ margin: ".4rem 0 1rem" }}
        >
          Connect a brain to
          <br />
          whatever you code in.
        </h1>
        {body}
      </main>
      <SiteFooter />
    </>
  );
}
