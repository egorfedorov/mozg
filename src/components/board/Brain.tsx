/* eslint-disable @next/next/no-img-element -- a fixed-size local illustration inside a fixed-size frame */
import type { DeskState } from "@/core/types";
import { t } from "@/lib/i18n";

/**
 * The brain, in the first person.
 *
 * A pupil that asks, never a warden. Every line it says is computed from the
 * numbers beside it (see core/desk.ts): nothing is generated, nothing is
 * encouraging on its own. A brain at 30% says so, and says which parts to
 * distrust.
 */
export function Brain({ state, live = true }: { state: DeskState; live?: boolean }) {
  return (
    <div className="brain" data-live={live || undefined}>
      {/* The character is a printed illustration, not an SVG: two lobes of
          bezier guesswork read as a diagram of a brain, and this has to be
          likeable. Fixed size, local, tiny. */}
      <img className="brain-face" src="/brand/mascot.webp" alt="" width={92} height={92} />
      <div className="bubble">
        {state.brain.map((line, i) => (
          <p key={i} className="brain-line" data-tone={line.tone}>
            {line.tone !== "plain" && (
              <span className="brain-mark" data-tone={line.tone} aria-hidden="true">
                {line.tone === "warn" ? "!" : "✓"}
              </span>
            )}
            {line.text}
          </p>
        ))}
        <p className="brain-note">{t("Every line above is worked out from the numbers on this page.")}</p>
      </div>
    </div>
  );
}
