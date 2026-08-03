import Link from "next/link";
import TopBar from "@/components/TopBar";

export default function NotFound() {
  return (
    <>
      <TopBar />
      <main
        className="shell"
        style={{ paddingBlock: "clamp(3rem, 10vw, 7rem)", maxWidth: 620 }}
      >
        <p className="eyebrow">404</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)", margin: ".5rem 0 1rem" }}
        >
          Nothing here.
        </h1>
        <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
          The brain may be private, renamed, or gone. If someone shared a link with
          you, ask them to invite your email — a link alone is not access.
        </p>
        <div style={{ display: "flex", gap: ".75rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/brains">
            Your brains
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            Explore public brains
          </Link>
        </div>
      </main>
    </>
  );
}
