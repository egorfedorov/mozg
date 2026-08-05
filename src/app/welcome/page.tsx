import { currentUser } from "@/lib/session";
import { query } from "@/db";
import WelcomeFlow, { type StepState } from "./WelcomeFlow";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Welcome — mozg in one minute",
  description:
    "What mozg is, how a brain learns, and your first four steps — with live checkmarks.",
  robots: { index: false, follow: false },
};

/**
 * The onboarding, standalone by design: no topbar, no nav, no footer —
 * a fresh account lands here from /brains exactly once, everyone else only
 * by link. The chrome would offer forty exits from a page whose whole job
 * is three steps.
 */

const STEPS = [
  {
    n: "01",
    title: "Make a brain",
    body: "A brain is a container for one subject — your product, your stack, your rules. Empty at birth, like all of us.",
    href: "/brains/new",
    ctaLabel: "New brain",
    key: "brains",
  },
  {
    n: "02",
    title: "Feed it something you know",
    body: "Paste a docs link, drop screenshots or files. mozg reads them, distills notes — then sits an exam on itself, so the score is graded, not claimed.",
    href: "/brains",
    ctaLabel: "Add a source",
    key: "sources",
  },
  {
    n: "03",
    title: "Connect your agent, once",
    body: "One command in your CLI (Claude Code, Codex, Cursor — anything that speaks MCP). A token is the only setup there is.",
    href: "/connect",
    ctaLabel: "Connect an agent",
    key: "tokens",
  },
  {
    n: "04",
    title: "Ask — and watch it learn",
    body: "Every agent you have now answers from the same brain. Questions it can't answer join its exam; corrections come back as notes.",
    href: "/mind",
    ctaLabel: "Your mind",
    key: "calls",
  },
] as const;

export default async function WelcomePage() {
  const user = await currentUser();

  const done = user
    ? await query<{ brains: number; sources: number; tokens: number; calls: number }>(
        `select
           (select count(*)::int from brains where owner_id = $1) as brains,
           (select count(*)::int from sources s join brains b on b.id = s.brain_id
             where b.owner_id = $1) as sources,
           (select count(*)::int from mcp_tokens
             where user_id = $1 and revoked_at is null) as tokens,
           (select count(*)::int from calls where caller_id = $1) as calls`,
        [user.id],
      ).then((r) => r[0])
    : null;

  const steps: StepState[] = STEPS.map((s) => ({
    n: s.n,
    title: s.title,
    body: s.body,
    href: s.href,
    ctaLabel: s.ctaLabel,
    done: Boolean(done && done[s.key] > 0),
  }));

  return <WelcomeFlow signedIn={Boolean(user)} steps={steps} />;
}
