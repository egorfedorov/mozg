import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ShareForm from "./ShareForm";
import DeleteBrain from "./DeleteBrain";
import { maybeOne, query } from "@/db";
import type { Brain, Grant } from "@/db/types";
import { currentUser } from "@/lib/session";

export default async function SharePage({
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

  const grants = await query<Grant>(
    `select * from grants where brain_id = $1 order by invited_at desc`,
    [brain.id],
  );

  return (
    <AppShell active="/brains" narrow>
        <Link className="eyebrow" href={`/brains/${brain.slug}`}>
          ← {brain.title}
        </Link>

        <h1 className="h1" style={{ margin: ".75rem 0 .5rem" }}>
          Sharing
        </h1>
        {brain.visibility === "public" && user.handle && (
          <p className="mono" style={{ color: "var(--ink-2)", fontSize: ".8125rem" }}>
            Public at{" "}
            <Link href={`/b/${user.handle}/${brain.slug}`} style={{ textDecoration: "underline" }}>
              /b/{user.handle}/{brain.slug}
            </Link>
          </p>
        )}

        <div style={{ marginTop: "1.75rem" }}>
          <ShareForm brain={brain} grants={grants} />
        </div>

        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            Export
          </h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
            Take the brain with you. These files keep working with no server and no
            subscription — which is the point.
          </p>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            {[
              ["claude", "CLAUDE.md"],
              ["skill", "Claude Skill"],
              ["agents", "AGENTS.md"],
            ].map(([format, label]) => (
              <a
                key={format}
                className="btn btn-ghost"
                href={`/api/brains/${brain.id}/export?format=${format}`}
              >
                {label}
              </a>
            ))}
          </div>
        </section>

        <hr className="rule" style={{ margin: "3rem 0 0" }} />
        <DeleteBrain
          slug={brain.slug}
          title={brain.title}
          noteCount={brain.note_count}
        />
      </AppShell>
  );
}
