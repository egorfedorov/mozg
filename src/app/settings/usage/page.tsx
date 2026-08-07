import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Chip, Row, Rows, Section, Stat, Stats } from "@/components/ui";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { limitsFor } from "@/lib/plans";
import { billingFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Usage — mozg" };

/**
 * What your agents actually did with the tokens on the page next door.
 *
 * The tokens page could say how many calls were left this month and nothing
 * about where they went — so a quota running out was a surprise with no
 * explanation attached. Every MCP call already lands in `calls` with its tool,
 * its brain, its query and how it went; this reads that back.
 *
 * There is no money column, and that is not an omission: mozg meters MCP in
 * calls, not tokens, and the inference spend recorded in `spend` is the
 * platform's own cost with no per-caller attribution. A dollar figure here
 * would have to be invented, and an invented number on a usage page is worse
 * than no number.
 *
 * On a studio seat this shows the studio's month, not the reader's slice of it:
 * calls are billed to the account that pays (see 0073), and a page that showed
 * a colleague only their own calls would not add up to the number the quota
 * actually enforces.
 *
 * Server-rendered, no chart library: the bars are divs, the range filter is a
 * link, so the whole page is a URL you can send someone.
 */

const RANGES = {
  "24h": { label: "24 hours", span: "24 hours", unit: "hour", ticks: 24 },
  "7d": { label: "7 days", span: "7 days", unit: "day", ticks: 7 },
  "30d": { label: "30 days", span: "30 days", unit: "day", ticks: 30 },
} as const;

type RangeKey = keyof typeof RANGES;

function isRange(v: string | undefined): v is RangeKey {
  return v === "24h" || v === "7d" || v === "30d";
}

/** Buckets come back only where something happened; a chart with the quiet
 *  days missing reads as busier than the week actually was. */
function fill(
  rows: { bucket: Date; n: number }[],
  { unit, ticks }: { unit: "hour" | "day"; ticks: number },
): { at: Date; n: number }[] {
  const step = unit === "hour" ? 3_600_000 : 86_400_000;
  const seen = new Map(rows.map((r) => [new Date(r.bucket).getTime(), r.n]));
  const last = Math.floor(Date.now() / step) * step;
  return Array.from({ length: ticks }, (_, i) => {
    const at = new Date(last - (ticks - 1 - i) * step);
    return { at, n: seen.get(at.getTime()) ?? 0 };
  });
}

function tick(at: Date, unit: "hour" | "day"): string {
  return unit === "hour"
    ? `${String(at.getUTCHours()).padStart(2, "0")}:00`
    : at.toISOString().slice(5, 10);
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/usage");

  const { range: asked } = await searchParams;
  const key: RangeKey = isRange(asked) ? asked : "7d";
  const range = RANGES[key];

  // Everything below is scoped to the account being billed, which is the
  // reader themselves unless they hold a studio seat.
  const billing = await billingFor(user.id, user.plan, user.paidUntil);

  const [buckets, totals, tools, brains, recent, month] = await Promise.all([
    query<{ bucket: Date; n: number }>(
      `select date_trunc($2, created_at) as bucket, count(*)::int as n
         from calls
        where billed_to = $1 and created_at >= now() - $3::interval
        group by 1 order by 1`,
      [billing.id, range.unit, range.span],
    ),
    query<{
      calls: number;
      failed: number;
      brains: number;
      empty: number;
      median_ms: number | null;
    }>(
      `select count(*)::int as calls,
              count(*) filter (where not ok)::int as failed,
              count(distinct brain_id)::int as brains,
              count(*) filter (where tool = 'brain_search' and results = 0)::int as empty,
              percentile_disc(0.5) within group (order by latency_ms)::int as median_ms
         from calls
        where billed_to = $1 and created_at >= now() - $2::interval`,
      [billing.id, range.span],
    ).then((r) => r[0]),
    query<{ tool: string; n: number; median_ms: number | null }>(
      `select tool, count(*)::int as n,
              percentile_disc(0.5) within group (order by latency_ms)::int as median_ms
         from calls
        where billed_to = $1 and created_at >= now() - $2::interval
        group by 1 order by 2 desc`,
      [billing.id, range.span],
    ),
    query<{ slug: string; title: string; handle: string | null; n: number; failed: number }>(
      `select b.slug, b.title, u.handle, count(*)::int as n,
              count(*) filter (where not c.ok)::int as failed
         from calls c
         join brains b on b.id = c.brain_id
         left join "user" u on u.id = b.owner_id
        where c.billed_to = $1 and c.created_at >= now() - $2::interval
        group by 1, 2, 3 order by 4 desc limit 12`,
      [billing.id, range.span],
    ),
    query<{
      created_at: Date;
      tool: string;
      query: string | null;
      results: number | null;
      latency_ms: number | null;
      ok: boolean;
      error: string | null;
      slug: string | null;
    }>(
      `select c.created_at, c.tool, c.query, c.results, c.latency_ms, c.ok, c.error, b.slug
         from calls c
         left join brains b on b.id = c.brain_id
        where c.billed_to = $1 and c.created_at >= now() - $2::interval
        order by c.created_at desc limit 40`,
      [billing.id, range.span],
    ),
    query<{ n: number }>(
      `select count(*)::int as n from calls
        where billed_to = $1 and created_at >= date_trunc('month', now())`,
      [billing.id],
    ).then((r) => r[0]?.n ?? 0),
  ]);

  const series = fill(buckets, range);
  const peak = Math.max(1, ...series.map((s) => s.n));
  const limit = limitsFor(billing.plan).calls;

  return (
    <AppShell
      active="/settings/usage"
      eyebrow={
        `${month} of ${limit.toLocaleString("en-US")} calls this month on ${billing.plan}` +
        (billing.shared ? " — your studio's shared allowance" : "")
      }
      title="Usage"
      narrow
    >
      <div className="stack">
        <div>
          <p className="lede">
            {billing.shared
              ? "Every MCP call your studio made — yours and your colleagues' — with the tool, the brain, and whether it found anything. One allowance, shared."
              : "Every MCP call your tokens made — when, which tool, which brain, and whether it found anything."}{" "}
            Metering is by call, not by token, so there is no bill to read here:
            the number that runs out is the one in the corner above.
          </p>
          <div className="chips">
            {(Object.keys(RANGES) as RangeKey[]).map((r) => (
              <Chip key={r} href={`/settings/usage?range=${r}`} on={r === key}>
                {RANGES[r].label}
              </Chip>
            ))}
          </div>
        </div>

        <Stats>
          <Stat label="Calls" value={String(totals?.calls ?? 0)} big />
          <Stat label="Brains touched" value={String(totals?.brains ?? 0)} />
          <Stat
            label="Empty searches"
            value={String(totals?.empty ?? 0)}
            note="became exam questions"
          />
          <Stat
            label="Median latency"
            value={totals?.median_ms != null ? `${totals.median_ms} ms` : "—"}
          />
          <Stat
            label="Failed"
            value={String(totals?.failed ?? 0)}
            dot={totals?.failed ? "down" : "ok"}
          />
        </Stats>

        <Section title="When" aside={`peak ${peak} · UTC`}>
          <div className="usage-chart" role="img" aria-label={`Calls per ${range.unit}`}>
            {series.map((s) => (
              <div
                className="usage-col"
                key={s.at.toISOString()}
                title={`${tick(s.at, range.unit)} — ${s.n} call${s.n === 1 ? "" : "s"}`}
              >
                <div className="usage-bar" style={{ height: `${(s.n / peak) * 100}%` }} />
                <span className="usage-tick">{tick(s.at, range.unit)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="What" aside={`${tools.length} tool${tools.length === 1 ? "" : "s"}`}>
          <Rows empty="No calls in this window. Connect an agent and ask it something that needs a brain.">
            {tools.map((t) => (
              <Row
                key={t.tool}
                title={t.tool}
                meta={t.median_ms != null ? `${t.median_ms} ms median` : undefined}
                side={String(t.n)}
              />
            ))}
          </Rows>
        </Section>

        <Section title="Which brains">
          <Rows empty="Nothing reached a brain in this window.">
            {brains.map((b) => (
              <Row
                key={`${b.handle}/${b.slug}`}
                title={b.title}
                meta={b.failed > 0 ? `${b.failed} failed` : undefined}
                side={String(b.n)}
                href={b.handle ? `/b/${b.handle}/${b.slug}` : undefined}
              />
            ))}
          </Rows>
        </Section>

        <Section title="Recent calls" aside="newest first">
          <Rows empty="Nothing yet.">
            {recent.map((c, i) => (
              <Row
                key={`${c.created_at}-${i}`}
                title={c.tool}
                sub={c.query ?? undefined}
                meta={[
                  new Date(c.created_at).toISOString().slice(0, 16).replace("T", " "),
                  c.slug,
                  c.results !== null ? `${c.results} notes` : null,
                  c.latency_ms !== null ? `${c.latency_ms} ms` : null,
                  c.ok ? null : (c.error ?? "failed"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                tint={c.ok ? undefined : "red"}
              />
            ))}
          </Rows>
        </Section>
      </div>
    </AppShell>
  );
}
