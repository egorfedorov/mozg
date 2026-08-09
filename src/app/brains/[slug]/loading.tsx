import { translator } from "@/lib/t";
/** Skeleton of the brain page: header, then the connect/exam panel pair. */
export default async function Loading() {
  const t = await translator();

  return (
    <div className="app-main" aria-busy="true" aria-label={t("Loading brain")}>
      <div className="skel" style={{ height: ".75rem", width: "6rem", marginBottom: "1rem" }} />

      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", margin: "1rem 0 2.5rem" }}>
        <div className="skel" style={{ width: 56, height: 56, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skel" style={{ height: "2.5rem", width: "55%" }} />
          <div className="skel" style={{ height: "1rem", width: "75%", marginTop: ".75rem" }} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
        }}
      >
        <div className="skel" style={{ minHeight: 240 }} />
        <div className="skel" style={{ minHeight: 240 }} />
      </div>

      <div className="skel" style={{ height: 180, marginTop: "2rem" }} />
    </div>
  );
}
