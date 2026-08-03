import Link from "next/link";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import BrainCard from "@/components/BrainCard";
import { currentUser } from "@/lib/session";
import { listBrains } from "@/lib/brains";

export default async function BrainsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const brains = await listBrains(user.id);

  return (
    <>
      <TopBar active="brains" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "2rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow">
              {brains.length} {brains.length === 1 ? "brain" : "brains"} · {user.plan} plan
            </p>
            <h1
              className="display"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", marginTop: ".4rem" }}
            >
              Your brains
            </h1>
          </div>
          <Link className="btn" href="/brains/new">
            New brain
          </Link>
        </div>

        {brains.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid-brains">
            {brains.map((brain) => (
              <BrainCard key={brain.id} brain={brain} />
            ))}
            <Link href="/brains/new" className="card-new">
              <span className="plus">+</span>
              <span className="mono" style={{ fontSize: ".8125rem" }}>
                New brain
              </span>
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

/** An empty screen is an invitation to act, not a shrug. */
function EmptyState() {
  return (
    <div className="panel" style={{ maxWidth: "62ch" }}>
      <p className="eyebrow">Nothing here yet</p>
      <h2 className="display" style={{ fontSize: "1.75rem", margin: ".5rem 0 .75rem" }}>
        Start with one folder of screenshots.
      </h2>
      <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
        Pick something you explain to an agent over and over — a UI you keep
        rebuilding, an API you keep re-reading, a convention nobody wrote down.
        Name what it&apos;s for, drop the screenshots in, and connect it to your
        editor.
      </p>
      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
        <Link className="btn" href="/brains/new">
          Build the first one
        </Link>
        <Link className="btn btn-ghost" href="/explore">
          See public brains
        </Link>
      </div>
    </div>
  );
}
