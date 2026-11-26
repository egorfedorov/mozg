import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

/**
 * The drawn layer.
 *
 * Riso and pencil are the same family, not two styles: riso is how a zine gets
 * printed, pencil is how it gets drawn before printing. So this is not a second
 * identity bolted on. It is the artwork the press reproduces, which is why it
 * shares the palette and the hard geometry rather than softening them.
 *
 * Inline SVG with a displacement filter. No images, no requests, and it
 * degrades to clean straight lines where filters are unsupported.
 */

/** Rendered once per page. The filters every drawn thing below refers to. */
export function SketchDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        {/* A hand cannot draw a straight line. Turbulence pushes each point off
            course by a couple of pixels, which is roughly the error a pencil
            makes over the width of a card. */}
        <filter id="sk-wobble" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Rougher, for panel frames: a border drawn in one pass presses
            unevenly at the corners. */}
        <filter id="sk-frame" x="-4%" y="-8%" width="108%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="23" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/** A drawn horizontal rule. Two passes, because nobody rules a line once. */
export function Scribble({ color = "var(--graphite)", height = 14 }: { color?: string; height?: number }) {
  return (
    <svg viewBox="0 0 600 14" preserveAspectRatio="none" width="100%" height={height} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <g filter="url(#sk-wobble)" fill="none" stroke={color} strokeLinecap="round">
        <path d="M4 7 H596" strokeWidth="2" />
        <path d="M18 9.5 H572" strokeWidth="1" opacity="0.45" />
      </g>
    </svg>
  );
}

/**
 * A comic panel. The frame is drawn rather than bordered, and the number sits
 * in its corner the way a strip numbers its beats.
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
  children: ReactNode;
  /** The margin note: what a reader scribbles beside a panel. */
  aside?: ReactNode;
}) {
  return (
    <figure className="sk-panel">
      <svg className="sk-panel-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g filter="url(#sk-frame)" fill="none" stroke={tint} strokeLinecap="round">
          <path d="M1.5 1.5 H98.5 V98.5 H1.5 Z" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          <path d="M3 3 H97 V97 H3 Z" strokeWidth="0.4" opacity="0.35" vectorEffect="non-scaling-stroke" />
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
 * The gap.
 *
 * Two lines leave the same point: what the agent writes climbs, what a person
 * can explain climbs more slowly, and the space between them is what nobody is
 * asked about. Hatched in the ink that means "not explained".
 */
export function Gap() {
  return (
    <figure className="sk-fig-wrap">
    <svg
      className="sk-fig"
      viewBox="0 0 600 200"
      width="100%"
      role="img"
      aria-label={t(
        "Two lines leaving the same point: what the agent writes climbs steeply, what a person can explain climbs slowly, and the gap between them is hatched.",
      )}
    >
      <defs>
        <pattern id="sk-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--orange)" strokeWidth="2.2" />
        </pattern>
      </defs>

      <path
        filter="url(#sk-wobble)"
        d="M44 162 C 150 154, 262 118, 362 82 S 512 34, 566 24 L566 112 C 512 118, 462 126, 362 138 S 150 158, 44 162 Z"
        fill="url(#sk-hatch)"
        opacity="0.6"
      />

      <g filter="url(#sk-wobble)" fill="none" strokeLinecap="round">
        <path d="M44 172 H566" stroke="var(--graphite)" strokeWidth="1.5" opacity="0.5" />
        <path d="M44 162 C 150 154, 262 118, 362 82 S 512 34, 566 24" stroke="var(--graphite)" strokeWidth="2.6" />
        <path d="M44 165 C 150 157, 262 121, 362 85 S 512 37, 566 27" stroke="var(--graphite)" strokeWidth="1" opacity="0.4" />
        <path d="M44 162 C 150 158, 262 148, 362 138 S 512 118, 566 112" stroke="var(--red)" strokeWidth="2.6" />
        <path d="M44 165 C 150 161, 262 151, 362 141 S 512 121, 566 115" stroke="var(--red)" strokeWidth="1" opacity="0.4" />
        {/* The measure. */}
        <path d="M580 24 V112" stroke="var(--ink-2)" strokeWidth="1.2" />
        <path d="M575 24 H585 M575 112 H585" stroke="var(--ink-2)" strokeWidth="1.2" />
      </g>
    </svg>
    {/* The words live on the page, not in the drawing: type that scales with a
        figure is no longer type on a phone. The drawing's label already says
        all of this, so the key is for eyes only. */}
    <div className="sk-axis" aria-hidden="true">
      <span>{t("first session")}</span>
      <span>{t("a month in")}</span>
    </div>
    <ul className="sk-key" aria-hidden="true">
      <li>
        <i className="sk-key-agent" />
        {t("what your agent writes")}
      </li>
      <li>
        <i className="sk-key-you" />
        {t("what you can explain")}
      </li>
      <li>
        <i className="sk-key-gap" />
        {t("the gap: what nobody asked you about")}
      </li>
    </ul>
    </figure>
  );
}
