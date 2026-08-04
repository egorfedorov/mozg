import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing — mozg admin" };

/**
 * The marketing kit: every text the operator needs to post, in copy-paste
 * form, plus the brand assets. Curated here rather than generated, so what
 * gets posted is exactly what was reviewed. Numbers that change (brains,
 * scores) are pulled live so a pasted post is never stale.
 */

function Block({ title, hint, text }: { title: string; hint?: string; text: string }) {
  return (
    <details style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", marginBottom: "1rem" }}>
      <summary style={{ padding: ".65rem 1rem", cursor: "pointer" }}>
        <strong>{title}</strong>
        {hint && (
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginLeft: ".75rem" }}>
            {hint}
          </span>
        )}
      </summary>
      <textarea
        readOnly
        defaultValue={text}
        rows={Math.min(18, text.split("\n").length + 2)}
        style={{
          display: "block",
          width: "100%",
          border: 0,
          borderTop: "1px solid var(--rule)",
          background: "var(--paper)",
          padding: ".8rem 1rem",
          font: "inherit",
          fontSize: ".875rem",
          resize: "vertical",
        }}
      />
    </details>
  );
}

export default async function MarketingPage() {
  await requireAdmin().catch(() => redirect("/"));

  const s = await query<{ brains: number; avg: number; paid: number }>(
    `select count(*)::int as brains,
            coalesce(round(avg(score)) filter (where score is not null), 0)::int as avg,
            count(*) filter (where price_cents > 0)::int as paid
       from brains where visibility = 'public'`,
  ).then((r) => r[0]);

  const oneLiner =
    "mozg.sh — paste one docs link, get an exam-scored brain your coding agent queries over MCP.";

  const boilerplate =
    "mozg turns documentation into a brain for AI coding agents. Paste one link — " +
    "every page is found and read, the material becomes searchable notes, and the " +
    "brain sits an exam against its own goal, so its score is measured, not claimed. " +
    "Agents connect from Claude Code, Codex or Cursor with one command and pull only " +
    "the notes a task needs. Brains learn from use: questions they fail to answer " +
    "become exam questions, corrections from agents become owner-reviewed notes, and " +
    "every version is kept. Free catalogue plus a marketplace where authors keep 95%.";

  const showHn =
    "Title: Show HN: Mozg – give your coding agents a brain that sits an exam\n" +
    "URL: https://mozg.sh\n\n" +
    "First comment (post right after submitting):\n\n" +
    "Hi HN. My coding agents kept confidently answering from stale training data — " +
    "the docs they needed were newer than the model. So I built mozg: paste one link " +
    "to any documentation and it crawls the whole thing (GitHub tree, llms.txt, " +
    "sitemap, or a link walk), extracts it into searchable notes, and connects to " +
    "Claude Code, Codex, Cursor or anything else over MCP.\n\n" +
    "The part I haven't seen elsewhere: every brain sits an exam. You state what the " +
    "brain is *for*, that becomes ~30 control questions, and after every ingest it " +
    "re-sits them — a measured score plus the exact list of missing material, instead " +
    "of guessing why your agent still answers badly. The exam deliberately asks about " +
    "things the brain does NOT yet cover; the failures are the point.\n\n" +
    "Since launch prep it also learns from use: when any connected agent searches a " +
    "brain and gets nothing, that query becomes an exam question, and the next " +
    "re-read of the sources chases it. Nobody files a ticket — hitting the gap is " +
    "the report.\n\n" +
    "Details people usually ask about:\n" +
    "- Searching a brain costs zero tokens of context — retrieval is server-side.\n" +
    "- Agents can flag a note as wrong when reality disagrees; the owner reviews.\n" +
    "- Everything exports as CLAUDE.md / AGENTS.md / a Claude Skill — leaving is cheap.\n" +
    "- Marketplace: free and paid brains; paid ones answer 5 real queries free.\n\n" +
    "Stack: Next.js + Postgres/pgvector + a local bge-m3 embedder; extraction and " +
    "the exam judge are Claude via API. Happy to answer anything about the exam " +
    "mechanics or the crawler.";

  const xThread =
    "1/ Your coding agent doesn't need a bigger context window. It needs a brain " +
    "that actually knows your stack — and can prove it. mozg.sh: paste one docs " +
    "link → trained, exam-scored, connected over MCP.\n\n" +
    "2/ The exam is the trick: your goal becomes ~30 control questions, re-sat " +
    "after every upload. \"Trained 92%\" is measured, not claimed. The failing 8% " +
    "tells you exactly what to feed it next.\n\n" +
    "3/ And it learns from being used: any question a brain can't answer becomes an " +
    "exam question automatically. The tenth user gets a better brain than the " +
    `first. ${s.brains} public brains so far — mozg.sh/explore`;

  const collectivePost =
    "Every knowledge file you write starts dying the day you write it.\n\n" +
    "We shipped the opposite: brains on mozg.sh now learn from failure. When any " +
    "connected agent asks a brain something and gets zero results, that exact " +
    "question is added to the brain's public exam — and the next re-read of the " +
    "sources goes hunting for the answer. Corrections agents file become " +
    "owner-reviewed notes. Every superseded version is kept, with the score it had.\n\n" +
    "Ask, miss, learn, prove. The loop runs without anyone writing a ticket:\n" +
    "https://mozg.sh/collective";

  const redditClaude =
    "r/ClaudeAI — title: I got tired of my agent's confident wrong answers, so my " +
    "docs now sit an exam\n\n" +
    "Body: CLAUDE.md files rot silently — you find out when the agent ships " +
    "something wrong. I built mozg.sh around one idea: knowledge must be measured. " +
    "Paste a docs link, it becomes a searchable brain over MCP, and the brain sits " +
    "~30 exam questions generated from what you said it's for. The score and gaps " +
    "are public on the brain's page; questions real agents ask and miss get added " +
    "to the exam automatically. Free to connect (Claude Code one-liner in " +
    "mozg.sh/connect). Would love hard feedback — it's in beta.";

  const discordStake =
    "Построил игру на Stake Engine с агентами? Я собрал все их доки в подключаемый " +
    "«мозг» для Claude Code/Cursor — агент отвечает по спеке RGS дословно, а не по " +
    "памяти модели. Бесплатно: https://mozg.sh/explore (раздел gamedev). Отдельно " +
    "есть платная семья Slot Studio — механики+математика, чеклист аппрува, " +
    "фронтенд, комплаенс. Первые 5 запросов к платным — бесплатно, прямо из агента. " +
    "Фидбек крайне welcome — я сам с этих доков шипплю.";

  const dm =
    "Hey — saw you're building with [Claude Code/Cursor]. I made a thing that might " +
    "save you some pain: mozg.sh turns any docs site into a brain your agent " +
    "queries over MCP, with a public exam score so you know what it actually " +
    "covers. Takes one command to connect, free brains for [their stack] included. " +
    "If you try it and it's not obviously useful in 10 minutes, tell me why — that " +
    "feedback is worth more to me than the signup.";

  const bio =
    "X bio: Building mozg.sh — exam-scored brains for AI coding agents. Paste a " +
    "link, get knowledge your agent can prove it has.\n\n" +
    "PH tagline: Brains for AI agents — trained from one link, scored by an exam.\n\n" +
    `Stats line (live): ${s.brains} public brains, average exam score ${s.avg}%, ` +
    `${s.paid} paid.`;

  return (
    <AppShell active="/admin/marketing" eyebrow="Operator" title="Marketing kit">
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        Everything here is written to be pasted as-is. Numbers are pulled live
        from the catalogue ({s.brains} public brains, avg score {s.avg}%). The
        rule of the voice: no claim a database row or an exam score can&apos;t
        back.
      </p>

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Positioning</h2>
      <Block title="One-liner" text={oneLiner} />
      <Block title="Boilerplate (100 words)" hint="press kits, directories" text={boilerplate} />
      <Block title="Bios & taglines" text={bio} />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Launch posts</h2>
      <Block title="Show HN" hint="post 15:00–17:00 CET" text={showHn} />
      <Block title="X thread" hint="3 tweets" text={xThread} />
      <Block title="Reddit r/ClaudeAI" text={redditClaude} />
      <Block title="Stake Engine Discord" hint="RU" text={discordStake} />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Evergreen</h2>
      <Block title="The collective-mind post" hint="X / LinkedIn / blog intro" text={collectivePost} />
      <Block title="Cold DM" hint="personalise the brackets" text={dm} />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Brand</h2>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mozg-wordmark.svg" alt="mozg wordmark" width={255} height={83} style={{ border: "1.5px solid var(--ink)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mozg-icon.svg" alt="mozg icon" width={83} height={83} style={{ border: "1.5px solid var(--ink)" }} />
        <div className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
          <p style={{ margin: "0 0 .4rem" }}>
            <a href="/brand/mozg-wordmark.svg" download>wordmark.svg</a> ·{" "}
            <a href="/brand/mozg-icon.svg" download>icon.svg</a> ·{" "}
            <a href="/opengraph-image" target="_blank">social card (1200×630)</a>
          </p>
          <p style={{ margin: 0 }}>
            paper #eceee7 · ink #14161a · riso red #f15060
            <br />
            The wordmark is lowercase, always with the red full stop.
          </p>
        </div>
      </div>

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Before posting anything</h2>
      <ul style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        <li>Open /pricing and one paid brain in a private window — eyes, not trust.</li>
        <li>Healthwatch alerts arriving? If we fall under traffic, we hear it first.</li>
        <li>First-comment answers live at /vs and /why: &ldquo;why not RAG&rdquo;, &ldquo;why not CLAUDE.md&rdquo;.</li>
      </ul>
    </AppShell>
  );
}
