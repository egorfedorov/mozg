/**
 * The drawn layer.
 *
 * Riso and pencil are the same family, not two styles: riso is how a zine gets
 * printed, pencil is how it gets drawn before printing. So this is not a second
 * identity bolted on — it is the artwork the press reproduces, which is why it
 * shares the palette and the hard geometry rather than softening them.
 *
 * Everything here is inline SVG with a displacement filter. No images, no
 * external requests, and it degrades to clean straight lines if filters are
 * unsupported.
 */

import { translator } from "@/lib/t";

/** Rendered once per page. The filters every drawn thing below refers to. */
export function SketchDefs() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
      <defs>
        {/* A hand cannot draw a straight line. Turbulence pushes each point off
            course by a couple of pixels, which is roughly the error a pencil
            makes over the width of a card. */}
        <filter id="sk-wobble" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018"
            numOctaves="3"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="3.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Rougher, for panel frames — a border drawn in one pass presses
            unevenly at the corners. */}
        <filter id="sk-frame" x="-4%" y="-8%" width="108%" height="116%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.011"
            numOctaves="2"
            seed="23"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="4.5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

/** A drawn horizontal rule. Two passes, because nobody rules a line once. */
export function Scribble({
  color = "var(--graphite)",
  height = 14,
}: {
  color?: string;
  height?: number;
}) {
  return (
    <svg
      viewBox="0 0 600 14"
      preserveAspectRatio="none"
      width="100%"
      height={height}
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      <g filter="url(#sk-wobble)" fill="none" stroke={color} strokeLinecap="round">
        <path d="M4 7 H596" strokeWidth="2" />
        <path d="M18 9.5 H572" strokeWidth="1" opacity="0.45" />
      </g>
    </svg>
  );
}

/**
 * A comic panel. The frame is drawn rather than bordered, and the number sits
 * in its corner the way a strip numbers its beats — the guide really is a
 * sequence, so the numbering carries information rather than decorating.
 */
export function Panel({
  n,
  title,
  tint = "var(--graphite)",
  children,
  aside,
}: {
  n?: string;
  title: string;
  tint?: string;
  children: React.ReactNode;
  /** The margin note — what a reader scribbles beside a panel. */
  aside?: React.ReactNode;
}) {
  return (
    <figure className="sk-panel">
      <svg
        className="sk-panel-frame"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <g filter="url(#sk-frame)" fill="none" stroke={tint} strokeLinecap="round">
          <path d="M1.5 1.5 H98.5 V98.5 H1.5 Z" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          <path
            d="M3 3 H97 V97 H3 Z"
            strokeWidth="0.4"
            opacity="0.35"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>

      <div className="sk-panel-body">
        {n && (
          <span className="sk-panel-n" style={{ color: tint }}>
            {n}
          </span>
        )}
        <h3 className="h3 sk-panel-title">{title}</h3>
        <div className="sk-panel-text">{children}</div>
        {aside && <p className="sk-aside">{aside}</p>}
      </div>
    </figure>
  );
}

/**
 * The signature: two lines leaving the same point on day one.
 *
 * A file is the same on day ninety as the day it was written. A brain has been
 * re-read, corrected, and taught things its author never typed — the marks on
 * the climbing line are where that happened. The difference between the two
 * approaches is time, so time is the axis.
 */
export async function Divergence() {
  const t = await translator();
  return (
    <svg
      viewBox="0 0 600 190"
      width="100%"
      role="img"
      aria-label={t(
        "Two lines leaving the same point: a file stays flat, a brain climbs as it is re-read and corrected.",
      )}
      style={{ display: "block", overflow: "visible", maxWidth: 760 }}
    >
      <g filter="url(#sk-wobble)">
        {/* axis, close under the lines it measures */}
        <path
          d="M40 158 H570"
          stroke="var(--graphite)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* the file: written once, flat forever */}
        <path
          d="M46 132 H516"
          stroke="var(--ink-2)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M46 135 H498" stroke="var(--ink-2)" strokeWidth="1" fill="none" opacity="0.4" />

        {/* the brain: climbs, with a mark at every re-read */}
        <path
          d="M46 132 C 150 124, 210 104, 280 92 S 420 56, 556 26"
          stroke="var(--color-riso-red)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M46 136 C 150 128, 210 108, 280 96 S 420 60, 556 30"
          stroke="var(--color-riso-red)"
          strokeWidth="1.2"
          fill="none"
          opacity="0.45"
        />

        {/* the re-reads */}
        {[
          [150, 123],
          [280, 92],
          [400, 64],
          [498, 42],
        ].map(([x, y]) => (
          <g key={x} stroke="var(--color-riso-red)" strokeWidth="1.6" strokeLinecap="round">
            <path d={`M${x - 5} ${y - 5} L${x + 5} ${y + 5}`} />
            <path d={`M${x + 5} ${y - 5} L${x - 5} ${y + 5}`} />
          </g>
        ))}
      </g>

      {/* labels stay unfiltered: wobbly type is illegible, and the drawing is
          the flourish — the words are not */}
      <text x="46" y="178" className="sk-label">
        {t("day one")}
      </text>
      <text x="570" y="178" textAnchor="end" className="sk-label">
        {t("three months in")}
      </text>
      <text x="598" y="24" textAnchor="end" className="sk-label sk-label-red">
        {t("a brain")}
      </text>
      <text x="598" y="136" textAnchor="end" className="sk-label">
        {t("a file")}
      </text>
    </svg>
  );
}

/**
 * How a page becomes an answer.
 *
 * The pipeline is four steps and people guess wrong about all of them —
 * mostly they assume the whole document is stuffed into the agent's context.
 * Drawing it is faster than the paragraph that would be needed instead.
 */
export async function Pipeline() {
  const t = await translator();
  const steps: [string, string][] = [
    ["a page", "screens, docs, a repo"],
    ["notes", "facts with values kept"],
    ["searched", "five, not five hundred"],
    ["an answer", "in the agent's words"],
  ];

  return (
    <svg
      viewBox="0 0 640 132"
      width="100%"
      role="img"
      aria-label={t(
        "A page becomes notes, notes are searched, and five of them become an answer.",
      )}
      style={{ display: "block", overflow: "visible", maxWidth: 780 }}
    >
      {steps.map(([label, note], i) => {
        const x = 10 + i * 160;
        return (
          <g key={label}>
            <g filter="url(#sk-frame)" fill="none" stroke="var(--graphite)" strokeLinecap="round">
              <rect x={x} y="14" width="118" height="52" strokeWidth="1.6" />
              {/* the second pass, offset — one stroke never covers a box */}
              <rect x={x + 2} y="16.5" width="114" height="47" strokeWidth="0.8" opacity="0.4" />
            </g>

            {/* the sheet shrinking: four lines, then two, then one */}
            <g
              filter="url(#sk-wobble)"
              stroke={i === steps.length - 1 ? "var(--color-riso-red)" : "var(--graphite)"}
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.85"
            >
              {Array.from({ length: Math.max(1, 4 - i) }, (_, k) => (
                <path key={k} d={`M${x + 14} ${28 + k * 9} H${x + 104 - k * 12}`} />
              ))}
            </g>

            <text x={x + 59} y="86" textAnchor="middle" className="sk-label">
              {label}
            </text>
            <text x={x + 59} y="102" textAnchor="middle" className="sk-label sk-label-quiet">
              {note}
            </text>

            {i < steps.length - 1 && (
              <g filter="url(#sk-wobble)" fill="none" stroke="var(--graphite)" strokeWidth="1.6" strokeLinecap="round">
                <path d={`M${x + 128} 40 H${x + 152}`} />
                <path d={`M${x + 145} 34 L${x + 154} 40 L${x + 145} 46`} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
