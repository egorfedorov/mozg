import Link from "next/link";
import { markup, fill } from "@/lib/markup";
import { translator } from "@/lib/t";
import { msg } from "@/lib/msg";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { formatCents } from "@/lib/money-math";
import { MIN_PAYOUT_CENTS } from "@/lib/money";
import { PLAN_PRICE_CENTS } from "@/lib/plans";
import {
  REFERRAL_PERCENT,
  REFERRAL_DAYS,
  commissionCents,
  referralLink,
  referralStats,
  referralActivity,
} from "@/lib/referral";
import EarnLink from "./EarnLink";
import Calculator from "./Calculator";

// The top of the page is somebody's own live numbers. Nothing about that can
// be prerendered into one cached copy.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("Earn with mozg — 20% of every month"),
    description: t("Send someone to mozg and take 20% of every plan payment they make, for as long as they keep paying. Free to join, 30-day window, commission lands on your balance the second it is earned."),
  };
}

/**
 * The referral programme, as one page.
 *
 * Signed out it is the argument; signed in the same page opens with your link
 * and your real numbers and the argument moves below them. Two pages would
 * have meant two places to change the percentage, and a dashboard that lives
 * somewhere the person who has not joined can never see it — which is the
 * shape that makes affiliates ask "so what does it actually look like".
 */

const WHY: { tint: string; field: string; title: string; body: string }[] = [
  {
    tint: "violet",
    field: msg("The pitch"),
    title: msg("The thing sells itself to one specific person"),
    body: msg("Anyone who works with a coding agent has already had the argument where it confidently invents an API that does not exist. You are not pitching a category — you are handing them the answer to a complaint they made out loud last week."),
  },
  {
    tint: "green",
    field: msg("Recurring"),
    title: msg("It pays again next month, and the month after"),
    body: msg("Not a bounty on the first invoice. Every 30-day payment they make pays you again, at the same rate, with no ceiling and no expiry on the referral. Stop recommending and the money already earned keeps arriving."),
  },
  {
    tint: "blue",
    field: msg("An easy yes"),
    title: msg("Most of mozg is free, which is what makes it an easy yes"),
    body: msg("The catalogue, connecting an agent, teaching from a CLI you already pay for — none of it costs anything. Nobody has to be talked into a card to try it, so the ask is small and the conversion is honest."),
  },
  {
    tint: "orange",
    field: msg("The window"),
    title: msg("Thirty days of credit, checked against a real account"),
    body: msg("The link resolves your handle against the table before it counts anything, so a typo cannot silently earn nobody. The claim then sits in a cookie for a month — sign-up on the Tuesday still pays you."),
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: msg("Take your link"),
    body: msg("It is your handle: mozg.sh/r/yourname. Nothing to apply for, no separate account, no platform in the middle. If you have signed in here, you already have it."),
  },
  {
    n: "2",
    title: msg("Put it where the complaint is"),
    body: msg("A newsletter, a client handover, the thread where somebody says their agent keeps guessing. Point it straight at the brain that proves the argument — the link takes a destination."),
  },
  {
    n: "3",
    title: msg("Watch the balance move"),
    body: msg("Clicks, sign-ups and every commission show on this page. The money is on your balance the instant they pay, and comes out through the same payout queue as everything else here."),
  },
];

const FOR: { who: string; note: string }[] = [
  { who: msg("Agencies and consultants"), note: msg("you already set up their tooling") },
  { who: msg("Newsletters and creators"), note: msg("an audience that ships code") },
  { who: msg("Design system owners"), note: msg("the one brain everybody needs") },
  { who: msg("Game and engine studios"), note: msg("conventions nobody writes down") },
  { who: msg("Anyone selling a brain here"), note: msg("your buyers arrive through your link") },
  { who: msg("People who just like it"), note: msg("no minimum, no application") },
];

export default async function EarnPage() {
  const t = await translator();

  const user = await currentUser();
  const mine =
    user?.handle
      ? {
          link: referralLink(user.handle),
          stats: await referralStats(user.id),
          activity: await referralActivity(user.id),
        }
      : null;

  const perPro = commissionCents(PLAN_PRICE_CENTS.pro);
  const perTeam = commissionCents(PLAN_PRICE_CENTS.team);

  return (
    <>
      <TopBar />
      <Contents active="/earn" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        {/* ── hero ────────────────────────────────────────────────────── */}
        <p className="eyebrow">{t("Earn with mozg")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", margin: ".6rem 0 1rem", maxWidth: "20ch" }}
        >
          {markup(t("Recommend it once. <0/> Get paid every month."), [<br key="s0" />])}
        </h1>
        <p className="lede" style={{ fontSize: "clamp(1rem, 2vw, 1.15rem)", maxWidth: "54ch" }}>
          {markup(t("Send somebody to mozg and take <0/>% of every plan payment they make — <1>not just the first one</1>. A Pro account pays you <2/> a month for as long as they stay; Team pays <3/>. Free to join, nothing to apply for."), [
            REFERRAL_PERCENT,
            <strong key="s1" />,
            formatCents(perPro),
            formatCents(perTeam),
          ])}
        </p>

        <div style={{ marginTop: "1.75rem" }}>
          {mine ? (
            <div className="stack-tight">
              <EarnLink
                base={mine.link}
                pitch={t("Your coding agent guesses at your codebase. mozg gives it a brain that knows — searchable notes over MCP, graded by an exam it re-sits every week.")}
              />

              <Stats>
                <Stat
                  label={t("Earned")}
                  value={formatCents(mine.stats.earnedCents)}
                  note={fill(t("<0/> in the last 30 days"), [formatCents(mine.stats.earned30dCents)])}
                  big
                />
                <Stat
                  label={t("Every month")}
                  value={formatCents(mine.stats.runRateCents)}
                  note={t("if nobody cancels — a projection")}
                />
                <Stat
                  label={t("Link opens")}
                  value={String(mine.stats.clicks)}
                  note={fill(t("<0/> in the last 30 days"), [mine.stats.clicks30d])}
                />
                <Stat
                  label={t("Signed up")}
                  value={String(mine.stats.signups)}
                  note={fill(t("<0/> paying right now"), [mine.stats.paying])}
                />
              </Stats>

              <Section title={t("What your link did")} aside={t("newest first")}>
                <Rows
                  empty={t("Nothing yet. Post the link somewhere people complain about their agent guessing, and this fills in — opens are counted the same day.")}
                >
                  {mine.activity.map((e, i) => (
                    <Row
                      key={`${e.kind}-${e.at}-${i}`}
                      title={e.kind === "signup" ? t("Signed up through your link") : t("Commission")}
                      sub={e.who}
                      meta={e.at}
                      side={e.amountCents ? `+${formatCents(e.amountCents)}` : undefined}
                      sign={e.amountCents ? "up" : undefined}
                      tint={e.kind === "commission" ? "green" : undefined}
                    />
                  ))}
                </Rows>
              </Section>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
                <Link className="btn" href="/sign-in?next=/earn">
                  {t("Get your link")}
                </Link>
                <Link className="btn btn-ghost" href="/explore">
                  {t("See what you would be recommending")}
                </Link>
                <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
                  {fill(t("free · <0/>% of every payment · <1/>-day window"), [
                    REFERRAL_PERCENT,
                    REFERRAL_DAYS,
                  ])}
                </span>
              </div>

              {/* What the page above looks like once you are in. The same
                  terminal the rest of the site uses to show real output —
                  a fake browser chrome would be pretending to be a product
                  screenshot, and this is honestly a worked example. */}
              <div className="term" style={{ marginTop: "2rem" }} aria-label={t("What the page shows once you have a link")}>
                <div className="term-bar">
                  <span className="term-dot" />
                  <span className="term-dot" />
                  <span className="term-dot" />
                  <span style={{ marginLeft: ".5rem" }}>{t("your link, once you are signed in")}</span>
                </div>
                <div>
                  {markup(t("<0>$</0> open mozg.sh/r/yourname"), [<span className="c" key="s0" />])}
                </div>
                <div className="t">{fill(t("✓ counted · the claim is held for <0/> days"), [REFERRAL_DAYS])}</div>
                <div style={{ height: ".9rem" }} />
                <div>{t("they sign up          → shows on your page the same day")}</div>
                <div>
                  {fill(t("they buy Pro          → +<0/> on your balance, that second"), [
                    formatCents(perPro),
                  ])}
                </div>
                <div>
                  {fill(t("thirty days later     → +<0/> again, because they renewed"), [
                    formatCents(perPro),
                  ])}
                </div>
                <div>{t("they cancel           → it stops. Nothing is clawed back.")}</div>
                <div style={{ height: ".9rem" }} />
                <div className="c">
                  {fill(t("→ withdraw from Balance from <0/> up, crypto, paid by hand"), [
                    formatCents(MIN_PAYOUT_CENTS),
                  ])}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── why ─────────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <p className="eyebrow">{t("Why this one is easy to recommend")}</p>
          <h2 className="h1" style={{ margin: ".6rem 0 1.5rem", maxWidth: "22ch" }}>
            {t("You are not selling. You are answering.")}
          </h2>

          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {WHY.map((w) => (
              <div key={w.title} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
                <p className="eyebrow" style={{ margin: 0, color: `var(--color-riso-${w.tint})` }}>
                  {t(w.field)}
                </p>
                <h3 className="h3" style={{ margin: ".4rem 0 .5rem" }}>
                  {t(w.title)}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{t(w.body)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── calculator ──────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("What could you take home?")}</h2>
            <span className="eyebrow">{fill(t("<0/>% of the real price"), [REFERRAL_PERCENT])}</span>
          </div>
          <p className="lede">
            {t("Pick the plan the people you know would actually buy, then say how many of them stay subscribed. Nothing here is rounded up.")}
          </p>
          <Calculator
            plans={[
              { key: "pro", label: msg("Pro"), priceCents: PLAN_PRICE_CENTS.pro },
              { key: "team", label: msg("Team"), priceCents: PLAN_PRICE_CENTS.team },
            ]}
          />
        </section>

        {/* ── steps ───────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <p className="eyebrow">{t("Three steps, and the first one is done")}</p>
          <h2 className="h1" style={{ margin: ".6rem 0 1.5rem", maxWidth: "20ch" }}>
            {t("There is no application.")}
          </h2>
          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {STEPS.map((s) => (
              <div key={s.n} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
                <span
                  className="display"
                  style={{ fontSize: "2rem", color: "var(--color-riso-red)", display: "block" }}
                >
                  {s.n}
                </span>
                <h3 className="h3" style={{ margin: ".5rem 0 .5rem" }}>
                  {t(s.title)}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{t(s.body)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── who ─────────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("Built for people who are already trusted")}</h2>
            <span className="eyebrow">{t("no audience size required")}</span>
          </div>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            {FOR.map((f) => (
              <span
                key={f.who}
                className="panel"
                style={{ padding: ".7rem .9rem", display: "inline-block" }}
              >
                <strong style={{ fontSize: ".9375rem" }}>{t(f.who)}</strong>
                <span
                  className="mono"
                  style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}
                >
                  {t(f.note)}
                </span>
              </span>
            ))}
          </div>
        </section>

        {/* ── faq ─────────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            {t("The awkward questions, answered first")}
          </h2>
          <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)" }}>
            <Faq
              q={t("How much, exactly?")}
              a={fill(t("<0/>% of every plan payment, forever. Pro is $25 a month, so you get <1/> a month. Team is $79, so you get <2/>. A founding account pays half price and you get half the commission — you are paid a share of what was actually charged, never of a list price nobody paid."), [
                REFERRAL_PERCENT,
                formatCents(perPro),
                formatCents(perTeam),
              ])}
            />
            <Faq
              q={t("When does it stop?")}
              a={t("When they stop paying. There is no expiry on the referral itself, no cap on how many months it pays and no cap on how many people you bring. A plan here is a 30-day purchase rather than a subscription, so every month they choose again — and every month they choose, you are paid again.")}
            />
            <Faq
              q={t("How long is the window?")}
              a={fill(t("<0/> days from the moment somebody opens your link. First touch wins: if they arrive through two different links, the first one keeps the credit, because the person who did the convincing is rarely the last one to be clicked."), [
                REFERRAL_DAYS,
              ])}
            />
            <Faq
              q={t("How am I paid?")}
              a={fill(t("Onto your mozg balance, in the same second they pay, with a ledger row you can read. From there it is the ordinary payout queue: crypto, from <0/> up, sent by hand — usually the same day. You can also just spend it here, on a plan or on brains."), [
                formatCents(MIN_PAYOUT_CENTS),
              ])}
            />
            <Faq
              q={t("Can I refer myself?")}
              a={t("No. A link pointing at the account that owns it credits nobody, and that is checked when the account is created rather than argued about later. Second accounts to farm the commission are the one thing that gets a balance frozen.")}
            />
            <Faq
              q={t("What am I actually recommending?")}
              a={t("A brain: notes an agent searches over MCP instead of guessing. Everything readable is free — the catalogue, connecting an agent, teaching one from the CLI subscription somebody already pays for. A plan buys one thing, our models doing the reading for them. That is the honest version, and it is the version that converts.")}
            />
            <Faq
              q={t("Do I need to be a customer?")}
              a={t("No. An account is all it takes, and an account is free. If you do sell a brain here, the two stack: buyers who arrive through your link pay you for the brain and pay you again on every plan they later buy.")}
            />
          </div>
        </section>

        {/* ── close ───────────────────────────────────────────────────── */}
        <section
          style={{
            marginTop: "clamp(3.5rem, 9vw, 5.5rem)",
            border: "1.5px solid var(--ink)",
            background: "var(--color-riso-yellow)",
            boxShadow: "6px 6px 0 var(--ink)",
            padding: "clamp(1.5rem, 4vw, 2.5rem)",
          }}
        >
          <h2 className="h1" style={{ maxWidth: "18ch" }}>
            {t("Every agent your network runs is guessing right now.")}
          </h2>
          <p style={{ maxWidth: "52ch", margin: "1rem 0 1.5rem", fontSize: "1.0625rem" }}>
            {t("Tell them about the thing that fixes it, and take a fifth of what they pay for as long as they keep paying it.")}
          </p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
            <Link className="btn" href={mine ? "/settings/balance" : "/sign-in?next=/earn"}>
              {mine ? t("Open your balance") : t("Get your link")}
            </Link>
            <Link className="btn btn-ghost" href="/pricing">
              {t("What they would be buying")}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/** One question. A <details>, so it works with no JavaScript and the browser's
    own find-in-page can open it. */
function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="earn-faq" style={{ borderBottom: "1px solid var(--rule)" }}>
      <summary style={{ cursor: "pointer", padding: "1rem 1.25rem", fontWeight: 600 }}>
        {q}
      </summary>
      <p style={{ color: "var(--ink-2)", margin: 0, padding: "0 1.25rem 1.25rem", maxWidth: "68ch" }}>
        {a}
      </p>
    </details>
  );
}
