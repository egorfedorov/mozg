import Link from "next/link";
import TopBar from "@/components/TopBar";
import { query } from "@/db";
import type { Brain } from "@/db/types";
import { categoryScores, tintFor } from "@/lib/brains";

// Reads the database and the session on every request. Without this Next
// prerenders it at build time — which fails in a Docker build (no database)
// and, worse, would serve a cached page that never reflects new public brains.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore brains — mozg",
  description:
    "Public knowledge brains you can connect to Claude Code, Codex or Cursor.",
};

interface PublicBrain extends Brain {
  owner_handle: string;
  owner_name: string | null;
}

export default async function ExplorePage() {
  const brains = await query<PublicBrain>(
    `select b.*, u.handle as owner_handle, u.name as owner_name
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null
      order by b.score desc nulls last, b.updated_at desc
      limit 60`,
  );

  const scores = await categoryScores(brains.map((b) => b.id));

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">Public · connect any of these in one command</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", margin: ".4rem 0 1rem" }}
        >
          Explore brains
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          Brains other people made public. Each one shows what it is for and how
          much of that it can actually answer — the score is a measurement, not a
          claim.
        </p>

        {brains.length === 0 ? (
          <div className="panel" style={{ marginTop: "2rem", maxWidth: "58ch" }}>
            <p className="eyebrow">Nothing public yet</p>
            <h2 className="display" style={{ fontSize: "1.5rem", margin: ".5rem 0 .75rem" }}>
              Be the first.
            </h2>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              Publishing a brain makes it readable by anyone and gives it a page
              that search engines can find.
            </p>
            <Link className="btn" href="/brains" style={{ marginTop: "1rem" }}>
              Go to your brains
            </Link>
          </div>
        ) : (
          <div className="grid-brains" style={{ marginTop: "2rem" }}>
            {brains.map((brain) => (
              <Link
                key={brain.id}
                href={`/b/${brain.owner_handle}/${brain.slug}`}
                className="card"
                data-tint={tintFor(brain)}
              >
                <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
                  {brain.owner_handle} · {brain.note_count} notes
                </span>
                <h2 className="card-title">{brain.title}</h2>
                <p className="card-goal">{brain.goal ?? "No goal set."}</p>

                <div className="readout">
                  {(scores.get(brain.id) ?? Array.from({ length: 6 }, () => ({ state: "empty" as const }))).map(
                    (c, i) => (
                      <span key={i} className="readout-cell" data-state={c.state} />
                    ),
                  )}
                </div>

                <div className="card-foot">
                  <span style={{ opacity: 0.8 }}>
                    {brain.license === "mit" ? "MIT" : brain.license === "nc" ? "CC BY-NC-SA" : "Closed"}
                  </span>
                  {brain.score !== null && (
                    <span className="card-score">
                      {brain.score}
                      <sup>%</sup>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
