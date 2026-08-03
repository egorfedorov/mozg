/** Skeleton of the dashboard: stat strip, then the card grid. */
export default function Loading() {
  return (
    <div className="app-main" aria-busy="true" aria-label="Loading your brains">
      <div className="skel" style={{ height: "2.5rem", width: "14rem", marginBottom: "1.75rem" }} />

      <div className="stats" style={{ marginBottom: "2.5rem" }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="stat" style={{ border: 0 }}>
            <div className="skel" style={{ height: ".7rem", width: "60%", border: 0 }} />
            <div className="skel" style={{ height: "1.75rem", width: "40%", border: 0, marginTop: ".5rem" }} />
          </div>
        ))}
      </div>

      <div className="grid-brains">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skel" style={{ minHeight: 268 }} />
        ))}
      </div>
    </div>
  );
}
