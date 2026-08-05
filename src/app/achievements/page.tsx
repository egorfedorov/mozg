import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { currentUser } from "@/lib/session";
import {
  CATALOG,
  globalAchievements,
  markAchievementsSeen,
  syncAchievements,
} from "@/lib/achievements";
import { Stats, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Achievements — mozg" };

/**
 * The trophy shelf. Twenty badges in the same print style as the mascot;
 * locked ones stay on the page in grey — a visible ladder beats a hidden one.
 * Rendering the page is the sync: crossings are recorded here and wherever
 * the mascot dock runs, and looking at the shelf marks them seen.
 */
export default async function AchievementsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/achievements");

  const stats = await syncAchievements(user.id);
  const earned = await globalAchievements(user.id);
  await markAchievementsSeen(user.id);

  const done = CATALOG.filter((a) => earned.has(a.kind)).length;

  return (
    <AppShell
      active="/achievements"
      eyebrow={`${done} of ${CATALOG.length} earned`}
      title="Achievements"
    >
      <Stats>
        <Stat label="Brains made" value={String(stats.brains)} />
        <Stat label="Notes" value={stats.notes.toLocaleString()} />
        <Stat label="Sources fed" value={String(stats.sources)} />
        <Stat label="Agent calls" value={stats.calls.toLocaleString()} />
        <Stat label="Duels won" value={String(stats.duels)} />
        <Stat label="Best streak" value={`${stats.best_streak}d`} />
      </Stats>

      <div className="ach-grid" style={{ marginTop: "1.5rem" }}>
        {CATALOG.map((a) => {
          const at = earned.get(a.kind);
          const have = Math.min(stats[a.stat], a.goal);
          return (
            <div key={a.kind} className="ach-card" data-earned={Boolean(at)}>
              {/* Fixed-size local art in a fixed-size card — same reasoning as
                  the mascot: next/image would add a loader round trip for a
                  small file that never changes size. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/achievements/${a.kind}.webp`}
                alt=""
                width={96}
                height={96}
                loading="lazy"
                className="ach-img"
              />
              <strong className="ach-title">{a.title}</strong>
              <span className="ach-blurb">{a.blurb}</span>
              <span className="mono ach-meta">
                {at
                  ? at.toISOString().slice(0, 10)
                  : a.goal > 1
                    ? `${have} / ${a.goal}`
                    : "not yet"}
              </span>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
