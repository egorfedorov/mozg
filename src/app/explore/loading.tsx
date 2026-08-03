/** Skeleton of the catalogue: heading, chip rows, then the card grid. */
export default function Loading() {
  return (
    <main
      className="shell"
      style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}
      aria-busy="true"
      aria-label="Loading public brains"
    >
      <div className="skel" style={{ height: ".75rem", width: "18rem" }} />
      <div className="skel" style={{ height: "3rem", width: "min(26rem, 80%)", margin: "1rem 0" }} />
      <div className="skel" style={{ height: "1rem", width: "min(34rem, 90%)" }} />

      <div
        className="skel"
        style={{ height: "2.25rem", marginTop: "2rem", border: 0, borderBottom: "1.5px solid var(--ink)" }}
      />
      <div className="skel" style={{ height: "2rem", width: "80%", marginTop: ".75rem", border: 0 }} />

      <div className="grid-brains" style={{ marginTop: "2rem" }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skel" style={{ minHeight: 268 }} />
        ))}
      </div>
    </main>
  );
}
