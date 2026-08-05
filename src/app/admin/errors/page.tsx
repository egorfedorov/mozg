import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AutoRefresh from "@/components/AutoRefresh";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { Section } from "@/components/ui";
import { resolveErrors } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Errors — mozg admin" };

/**
 * The error center: every layer's failures on one page, grouped the way
 * triage actually works — by what broke, not by when. Resolving a group is
 * acknowledgement; the rows stay for postmortems. Container logs die with
 * every deploy — this page is what survives them.
 */
export default async function AdminErrorsPage() {
  await requireAdmin().catch(() => redirect("/"));

  const groups = await query<{
    source: string;
    kind: string;
    n: number;
    latest: string;
    last_message: string;
  }>(
    `select source, kind, count(*)::int as n,
            to_char(max(created_at) at time zone 'UTC', 'MM-DD HH24:MI') as latest,
            (select message from app_errors e2
              where e2.source = e.source and e2.kind = e.kind and e2.resolved_at is null
              order by created_at desc limit 1) as last_message
       from app_errors e
      where resolved_at is null
      group by source, kind
      order by max(created_at) desc`,
  );

  const rows = await query<{
    source: string;
    kind: string;
    message: string;
    detail: string | null;
    email: string | null;
    at: string;
  }>(
    `select e.source, e.kind, e.message, e.detail, u.email,
            to_char(e.created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
       from app_errors e left join "user" u on u.id = e.user_id
      where e.resolved_at is null
      order by e.created_at desc limit 200`,
  );
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.source}/${r.kind}`;
    byGroup.set(k, [...(byGroup.get(k) ?? []), r]);
  }

  // The MCP lane keeps its reasons on the metering rows — show the recent
  // ones here too, so "24 failed" never again needs latency forensics.
  const failedCalls = await query<{
    tool: string;
    error: string | null;
    email: string | null;
    at: string;
  }>(
    `select c.tool, c.error, u.email,
            to_char(c.created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
       from calls c left join "user" u on u.id = c.caller_id
      where not c.ok and c.created_at > now() - interval '24 hours'
      order by c.created_at desc limit 30`,
  );

  return (
    <AppShell active="/admin/errors" eyebrow="Operator" title="Errors">
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        {groups.reduce((n, g) => n + g.n, 0)} open across {groups.length} kind
        {groups.length === 1 ? "" : "s"}. Resolving acknowledges — rows stay
        for postmortems.{" "}
        <AutoRefresh active intervalMs={30_000} label="live" />
      </p>

      {groups.length > 0 && (
        <form action={resolveErrors} style={{ marginBottom: "1rem" }}>
          <input type="hidden" name="source" value="*" />
          <button className="btn btn-ghost" style={{ padding: ".4rem .8rem" }}>
            Resolve everything
          </button>
        </form>
      )}

      {groups.length === 0 && (
        <p className="lede">Nothing open. The next failure from any layer lands here.</p>
      )}

      {groups.map((g) => (
        <details
          key={`${g.source}/${g.kind}`}
          style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", marginBottom: "1rem" }}
        >
          <summary style={{ padding: ".7rem 1rem", cursor: "pointer", display: "flex", gap: "1rem", alignItems: "baseline" }}>
            <strong className="mono">
              {g.source}/{g.kind}
            </strong>
            <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)" }}>
              {g.n}
            </span>
            <span style={{ fontSize: ".875rem", color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
              {g.last_message}
            </span>
            <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", flexShrink: 0 }}>
              {g.latest}
            </span>
          </summary>
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {(byGroup.get(`${g.source}/${g.kind}`) ?? []).slice(0, 10).map((r, i) => (
              <div key={i} style={{ padding: ".6rem 1rem", borderBottom: "1px solid var(--rule)" }}>
                <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: "0 0 .2rem" }}>
                  {r.at}
                  {r.email ? ` · ${r.email}` : ""}
                </p>
                <p style={{ margin: 0, fontSize: ".9375rem" }}>{r.message}</p>
                {r.detail && (
                  <pre className="mono" style={{ margin: ".4rem 0 0", fontSize: ".6875rem", color: "var(--ink-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "10rem", overflow: "auto" }}>
                    {r.detail}
                  </pre>
                )}
              </div>
            ))}
            <form action={resolveErrors} style={{ padding: ".7rem 1rem" }}>
              <input type="hidden" name="source" value={g.source} />
              <input type="hidden" name="kind" value={g.kind} />
              <button className="btn" style={{ padding: ".35rem .8rem" }}>
                Resolve {g.n}
              </button>
            </form>
          </div>
        </details>
      ))}

      <Section title="Failed MCP calls · 24h" aside="reasons ride on the metering rows">
        {failedCalls.length === 0 ? (
          <p className="lede">None. Agents are getting answers.</p>
        ) : (
          <div className="rows">
            {failedCalls.map((c, i) => (
              <div key={i} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong className="mono" style={{ fontSize: ".875rem" }}>{c.tool}</strong>
                  <span className="row-sub">{c.error ?? "no reason recorded (pre-0065 row)"}</span>
                  <span className="row-meta">
                    {c.at}
                    {c.email ? ` · ${c.email}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </AppShell>
  );
}
