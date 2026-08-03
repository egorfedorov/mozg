import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { maybeOne, query } from "@/db";
import type { Brain, Note } from "@/db/types";
import { currentUser } from "@/lib/session";
import { deleteNote } from "./actions";

/**
 * What is actually in the brain. Without this the brain is a black box: the
 * exam says a category is weak and there is no way to look at what it holds.
 */

const KIND_TINT: Record<string, string> = {
  fact: "var(--ink-2)",
  rule: "var(--color-riso-blue)",
  layout: "var(--color-riso-violet)",
  example: "var(--color-riso-green)",
  pitfall: "var(--color-riso-red)",
};

export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { slug } = await params;
  const { q, category } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) notFound();

  const term = q?.trim() ?? "";

  const [notes, categories] = await Promise.all([
    query<Note & { source_name: string | null }>(
      `select n.*, s.original_name as source_name
         from notes n
         left join sources s on s.id = n.source_id
        where n.brain_id = $1
          and n.status in ('active', 'pending')
          and ($2 = '' or n.title ilike '%' || $2 || '%' or n.body ilike '%' || $2 || '%')
          and ($3::text is null or n.category = $3)
        order by n.status desc, n.created_at desc
        limit 200`,
      [brain.id, term, category ?? null],
    ),
    query<{ category: string; n: number }>(
      `select coalesce(category, 'uncategorised') as category, count(*)::int as n
         from notes where brain_id = $1 and status = 'active'
        group by 1 order by 2 desc`,
      [brain.id],
    ),
  ]);

  return (
    <>
      <TopBar active="brains" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <Link className="eyebrow" href={`/brains/${brain.slug}`}>
          ← {brain.title}
        </Link>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "1rem",
            flexWrap: "wrap",
            margin: ".75rem 0 1.5rem",
          }}
        >
          <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
            Notes
          </h1>
          <span className="eyebrow">
            {notes.length}
            {notes.length === 200 ? "+" : ""} shown · {brain.note_count} active
          </span>
        </div>

        <form style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <input
            name="q"
            defaultValue={term}
            placeholder="Search titles and bodies"
            style={{
              flex: 1,
              minWidth: 240,
              padding: ".7rem .85rem",
              border: "1.5px solid var(--ink)",
              background: "var(--paper-2)",
              font: "inherit",
            }}
          />
          <select
            name="category"
            defaultValue={category ?? ""}
            style={{
              padding: ".7rem .85rem",
              border: "1.5px solid var(--ink)",
              background: "var(--paper-2)",
              font: "inherit",
            }}
          >
            <option value="">all categories</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.n})
              </option>
            ))}
          </select>
          <button className="btn">Filter</button>
          {(term || category) && (
            <Link className="btn btn-ghost" href={`/brains/${brain.slug}/notes`}>
              Clear
            </Link>
          )}
        </form>

        {notes.length === 0 ? (
          <div className="panel">
            <p style={{ margin: 0, color: "var(--ink-2)" }}>
              {term || category
                ? "Nothing matches that filter."
                : "This brain has no notes yet. Upload sources on the brain page."}
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 0 }}>
            {notes.map((note) => (
              <article
                key={note.id}
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                  opacity: note.status === "pending" ? 0.72 : 1,
                }}
              >
                <div style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
                  <strong style={{ flex: 1 }}>{note.title}</strong>
                  <span
                    className="tag"
                    style={{ color: KIND_TINT[note.kind] ?? "var(--ink-2)" }}
                  >
                    {note.kind}
                  </span>
                </div>

                <p style={{ margin: ".4rem 0 .5rem", color: "var(--ink-2)", fontSize: ".9375rem" }}>
                  {note.body}
                </p>

                <div
                  className="mono"
                  style={{
                    display: "flex",
                    gap: ".9rem",
                    flexWrap: "wrap",
                    fontSize: ".6875rem",
                    color: "var(--ink-3)",
                    alignItems: "center",
                  }}
                >
                  {note.category && <span>{note.category}</span>}
                  <span>
                    {note.author === "agent"
                      ? `written by ${note.agent_client ?? "an agent"}`
                      : note.author === "human"
                        ? "added by hand"
                        : `from ${note.source_name ?? "a source"}`}
                  </span>
                  {note.status === "pending" && (
                    <span style={{ color: "var(--color-riso-orange)" }}>
                      awaiting review — not searchable
                    </span>
                  )}
                  <form action={deleteNote} style={{ marginLeft: "auto" }}>
                    <input type="hidden" name="id" value={note.id} />
                    <input type="hidden" name="slug" value={brain.slug} />
                    <button
                      className="mono"
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        color: "var(--color-riso-red)",
                        fontSize: ".6875rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      delete
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
