import { translator } from "@/lib/t";
/**
 * The same request, answered twice.
 *
 * The argument every page here is making — that measured, current knowledge beats
 * a confident guess — lands in three lines or not at all: somebody asks in their
 * own words, an agent without the brain gives the answer an average of the
 * internet would give, and an agent with it proposes the thing a professional
 * would, usually naming a term the asker had never heard.
 *
 * Shared rather than repeated: it appears in the stories and in the argument
 * pages, and two copies would drift in styling and in tone.
 */
export default async function AskedTwice({
  ask,
  without,
  withBrain,
  accent = "var(--ink)",
}: {
  /** The naive request, in quotes, in the asker's own words. */
  ask: string;
  without: string;
  withBrain: string;
  accent?: string;
}) {
  const t = await translator();

  return (
    <div style={{ marginTop: "1.75rem", maxWidth: "62ch" }}>
      <p
        style={{
          fontSize: "1.0625rem",
          lineHeight: 1.6,
          borderLeft: `3px solid ${accent}`,
          paddingLeft: ".9rem",
          margin: 0,
        }}
      >
        {ask}
      </p>

      {/* One-pixel gaps over an ink background: the two answers read as two
          halves of one object rather than two cards that happen to be adjacent. */}
      <div
        style={{
          display: "grid",
          gap: "1px",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          background: "var(--ink)",
          border: "1.5px solid var(--ink)",
          marginTop: "1rem",
        }}
      >
        <div style={{ background: "var(--paper-2)", padding: "1rem" }}>
          <p className="eyebrow" style={{ margin: "0 0 .5rem", color: "var(--color-riso-red)" }}>
            {t("Without a brain")}</p>
          <p style={{ margin: 0, fontSize: ".9375rem", color: "var(--ink-2)", lineHeight: 1.55 }}>
            {without}
          </p>
        </div>
        <div style={{ background: "var(--paper)", padding: "1rem" }}>
          <p className="eyebrow" style={{ margin: "0 0 .5rem", color: "var(--color-riso-green)" }}>
            {t("With the brain")}</p>
          <p style={{ margin: 0, fontSize: ".9375rem", color: "var(--ink)", lineHeight: 1.55 }}>
            {withBrain}
          </p>
        </div>
      </div>
    </div>
  );
}
