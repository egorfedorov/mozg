import Link from "next/link";
import type { BrainWithScore } from "@/lib/brains";
import { tintFor } from "@/lib/brains";

const LICENSE_LABEL: Record<string, string> = {
  nc: "CC BY-NC-SA",
  mit: "MIT",
  proprietary: "Closed",
};

/**
 * The readout strip is the signature: one cell per exam category, so the card
 * says *which* knowledge holds, not just an average.
 */
export default function BrainCard({ brain }: { brain: BrainWithScore }) {
  const cells = brain.categories.length
    ? brain.categories
    : Array.from({ length: 6 }, () => ({ state: "empty" as const }));

  return (
    <Link href={`/brains/${brain.slug}`} className="card" data-tint={tintFor(brain)}>
      <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
        {brain.note_count} notes · {brain.source_count} sources
      </span>

      <h2 className="card-title">{brain.title}</h2>
      <p className="card-goal">{brain.goal ?? "No goal set yet."}</p>

      <div
        className="readout"
        role="img"
        aria-label={
          brain.categories.length
            ? brain.categories
                .map((c) => `${c.category}: ${c.passed} of ${c.total}`)
                .join(", ")
            : "Not examined yet"
        }
      >
        {cells.map((c, i) => (
          <span key={i} className="readout-cell" data-state={c.state} />
        ))}
      </div>

      <div className="card-foot">
        <span style={{ opacity: 0.8 }}>{LICENSE_LABEL[brain.license]}</span>
        {brain.score === null ? (
          <span style={{ opacity: 0.8 }}>not examined</span>
        ) : (
          <span className="card-score">
            {brain.score}
            <sup>%</sup>
          </span>
        )}
      </div>
    </Link>
  );
}
