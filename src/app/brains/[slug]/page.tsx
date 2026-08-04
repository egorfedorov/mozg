import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import ConfirmForm from "@/components/ConfirmForm";
import ConnectBox from "@/components/ConnectBox";
import Dropzone from "@/components/Dropzone";
import AddUrls from "@/components/AddUrls";
import GoalEditor from "@/components/GoalEditor";
import CallLog from "@/components/CallLog";
import AutoRefresh from "@/components/AutoRefresh";
import { approveNote, rejectNote } from "./review-actions";
import { runExamNow, addCheck, removeCheck } from "./exam-actions";
import { retrySource, deleteSource, waiveScan } from "./source-actions";
import { maybeOne, query } from "@/db";
import type { Brain, Note, Source } from "@/db/types";
import { currentUser } from "@/lib/session";
import { categoryScores, tintFor } from "@/lib/brains";

const LICENSE_LABEL: Record<string, string> = {
  nc: "CC BY-NC-SA 4.0 · no resale",
  mit: "MIT · resale allowed",
  proprietary: "Closed · MCP access only",
};

const STATE_SIGIL = { pass: "✓", partial: "▲", fail: "✕", empty: "·" } as const;

/** The tab says which brain you are in — a workspace of five tabs needs it. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await currentUser();
  if (!user) return { title: "mozg" };
  const brain = await maybeOne<Pick<Brain, "title">>(
    `select title from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  return { title: brain ? `${brain.title} — mozg` : "mozg" };
}

export default async function BrainPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) notFound();

  const [categories, sources, pending, tokenCount, lastRun, recentCalls, history, manualChecks] =
    await Promise.all([
    categoryScores([brain.id]).then((m) => m.get(brain.id) ?? []),
    query<Source>(
      `select * from sources where brain_id = $1 order by created_at desc limit 50`,
      [brain.id],
    ),
    query<Note>(
      `select * from notes where brain_id = $1 and status = 'pending'
        order by created_at desc`,
      [brain.id],
    ),
    query<{ n: number }>(
      `select count(*)::int as n from mcp_tokens
        where user_id = $1 and revoked_at is null`,
      [user.id],
    ).then((r) => r[0]?.n ?? 0),
    query<{ status: string; error: string | null; started_at: Date }>(
      `select status, error, started_at from check_runs
        where brain_id = $1 order by started_at desc limit 1`,
      [brain.id],
    ).then((r) => r[0] ?? null),
    query<{
      id: string;
      tool: string;
      query: string | null;
      results: number | null;
      latency_ms: number | null;
      ok: boolean;
      created_at: string;
    }>(
      `select id::text, tool, query, results, latency_ms, ok,
              to_char(created_at at time zone 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
         from calls where brain_id = $1 order by id desc limit 12`,
      [brain.id],
    ).then((r) => r.reverse()),
    query<{ score: number }>(
      `select score from (
         select score, started_at from check_runs
          where brain_id = $1 and status = 'done' and score is not null
          order by started_at desc limit 16
       ) t order by started_at`,
      [brain.id],
    ),
    query<{ id: string; question: string; expect: string }>(
      `select id, question, expect from checks
        where brain_id = $1 and origin = 'manual' and enabled
        order by created_at`,
      [brain.id],
    ),
  ]);

  const totalChecks = categories.reduce((n, c) => n + c.total, 0);
  const inFlight = sources.filter(
    (s) => s.status === "queued" || s.status === "processing",
  ).length;
  const readSources = sources.filter((s) => s.status === "ready").length;
  const discovering = sources.some(
    (s) => s.kind === "site" && (s.status === "queued" || s.status === "processing"),
  );

  return (
    <AppShell active="/brains">
        <Link className="eyebrow" href="/brains">
          ← brains
        </Link>

        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "flex-start",
            flexWrap: "wrap",
            margin: "1rem 0 2.5rem",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              border: "1.5px solid var(--ink)",
              background: `var(--color-riso-${tintFor(brain)})`,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 className="h1">
              {brain.title}
            </h1>
            <GoalEditor slug={brain.slug} goal={brain.goal} />
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
              {brain.note_count} notes · {brain.source_count} sources ·{" "}
              {LICENSE_LABEL[brain.license]}
            </p>
            <p style={{ marginTop: ".75rem", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
              <Link className="navlink" href={`/brains/${brain.slug}/notes`}>
                browse notes →
              </Link>
              <Link className="navlink" href={`/brains/${brain.slug}/share`}>
                sharing &amp; export →
              </Link>
            </p>
          </div>
        </div>

        {/* The show while a crawl or upload is being read. Sources further
            down auto-refresh the page, so these numbers move on their own. */}
        {inFlight > 0 && (
          <div className="panel" style={{ marginBottom: "1.5rem" }}>
            <p className="eyebrow" style={{ marginBottom: ".4rem" }}>
              {discovering ? "Discovering and reading pages…" : "Learning…"}
            </p>
            <div
              aria-hidden
              style={{ height: 8, border: "1.5px solid var(--ink)", background: "var(--paper)" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round((readSources / Math.max(1, readSources + inFlight)) * 100)}%`,
                  background: `var(--color-riso-${tintFor(brain)})`,
                  transition: "width .6s",
                }}
              />
            </div>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              {readSources} read · {inFlight} to go · {brain.note_count} notes so far
              {brain.goal
                ? " — the exam re-runs by itself when this finishes"
                : " — a goal is being drafted from the material"}
            </p>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
            alignItems: "start",
          }}
        >
          <ConnectBox slug={brain.slug} hasToken={tokenCount > 0} />

          <section className="scorecard">
            <div className="score-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                  Exam
                </p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                  {totalChecks
                    ? `${totalChecks} checks · ${categories.length} categories`
                    : "not generated yet"}
                </span>
              </div>
              {brain.score !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                  <ScoreSpark history={history.map((h) => h.score)} />
                  <div className="score-big">
                    {brain.score}
                    <sup>%</sup>
                  </div>
                </div>
              )}
            </div>

            {categories.length === 0 ? (
              <div style={{ padding: "1.25rem" }}>
                <p style={{ margin: "0 0 1rem", color: "var(--ink-2)" }}>
                  {brain.goal
                    ? "Upload the first sources — the exam is generated once there is something to test."
                    : "Set a goal to unlock the exam. Without one there is nothing to measure against."}
                </p>
              </div>
            ) : (
              categories.map((c) => (
                <div key={c.category} className="score-row" data-state={c.state}>
                  <span className="sig">{STATE_SIGIL[c.state]}</span>
                  <span>
                    {c.category}
                    {c.gap && <span className="score-gap">missing · {c.gap}</span>}
                  </span>
                  <span className="count">
                    {c.passed} / {c.total}
                  </span>
                </div>
              ))
            )}

            {brain.goal && (
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderTop: "1.5px solid var(--ink)",
                  display: "flex",
                  gap: ".5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {lastRun?.status === "running" ? (
                  <AutoRefresh
                    active
                    intervalMs={4000}
                    label={`Exam running — started ${new Date(
                      lastRun.started_at,
                    ).toLocaleTimeString()}`}
                  />
                ) : (
                  <>
                    <form action={runExamNow}>
                      <input type="hidden" name="slug" value={brain.slug} />
                      <button className="btn" style={{ padding: ".45rem .9rem" }}>
                        {categories.length ? "Re-sit exam" : "Generate exam"}
                      </button>
                    </form>
                    {categories.length > 0 && (
                      <form action={runExamNow}>
                        <input type="hidden" name="slug" value={brain.slug} />
                        <input type="hidden" name="regenerate" value="1" />
                        <button
                          className="btn btn-ghost"
                          style={{ padding: ".45rem .9rem" }}
                          title="Throw away the current checks and write new ones from the goal"
                        >
                          New questions
                        </button>
                      </form>
                    )}
                  </>
                )}
                {lastRun?.status === "failed" && (
                  <span
                    className="mono"
                    style={{ fontSize: ".75rem", color: "var(--color-riso-red)", flexBasis: "100%" }}
                  >
                    Last run failed: {lastRun.error?.slice(0, 120)}
                  </span>
                )}
              </div>
            )}

            {brain.goal && (
              <details style={{ borderTop: "1.5px solid var(--ink)", padding: "1rem 1.25rem" }}>
                <summary className="mono" style={{ fontSize: ".8125rem", cursor: "pointer" }}>
                  Your own checks ({manualChecks.length}) — things this brain must know
                </summary>

                {manualChecks.map((c) => (
                  <div
                    key={c.id}
                    style={{ display: "flex", gap: ".75rem", alignItems: "baseline", margin: ".75rem 0 0" }}
                  >
                    <span style={{ flex: 1, fontSize: ".875rem" }}>
                      {c.question}
                      <span className="mono" style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}>
                        expects: {c.expect}
                      </span>
                    </span>
                    <form action={removeCheck}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="slug" value={brain.slug} />
                      <button className="mono" style={linkButton}>
                        remove
                      </button>
                    </form>
                  </div>
                ))}

                {/* Survives goal rewrites, unlike generated checks — this is
                    the owner saying what matters in their own words. */}
                <form action={addCheck} style={{ display: "grid", gap: ".5rem", marginTop: "1rem" }}>
                  <input type="hidden" name="slug" value={brain.slug} />
                  <input
                    name="question"
                    required
                    maxLength={500}
                    placeholder="What would you ask it? e.g. What does the play endpoint return on insufficient balance?"
                    style={checkInput}
                  />
                  <input
                    name="expect"
                    required
                    maxLength={500}
                    placeholder="What must a correct answer contain? e.g. HTTP 400 with code ERR_IS"
                    style={checkInput}
                  />
                  <button className="btn btn-ghost" style={{ padding: ".4rem .8rem", justifySelf: "start" }}>
                    Add check — graded on the next run
                  </button>
                </form>
              </details>
            )}
          </section>
        </div>

        <section style={{ marginTop: "2rem" }}>
          <CallLog brainId={brain.id} recent={recentCalls} />
        </section>

        {pending.length > 0 && (
          <section style={{ marginTop: "3rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "1rem",
              }}
            >
              <h2 className="h2">
                Written by agents
              </h2>
              <span className="eyebrow">{pending.length} waiting</span>
            </div>
            <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "62ch" }}>
              These were saved by an agent mid-task. They stay out of search until
              you approve them — that is what keeps the brain sharp instead of noisy.
            </p>

            <div className="panel" style={{ padding: 0 }}>
              {pending.map((note) => (
                <div
                  key={note.id}
                  style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--rule)" }}
                >
                  <div style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
                    <strong style={{ flex: 1 }}>{note.title}</strong>
                    <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
                      {note.agent_client ?? "agent"} · {note.kind}
                    </span>
                  </div>
                  <p style={{ margin: ".4rem 0 .75rem", color: "var(--ink-2)", fontSize: ".9375rem" }}>
                    {note.body}
                  </p>
                  <div style={{ display: "flex", gap: ".5rem" }}>
                    <form action={approveNote}>
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="slug" value={brain.slug} />
                      <button className="btn" style={{ padding: ".4rem .8rem" }}>
                        Approve
                      </button>
                    </form>
                    <form action={rejectNote}>
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="slug" value={brain.slug} />
                      <button className="btn btn-ghost" style={{ padding: ".4rem .8rem" }}>
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: "3rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "1rem",
            }}
          >
            <h2 className="h2">
              Sources
            </h2>
            <span style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <AutoRefresh
                active={inFlight > 0}
                label={`${inFlight} processing`}
              />
              <span className="eyebrow">{sources.length} shown</span>
            </span>
          </div>

          <div style={{ marginBottom: "1.25rem", display: "grid", gap: ".75rem" }}>
            <Dropzone brainId={brain.id} />
            <AddUrls slug={brain.slug} />
          </div>

          {sources.length === 0 ? (
            <div className="panel">
              <p style={{ margin: 0, color: "var(--ink-2)" }}>
                Nothing uploaded yet. Drop screenshots above, or run{" "}
                <code className="mono">npm run ingest -- --brain {brain.slug} ./shots/*.png</code>
              </p>
            </div>
          ) : (
            <div className="panel" style={{ padding: 0 }}>
              {sources.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "1rem",
                    alignItems: "baseline",
                    padding: ".7rem 1.25rem",
                    borderBottom: "1px solid var(--rule)",
                    fontSize: ".9375rem",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.original_name ?? s.url ?? s.id.slice(0, 8)}
                    {s.status === "rejected" && (
                      <span className="score-gap" style={{ color: "var(--color-riso-red)" }}>
                        rejected · looks like{" "}
                        {(s.findings ?? []).map((f) => f.label).join(", ") || "a secret"}
                        {s.findings?.[0]?.sample ? (
                          <span className="mono" style={{ display: "block", fontSize: ".6875rem" }}>
                            {s.findings.slice(0, 3).map((f) => f.sample).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    )}
                    {s.status === "failed" && (
                      <span className="score-gap" style={{ color: "var(--color-riso-red)" }}>
                        {s.error?.slice(0, 120)}
                      </span>
                    )}
                  </span>
                  <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                    {s.note_count} notes
                  </span>
                  <span style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                    {(s.status === "failed" || s.status === "rejected") && (
                      <form action={retrySource}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="slug" value={brain.slug} />
                        <button className="mono" style={linkButton}>
                          retry
                        </button>
                      </form>
                    )}
                    {s.status === "rejected" && (
                      <ConfirmForm
                        action={waiveScan}
                        message={
                          "Let this source through the secret scanner? Do this only " +
                          "if the findings above are documentation examples, not real " +
                          "credentials — the notes will become searchable."
                        }
                      >
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="slug" value={brain.slug} />
                        <button className="mono" style={linkButton}>
                          it&apos;s an example — allow
                        </button>
                      </ConfirmForm>
                    )}
                    <ConfirmForm
                      action={deleteSource}
                      message={`Remove "${s.original_name ?? s.url ?? "this source"}"? Its notes are deleted with it.`}
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="slug" value={brain.slug} />
                      <button
                        className="mono"
                        style={{ ...linkButton, color: "var(--color-riso-red)" }}
                      >
                        remove
                      </button>
                    </ConfirmForm>
                    <StatusTag status={s.status} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </AppShell>
  );
}

/**
 * The score's shape over the last runs — a climb, a plateau, a regression.
 * Server-rendered SVG; sixteen points do not need a chart library.
 */
function ScoreSpark({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const w = 96;
  const h = 28;
  const step = w / (history.length - 1);
  const points = history
    .map((s, i) => `${(i * step).toFixed(1)},${(h - 2 - (s / 100) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: "visible" }}
      aria-label={`Score over the last ${history.length} runs`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--ink-2)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle
        cx={w}
        cy={h - 2 - (history[history.length - 1] / 100) * (h - 4)}
        r="2.5"
        fill="var(--ink)"
      />
    </svg>
  );
}

const checkInput: React.CSSProperties = {
  width: "100%",
  padding: ".55rem .7rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper)",
  font: "inherit",
  fontSize: ".875rem",
};

const linkButton: React.CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  color: "var(--ink-2)",
  fontSize: ".6875rem",
  cursor: "pointer",
  textDecoration: "underline",
};

function StatusTag({ status }: { status: Source["status"] }) {
  const color =
    status === "ready"
      ? "var(--color-riso-green)"
      : status === "rejected" || status === "failed"
        ? "var(--color-riso-red)"
        : "var(--ink-2)";
  return (
    <span className="tag" style={{ color }}>
      {status}
    </span>
  );
}
