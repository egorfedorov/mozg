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
            coalesce(round(avg(score)), 0)::int as avg,
            count(*) filter (where price_cents > 0)::int as paid
       from brains where visibility = 'public'`,
  ).then((r) => r[0]);

  const oneLiner =
    "mozg — open-source (AGPL) exam-scored brains for AI agents: paste a docs link, " +
    "get a searchable brain over MCP with a measured score. Free catalogue, free code.";

  const boilerplate =
    "mozg is an open-source (AGPL-3.0) platform that turns documentation into " +
    "brains for AI coding agents. Paste one link — " +
    "every page is found and read, the material becomes searchable notes, and the " +
    "brain sits an exam against its own goal, so its score is measured, not claimed. " +
    "Agents connect from Claude Code, Codex or Cursor with one command and pull only " +
    "the notes a task needs. Brains learn from use: questions they fail to answer " +
    "become exam questions, corrections from agents become owner-reviewed notes, and " +
    "every version is kept. The whole official catalogue is free; self-host from " +
    "github.com/egorfedorov/mozg (AGPL), or use the cloud where plans cover the " +
    "inference — or bring your own API key and build for free.";

  const showHn =
    "Title: Show HN: Mozg – open-source, exam-scored knowledge brains for coding agents\n" +
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
    "It's open source (AGPL): https://github.com/egorfedorov/mozg — the whole " +
    "product, self-hostable with your own keys. The entire official catalogue " +
    "(Next.js App Router, Expo, Svelte 5, Tailwind v4, the MCP spec) is free. The " +
    "cloud makes money one honest way: paid plans cover the inference our servers " +
    "spend building YOUR brains — or you set your own API key and pay nobody.\n\n" +
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
    "3/ Open source under AGPL, the whole catalogue free, and it learns from " +
    "use — any question a brain can't answer becomes an exam question " +
    "automatically. github.com/egorfedorov/mozg · " +
    `${s.brains} public brains — mozg.sh/explore`;

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
    "to the exam automatically. As of this week it's open source (AGPL): " +
    "github.com/egorfedorov/mozg — run it yourself, or use the cloud where the " +
    "whole catalogue is free and connecting is a Claude Code one-liner " +
    "(mozg.sh/connect). Would love hard feedback — it's in beta.";

  const discordStake =
    "Построил игру на Stake Engine с агентами? Я собрал все их доки в подключаемый " +
    "«мозг» для Claude Code/Cursor — агент отвечает по спеке RGS дословно, а не по " +
    "памяти модели. Теперь это опенсорс (AGPL, github.com/egorfedorov/mozg) и ВСЁ " +
    "бесплатно — включая семью Slot Studio: механики+математика, чеклист аппрува " +
    "(за что реально реджектят), фронтенд, комплаенс. https://mozg.sh/explore, " +
    "раздел gamedev. Фидбек крайне welcome — я сам с этих доков шипплю.";

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

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Launch runbook — go top to bottom</h2>
      <div style={{ display: "grid", gap: "1px", background: "var(--rule)", border: "1.5px solid var(--ink)", marginBottom: "1.5rem" }}>
        {[
          {
            when: "Day 1",
            what: "glama.ai — MCP server directory",
            how: "glama.ai/mcp/servers → Add server. Paste the «MCP directory listing» block below.",
            art: "—",
          },
          {
            when: "Day 1",
            what: "smithery.ai",
            how: "smithery.ai → Submit/Add server (GitHub sign-in). Same listing block.",
            art: "—",
          },
          {
            when: "Day 1",
            what: "mcp.so",
            how: "mcp.so → Submit. Same listing block.",
            art: "—",
          },
          {
            when: "Day 1",
            what: "pulsemcp.com + mcpservers.org",
            how: "Both have a Submit form/repo. Same listing block, shorter description field takes the ~160-char one.",
            art: "—",
          },
          {
            when: "Day 1",
            what: "awesome-mcp-servers (GitHub PR)",
            how: "github.com/punkpeye/awesome-mcp-servers → edit README → section «Knowledge & Memory» → add the PR line from the block below, alphabetical order. PR title: Add mozg.",
            art: "—",
          },
          {
            when: "Day 1",
            what: "awesome-selfhosted + r/selfhosted",
            how: "github.com/awesome-selfhosted/awesome-selfhosted → PR (section: Knowledge Management, AGPL badge). Then a r/selfhosted post: story-first, self-host instructions up top — that crowd converts on 'docker compose up'.",
            art: "—",
          },
          {
            when: "Day 2",
            what: "r/mcp",
            how: "reddit.com/r/mcp → post the «r/mcp post» block. Reply to every comment within the hour.",
            art: "social-exam.jpg",
          },
          {
            when: "Day 3",
            what: "r/ClaudeAI",
            how: "reddit.com/r/ClaudeAI → the «r/ClaudeAI post» block. Don't post both subreddits the same day.",
            art: "social-exam.jpg",
          },
          {
            when: "Day 4-5",
            what: "Dev.to article",
            how: "dev.to/new → paste the full markdown block (front-matter included) → cover image devto-cover.jpg → publish. Cross-post to Hashnode after, canonical = dev.to.",
            art: "devto-cover.jpg",
          },
          {
            when: "Week 2 · Tue-Thu",
            what: "Show HN",
            how: "news.ycombinator.com/submit at 14:00-16:00 UTC. Title+URL from the «Show HN» block; post the first comment yourself immediately. Answer everything for 2 hours. Never ask for upvotes.",
            art: "—",
          },
          {
            when: "Week 2, day after HN",
            what: "X thread",
            how: "Three tweets from the «X thread» block, image on the first tweet.",
            art: "social-exam.jpg",
          },
          {
            when: "Week 2",
            what: "Stake Engine Discord",
            how: "The RU block below, in the community/showcase channel. You're a known member — post as yourself, not as an ad.",
            art: "—",
          },
          {
            when: "Week 3 · Tue-Wed",
            what: "Product Hunt",
            how: "producthunt.com/posts/new at 00:01 PT. Name/tagline/description from LAUNCH.md. First comment: the founder story. Gallery: all three images + screenshots of a brain page and learn course.",
            art: "all three",
          },
          {
            when: "Week 3",
            what: "learn angle",
            how: "r/learnprogramming-style communities, story-first: «I turned my agent's knowledge base into a course and tried to beat its exam score». Link learn.mozg.sh only when asked or at the bottom.",
            art: "learn-social.jpg",
          },
          {
            when: "Always",
            what: "Every new brain = a post",
            how: "One brain a week to ≥85%, announce with the X thread pattern. Every external link gets ?utm_source=<platform> so PostHog can name the winner.",
            art: "rotate",
          },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--paper-2)", padding: ".8rem 1rem", display: "flex", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)", width: "7.5rem", flexShrink: 0 }}>
              {String(i + 1).padStart(2, "0")} · {s.when}
            </span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <strong>{s.what}</strong>
              <p style={{ margin: ".2rem 0 0", color: "var(--ink-2)", fontSize: ".9375rem" }}>{s.how}</p>
            </div>
            <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>{s.art}</span>
          </div>
        ))}
      </div>

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Positioning</h2>
      <Block title="One-liner" text={oneLiner} />
      <Block title="Boilerplate (100 words)" hint="press kits, directories" text={boilerplate} />
      <Block title="Bios & taglines" text={bio} />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Launch posts</h2>
      <Block title="Show HN" hint="post 15:00–17:00 CET" text={showHn} />
      <Block title="X thread" hint="3 tweets" text={xThread} />
      <Block title="Reddit r/ClaudeAI" text={redditClaude} />
      <Block title="Stake Engine Discord" hint="RU" text={discordStake} />
      <Block
        title="Stake Engine Discord — EN"
        hint="showcase/community channel, post as yourself"
        text={
          "Building on Stake Engine with coding agents? I got tired of mine " +
          "answering RGS questions from year-old memory, so I turned the " +
          "entire Stake Engine docs into a connectable \"brain\" for Claude " +
          "Code / Codex / Cursor — the agent pulls the actual spec over MCP " +
          "(authenticate, /wallet/play amounts in minor units, event shapes) " +
          "instead of guessing.\n\n" +
          "The part I built because I needed it: every brain sits an exam " +
          "against its own docs. The RGS API brain currently scores 88%, the " +
          "Math SDK one 81% — and the failed questions are listed publicly, " +
          "so you know exactly what it does and doesn't cover before " +
          "trusting it.\n\n" +
          "It's all free now — and open source (AGPL, " +
          "github.com/egorfedorov/mozg): the Stake Engine family AND the Slot " +
          "Studio family — mechanics + math patterns, the approval checklist " +
          "(what actually gets submissions rejected), frontend, compliance. " +
          "https://mozg.sh/explore, gamedev section, one command to " +
          "connect.\n\n" +
          "I ship my own games with these docs daily — feedback and \"your " +
          "brain got this wrong\" reports are exactly what I want."
        }
      />
      <Block
        title="Русский геймдев-канал"
        hint="чат/канал разработчиков игр, тон — свой, история"
        text={
          "Расскажу про инструмент, который сделал для себя, а получился " +
          "продукт.\n\n" +
          "Я делаю слоты, и мои ИИ-агенты (Claude Code / Cursor) постоянно " +
          "уверенно отвечали по устаревшим докам платформы — модель же " +
          "училась год назад. Надоело. Собрал mozg.sh: вставляешь одну " +
          "ссылку на документацию → краулер вычитывает всё (GitHub-репо, " +
          "llms.txt, sitemap) → получается «мозг», который агент дергает по " +
          "MCP и отвечает по спеке дословно, а не по памяти.\n\n" +
          "Главная фишка — экзамен. Цель мозга превращается в ~30 " +
          "контрольных вопросов, и после каждой загрузки он их пересдаёт: " +
          "«обучен на 88%» — это измерено, и провальные вопросы висят " +
          "публично. То есть видно, чему агент реально научился, а где " +
          "будет врать. Плюс мозг умнеет от использования: вопрос, на " +
          "который он не ответил, сам становится вопросом экзамена.\n\n" +
          "Проект теперь опенсорс (AGPL, github.com/egorfedorov/mozg) и " +
          "весь каталог бесплатен — включая геймдев целиком: Stake Engine " +
          "(RGS API, математика, аппрув) и Slot Studio (механики, чеклист " +
          "аппрува — за что реально реджектят, комплаенс).\n\n" +
          "И бонус: любой мозг открывается как курс для человека на " +
          "learn.mozg.sh — карточки, интервальные повторения, и тот же " +
          "экзамен в конце. Можно попробовать обогнать своего агента по " +
          "баллам :)\n\n" +
          "Сам этим шипплю каждый день. Баги и «мозг тут наврал» — " +
          "кидайте, чиню быстро: https://mozg.sh"
        }
      />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Week 1 — MCP ecosystem</h2>
      <Block
        title="MCP directory listing"
        hint="glama.ai · smithery.ai · mcp.so · pulsemcp.com · mcpservers.org"
        text={
          "Name: mozg\n" +
          "Category: Knowledge & Memory\n" +
          "Endpoint: https://mozg.sh/mcp (Streamable HTTP, Bearer token)\n" +
          "Homepage: https://mozg.sh\n\n" +
          "Short description (~160 chars):\n" +
          "Exam-scored knowledge brains for coding agents. Paste a docs URL → " +
          "searchable brain over MCP, with a measured score and known gaps.\n\n" +
          "Long description:\n" +
          "mozg turns documentation into knowledge brains your agent queries " +
          "over MCP instead of loading whole files into context. What makes it " +
          "different: every brain sits an exam. Its goal becomes ~30 control " +
          "questions, re-sat after every ingest — so 'trained 92%' is measured, " +
          "not claimed, and the failing questions are listed publicly. Brains " +
          "learn from use: searches that return nothing become exam questions, " +
          "corrections agents file become owner-reviewed notes. Searching costs " +
          "zero context tokens — retrieval is server-side, the agent reads only " +
          "the notes it asked for. Free catalogue (Next.js App Router, Expo, " +
          "Svelte 5, Tailwind v4, MCP spec itself), one-command connect for " +
          "Claude Code, Codex, Cursor and friends.\n\n" +
          "Tools: brain_list, brain_brief, brain_search, brain_read, " +
          "brain_write, brain_feedback, brain_create, brain_add_source"
        }
      />
      <Block
        title="awesome-mcp-servers — PR line"
        hint="section: Knowledge & Memory; PR title: Add mozg"
        text={
          "- [mozg](https://mozg.sh) — Exam-scored knowledge brains: paste a docs " +
          "URL, get a searchable brain with a measured score and known gaps; " +
          "misses become exam questions automatically.\n\n" +
          "PR description:\n" +
          "Adds mozg (https://mozg.sh) to Knowledge & Memory. Streamable HTTP " +
          "MCP server; free brains without a card; the distinctive part is that " +
          "every knowledge base is scored by an auto-generated exam and " +
          "publishes what it does NOT know, so agents can be told the gaps " +
          "before they search."
        }
      />
      <Block
        title="r/mcp post"
        hint="flair: Show & Tell, no link shorteners"
        text={
          "Title: I built an MCP server where every knowledge base has to pass " +
          "an exam\n\n" +
          "The problem I kept hitting: I'd give my agent docs as context files " +
          "or memory servers, and I had no idea what it actually absorbed. It " +
          "answered everything confidently either way.\n\n" +
          "So mozg does one unusual thing: when you build a brain (paste one " +
          "docs URL — crawler handles GitHub trees, llms.txt, sitemaps), the " +
          "goal you wrote becomes ~30 control questions, and the brain re-sits " +
          "them after every ingest. You get 'trained 87%' as a measured fact, " +
          "plus the exact list of questions it failed. The exam deliberately " +
          "asks about material the brain does NOT have yet — failures are the " +
          "roadmap.\n\n" +
          "Two things fell out of that design that I didn't expect:\n\n" +
          "1. Brains learn from being used. Any search that returns zero " +
          "results gets recorded and becomes an exam question — the next " +
          "re-read of the sources chases what real callers actually asked.\n" +
          "2. The exam doubles as a human course. learn.mozg.sh turns the same " +
          "notes into spaced-repetition lessons, with the brain's own exam as " +
          "the final. You can try to beat your agent's score.\n\n" +
          "It's open source (AGPL): https://github.com/egorfedorov/mozg — " +
          "self-host with your own keys, everything works. The whole catalogue " +
          "(MCP spec, Next.js App Router, Expo, Svelte 5, Tailwind v4) is " +
          "free: https://mozg.sh/explore — one command to connect from Claude " +
          "Code/Codex/Cursor. Feedback very welcome, especially where the " +
          "exam grading feels wrong."
        }
      />
      <Block
        title="r/ClaudeAI post"
        hint="conversational, story first"
        text={
          "Title: I got tired of my agent's confident wrong answers, so my " +
          "docs now sit an exam\n\n" +
          "CLAUDE.md files rot silently — you find out when the agent ships " +
          "something wrong. I built mozg.sh around one idea: knowledge must be " +
          "measured.\n\n" +
          "Paste a docs link, it becomes a searchable brain over MCP, and the " +
          "brain sits ~30 exam questions generated from what you said it's " +
          "for. The score and the gaps are public on the brain's page; " +
          "questions real agents ask and miss get added to the exam " +
          "automatically, so the brain gets smarter the more it's used.\n\n" +
          "Connecting from Claude Code is one command (mozg.sh/connect), the " +
          "whole catalogue is free, and everything exports back to CLAUDE.md " +
          "if you leave. As of this week it's open source under AGPL — " +
          "github.com/egorfedorov/mozg — so you can also just run it " +
          "yourself. I answer every bug report personally (there's a chat " +
          "inside the product). Would love hard feedback."
        }
      />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Week 3 — Dev.to article</h2>
      <Block
        title="Dev.to — full article (markdown)"
        hint="tags: ai, productivity, claudecode, mcp · canonical: none"
        text={
          "---\n" +
          "title: I measured how much my coding agent actually knows about my stack. It was 40%.\n" +
          "tags: ai, mcp, claudecode, productivity\n" +
          "---\n\n" +
          "My coding agent answers every question about my stack with total " +
          "confidence. Last month I finally asked the question that should " +
          "have been first: *how much of that is true?*\n\n" +
          "## The experiment\n\n" +
          "I took the platform docs my agents rely on daily — a games " +
          "platform's RGS API, its math SDK, the approval checklist — wrote " +
          "down what an agent *should* be able to answer, generated ~30 " +
          "control questions from that, and graded the agent's answers " +
          "against the actual docs.\n\n" +
          "It scored around 40%. The worst part wasn't the score — it was " +
          "that every wrong answer *sounded exactly like every right one*. " +
          "Same confidence, same fluency, same code blocks. The model's " +
          "training data was simply older than the docs, and nothing in the " +
          "conversation could tell me which answers were from 2024.\n\n" +
          "## Context files don't fix this\n\n" +
          "The standard fix is a CLAUDE.md / skills folder / a memory MCP " +
          "server. I had all three. Three problems survived:\n\n" +
          "1. **You pay for every word, every session** — the whole file " +
          "rides along whether the task needs it or not.\n" +
          "2. **They rot silently.** A file written in March is confidently " +
          "wrong by June, and nothing tells you.\n" +
          "3. **You can't measure them.** Nobody knows what a folder of " +
          "markdown actually covers until the agent fails in production.\n\n" +
          "## So I made the knowledge sit an exam\n\n" +
          "I built [mozg](https://mozg.sh) around one mechanism: every " +
          "knowledge base ('brain') is scored against its own purpose.\n\n" +
          "- Paste one docs URL. The crawler finds every page (GitHub tree, " +
          "llms.txt, sitemap, or a link walk) and extracts it into atomic, " +
          "searchable notes.\n" +
          "- The goal you wrote becomes ~30 exam questions. The brain sits " +
          "them after every ingest. 'Trained 87%' is a measured number, and " +
          "the failed questions are listed right on the brain's page.\n" +
          "- The exam deliberately asks about things the brain does NOT " +
          "cover yet. The failures are the point — they tell you exactly " +
          "what to feed it next.\n\n" +
          "Agents connect over MCP (one command in Claude Code / Codex / " +
          "Cursor) and search server-side — the context cost of an answer is " +
          "the three notes it actually needed, not the 700 the brain holds.\n\n" +
          "## The part I didn't plan: it learns from being used\n\n" +
          "Once real agents were querying brains, the logs contained " +
          "something better than any test I could write: **the questions the " +
          "brain failed to answer.** Now every search that returns nothing " +
          "becomes an exam question automatically, and the next re-read of " +
          "the sources goes hunting for it. Corrections agents file become " +
          "owner-reviewed notes. The tenth user gets a measurably better " +
          "brain than the first.\n\n" +
          "That same exam turned out to be a curriculum: " +
          "[learn.mozg.sh](https://learn.mozg.sh) serves any brain as a " +
          "spaced-repetition course — read, recall, quiz — with the brain's " +
          "exam as the final. The scoreboard shows your percentage next to " +
          "your agent's. Beating your own agent is weirdly motivating.\n\n" +
          "## Honest limitations\n\n" +
          "- The judge is a model, so scores wobble ±3-4 points (majority " +
          "voting tames most of it).\n" +
          "- A brain is only as good as its sources — the exam tells you " +
          "*that* material is missing, not where to find it.\n" +
          "- For stable, well-known knowledge (Python stdlib), a brain adds " +
          "nothing — models know it. Brains earn their keep where docs move " +
          "faster than training cutoffs.\n\n" +
          "## And now it's open source\n\n" +
          "The whole product is on GitHub under AGPL: " +
          "https://github.com/egorfedorov/mozg — self-host it with your own " +
          "keys and everything works. The entire official catalogue is free. " +
          "The cloud earns one honest way: plans cover the inference our " +
          "servers spend building your brains — or you bring your own API " +
          "key and pay nobody.\n\n" +
          "## Try it\n\n" +
          "The catalogue has free, no-card brains for exactly those fast-" +
          "moving stacks: Next.js App Router, Expo/React Native, Svelte 5, " +
          "Tailwind v4, the MCP spec itself. Connect one to your agent in a " +
          "minute: https://mozg.sh — or study one yourself at " +
          "https://learn.mozg.sh. It's in beta; the chat button inside goes " +
          "straight to me."
        }
      />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Community posts — per ecosystem</h2>
      <Block
        title="Claude Discord — #built-with-claude"
        hint="tags: MCP Server, Open Source · attach social-exam.jpg"
        text={
          "mozg — open-source, exam-scored knowledge brains for Claude Code (and " +
          "any MCP client)\n\n" +
          "Built almost entirely WITH Claude Code, over a very intense week. The " +
          "problem: my agents kept confidently answering from stale training data " +
          "— the docs they needed were newer than the model.\n\n" +
          "What it does: paste one docs URL → the crawler reads the whole site " +
          "(GitHub tree, llms.txt, sitemap) into searchable notes → your agent " +
          "queries them over MCP with zero context cost. The unusual part: every " +
          "brain sits an exam generated from its own goal. \"Trained 88%\" is " +
          "measured, and the failed questions are public — agents are told the " +
          "gaps before they search. Questions real agents ask and miss become " +
          "exam questions automatically, so brains get smarter from use.\n\n" +
          "There's also a Claude Code plugin (session-start hook suggests brains " +
          "matching your repo, /mozg:train teaches through your subscription — " +
          "no API key needed), and learn.mozg.sh turns any brain into a " +
          "spaced-repetition course where you try to beat your agent's score.\n\n" +
          "Open source (AGPL): https://github.com/egorfedorov/mozg\n" +
          "Try it: https://mozg.sh — whole catalogue free (Next.js App Router, " +
          "Expo, Svelte 5, Tailwind v4, the MCP spec itself). Feedback and PRs " +
          "very welcome!"
        }
      />
      <Block
        title="Codex / OpenAI community post"
        hint="OpenAI dev forum / r/OpenAI — Codex angle"
        text={
          "I built an open-source MCP server that makes Codex answer from " +
          "current docs — with a measured score\n\n" +
          "Codex (like every model) answers from training data, and docs move " +
          "faster than cutoffs. mozg turns any docs site into a \"brain\": paste " +
          "one URL, it becomes searchable notes your agent queries over MCP — " +
          "only the notes a task needs enter context.\n\n" +
          "The twist: every brain sits an exam generated from what you said it's " +
          "for. The score is measured, the failing questions are public, and " +
          "queries that return nothing become new exam questions automatically.\n\n" +
          "Works with Codex out of the box (one command, mozg.sh/connect), and " +
          "if you build your own brains you can bring your own OpenAI key — " +
          "training runs on your spend, no plan needed.\n\n" +
          "AGPL, self-hostable: https://github.com/egorfedorov/mozg · free " +
          "catalogue: https://mozg.sh/explore"
        }
      />
      <Block
        title="Kimi / CN-ecosystem community post"
        hint="Kimi Discord / r/LocalLLaMA angle — BYOK first"
        text={
          "Open-source knowledge brains for coding agents — works with Kimi, " +
          "DeepSeek, Qwen keys out of the box\n\n" +
          "mozg turns documentation into exam-scored knowledge bases that any " +
          "MCP-speaking agent (Claude Code, Codex, Cursor, Kimi CLI, Qwen Code) " +
          "queries server-side — zero context cost per answer.\n\n" +
          "Two things this crowd will care about:\n" +
          "1. BYOK: set a Kimi / DeepSeek / Qwen / GLM key in settings and your " +
          "brains train, examine and compile lessons on YOUR key via the " +
          "OpenAI-compatible protocol — presets for each provider built in, no " +
          "plan required.\n" +
          "2. It's AGPL and self-hostable: Postgres + pgvector + a local bge-m3 " +
          "embedder, queue inside Postgres, docker compose up and it's yours: " +
          "https://github.com/egorfedorov/mozg\n\n" +
          "Every brain publishes its exam score AND its failed questions — you " +
          "know what it can't answer before trusting it. Free catalogue: " +
          "https://mozg.sh/explore"
        }
      />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Evergreen</h2>
      <Block
        title="The star ask"
        hint="X / Discord / end of any post — never begs, always trades"
        text={
          "We open-sourced everything yesterday: the exam engine, the crawler, " +
          "the collective-mind loop, the spaced-repetition courses — the whole " +
          "product, AGPL, one docker compose away.\n\n" +
          "Here's the honest deal on stars: mozg has no ad budget and no " +
          "growth team. It has one mechanic — brains get smarter with every " +
          "person who uses them — which means every developer who finds this " +
          "makes it better for everyone who already did. A star is how the " +
          "next person finds it.\n\n" +
          "If an agent of yours ever answered from year-old docs with total " +
          "confidence, that's who this is for:\n" +
          "⭐ https://github.com/egorfedorov/mozg\n\n" +
          "And if it's not star-worthy yet — tell me why instead, that's " +
          "worth more: https://mozg.sh/chat"
        }
      />
      <Block title="The collective-mind post" hint="X / LinkedIn / blog intro" text={collectivePost} />
      <Block title="Cold DM" hint="personalise the brackets" text={dm} />

      <h2 className="h3" style={{ margin: "1.5rem 0 .75rem" }}>Post art</h2>
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        Generated in the house riso style, no baked text — captions belong to
        the platform, not the pixels. Cover for Dev.to, square for
        Reddit/X, green one for anything learn.
      </p>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: "1.5rem" }}>
        {[
          { src: "/brand/devto-cover.jpg", label: "devto-cover.jpg — article cover, 16:9" },
          { src: "/brand/social-exam.jpg", label: "social-exam.jpg — the exam, 1:1" },
          { src: "/brand/learn-social.jpg", label: "learn-social.jpg — learn posts, 16:9" },
        ].map((img) => (
          <a key={img.src} href={img.src} download style={{ display: "block" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.src} alt={img.label} style={{ width: "100%", border: "1.5px solid var(--ink)", display: "block" }} />
            <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>{img.label}</span>
          </a>
        ))}
      </div>

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
