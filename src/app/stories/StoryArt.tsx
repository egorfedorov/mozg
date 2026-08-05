import type { StoryArtKind } from "./stories";

/**
 * One diagram per story.
 *
 * Drawn rather than photographed, and drawn to carry the argument: each one is
 * the shape of the mechanism in that story — a method fanning out to many hands,
 * a loop that closes inside a building, a moving platform beside a fixed studio.
 * Inline SVG so it costs no request, scales to any width, and takes its colours
 * from the page's own variables in both themes.
 *
 * The label under each figure does the work an alt attribute cannot: it says what
 * the reader is looking at, for everybody, not only for a screen reader.
 */

const FIG: Record<StoryArtKind, { caption: string; draw: (accent: string) => React.ReactNode }> = {
  style: {
    caption: "One method, taught once, working in many hands at the same time",
    draw: (accent) => (
      <>
        <rect x="16" y="52" width="86" height="66" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M28 104 L52 68 L70 96 L82 80 L92 104 Z" fill={accent} opacity="0.85" />
        <text x="59" y="136" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          the work
        </text>

        <path d="M108 85 L152 85" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />

        <rect x="158" y="58" width="104" height="54" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <text x="210" y="80" textAnchor="middle" className="mono" fontSize="12" fill="currentColor">
          the method
        </text>
        <text x="210" y="96" textAnchor="middle" className="mono" fontSize="11" fill={accent}>
          brain · 84%
        </text>
        <text x="210" y="136" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          sold, kept, updated
        </text>

        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path
              d={`M268 85 L306 ${46 + i * 39}`}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.55"
              markerEnd="url(#story-arrow)"
            />
            <rect
              x="312"
              y={30 + i * 39}
              width="52"
              height="32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.75"
            />
            <path
              d={`M320 ${56 + i * 39} L332 ${40 + i * 39} L340 ${50 + i * 39} L348 ${43 + i * 39} L356 ${56 + i * 39} Z`}
              fill={accent}
              opacity="0.5"
            />
          </g>
        ))}
        <text x="338" y="140" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          their agents
        </text>
      </>
    ),
  },

  closed: {
    caption: "A loop that closes inside the building: notes in, answers out, nothing else",
    draw: (accent) => (
      <>
        <rect x="96" y="18" width="212" height="122" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="7 5" />
        <text x="202" y="14" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          your machines, your key
        </text>

        <rect x="116" y="42" width="74" height="38" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="153" y="66" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          the manual
        </text>

        <path d="M196 61 L228 61" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />

        <rect x="234" y="38" width="60" height="46" fill={accent} opacity="0.18" stroke={accent} strokeWidth="2.5" />
        <text x="264" y="58" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          private
        </text>
        <text x="264" y="72" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          brain
        </text>

        <path d="M264 90 L264 108" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={122 + i * 52}
            y="106"
            width="44"
            height="26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.8"
          />
        ))}
        <path d="M256 119 L172 119" stroke="currentColor" strokeWidth="1.5" opacity="0.6" markerEnd="url(#story-arrow)" />
        <text x="188" y="150" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          forty people, answered
        </text>

        <path d="M330 61 L392 61" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.45" />
        <text x="362" y="52" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.45">
          outside
        </text>
        <path d="M352 74 L372 94 M372 74 L352 94" stroke="var(--color-riso-red)" strokeWidth="2.5" />
      </>
    ),
  },

  platform: {
    caption: "Two brains, different jobs: the platform moves, the studio accumulates",
    draw: (accent) => (
      <>
        <text x="16" y="22" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
          the platform, weekly
        </text>
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={16 + i * 44}
            y="34"
            width="36"
            height="24"
            fill={i === 2 ? accent : "none"}
            opacity={i === 2 ? 0.75 : 1}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ))}
        <path d="M148 46 L182 46" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />
        <rect x="188" y="26" width="96" height="44" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <text x="236" y="44" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          platform brain
        </text>
        <text x="236" y="58" textAnchor="middle" className="mono" fontSize="10" fill={accent}>
          re-read on change
        </text>

        <text x="16" y="94" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
          your team, as you work
        </text>
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${20 + i * 40} 118 L${48 + i * 40} 118`}
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.7"
            markerEnd="url(#story-arrow)"
          />
        ))}
        <rect x="188" y="98" width="96" height="44" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <text x="236" y="116" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          studio brain
        </text>
        <text x="236" y="130" textAnchor="middle" className="mono" fontSize="9" fill="currentColor" opacity="0.7">
          written, never crawled
        </text>

        <path d="M290 46 L330 76" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#story-arrow)" />
        <path d="M290 120 L330 90" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#story-arrow)" />
        <rect x="330" y="62" width="72" height="42" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="366" y="80" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          agent
        </text>
        <text x="366" y="94" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
          asks first
        </text>
      </>
    ),
  },

  maintainer: {
    caption: "The loop that writes the roadmap: a failed search becomes an exam question",
    draw: (accent) => (
      <>
        <rect x="18" y="52" width="78" height="44" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="57" y="72" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          the docs
        </text>
        <text x="57" y="86" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
          as written
        </text>

        <path d="M102 74 L138 74" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />

        <rect x="144" y="46" width="88" height="56" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <text x="188" y="68" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          brain + exam
        </text>
        <text x="188" y="84" textAnchor="middle" className="mono" fontSize="11" fill={accent}>
          score · gaps
        </text>

        <path d="M238 74 L282 74" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x="288"
            y={40 + i * 26}
            width="96"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.8"
          />
        ))}
        <text x="336" y="128" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          real agents, asking
        </text>

        {/* The return path: what they could not find comes back as a question. */}
        <path
          d="M336 132 C336 158, 188 158, 188 112"
          fill="none"
          stroke={accent}
          strokeWidth="2"
          markerEnd="url(#story-arrow-accent)"
        />
        <text x="262" y="170" textAnchor="middle" className="mono" fontSize="10" fill={accent}>
          a search that found nothing becomes an exam question
        </text>
      </>
    ),
  },

  agency: {
    caption: "One brain per project, and each one leaves as a file when the work ends",
    draw: (accent) => (
      <>
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x={16 + (i % 4) * 30}
            y={34 + Math.floor(i / 4) * 30}
            width="22"
            height="22"
            fill={i === 5 ? accent : "none"}
            opacity={i === 5 ? 0.75 : 1}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ))}
        <text x="72" y="140" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          twelve clients
        </text>

        <path d="M144 74 L182 74" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />

        <rect x="188" y="34" width="104" height="80" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1="188"
            y1={60 + i * 26}
            x2="292"
            y2={60 + i * 26}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.35"
          />
        ))}
        <text x="240" y="52" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          a brain each
        </text>
        <text x="240" y="140" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          filled as work happens
        </text>

        <path d="M298 74 L336 74" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />
        <rect x="342" y="50" width="56" height="48" fill="none" stroke={accent} strokeWidth="2.5" />
        <text x="370" y="70" textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
          CLAUDE
        </text>
        <text x="370" y="84" textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
          .md
        </text>
        <text x="370" y="140" textAnchor="middle" className="mono" fontSize="11" fill="currentColor" opacity="0.7">
          handover
        </text>
      </>
    ),
  },
  solo: {
    caption: "The beginner's missing instrument: an answer with a date and a score on it",
    draw: (accent) => (
      <>
        <rect x="18" y="40" width="96" height="66" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="66" y="70" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          &quot;just do it
        </text>
        <text x="66" y="86" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          properly&quot;
        </text>

        <path d="M120 73 L156 73" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />

        <rect x="162" y="26" width="104" height="42" fill="none" stroke="var(--color-riso-red)" strokeWidth="2" />
        <text x="214" y="43" textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
          from memory
        </text>
        <text x="214" y="57" textAnchor="middle" className="mono" fontSize="10" fill="var(--color-riso-red)">
          undated, unchecked
        </text>

        <rect x="162" y="80" width="104" height="42" fill="none" stroke={accent} strokeWidth="2.5" />
        <text x="214" y="97" textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
          from the brain
        </text>
        <text x="214" y="111" textAnchor="middle" className="mono" fontSize="10" fill={accent}>
          dated · 84% · cited
        </text>

        <path d="M272 101 L308 101" stroke="currentColor" strokeWidth="2" markerEnd="url(#story-arrow)" />
        <rect x="314" y="80" width="86" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="357" y="97" textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
          she can check
        </text>
        <text x="357" y="111" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
          without reading code
        </text>
      </>
    ),
  },

  everywhere: {
    caption: "One brain, every agent — and a file to leave with",
    draw: (accent) => (
      <>
        {["Claude Code", "Codex", "Cursor"].map((name, i) => (
          <g key={name}>
            <rect x="14" y={24 + i * 40} width="92" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="60" y={43 + i * 40} textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
              {name}
            </text>
            <path
              d={`M110 ${39 + i * 40} L166 79`}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.6"
              markerEnd="url(#story-arrow)"
            />
          </g>
        ))}

        <rect x="172" y="56" width="92" height="46" fill={accent} opacity="0.12" stroke={accent} strokeWidth="2.5" />
        <text x="218" y="76" textAnchor="middle" className="mono" fontSize="11" fill="currentColor">
          one brain
        </text>
        <text x="218" y="92" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity="0.75">
          same note, one date
        </text>

        <path d="M270 79 L306 79" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#story-arrow)" />
        <rect x="312" y="58" width="88" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="356" y="75" textAnchor="middle" className="mono" fontSize="10" fill="currentColor">
          export, any time
        </text>
        <text x="356" y="89" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity="0.7">
          works with no account
        </text>
      </>
    ),
  },
};

export default function StoryArt({ kind, accent }: { kind: StoryArtKind; accent: string }) {
  const fig = FIG[kind];
  return (
    <figure style={{ margin: "1.5rem 0 0", maxWidth: "62ch" }}>
      <div
        style={{
          border: "1.5px solid var(--ink)",
          background: "var(--paper-2)",
          padding: "1rem .75rem .5rem",
        }}
      >
        <svg
          viewBox="0 0 414 180"
          role="img"
          aria-label={fig.caption}
          style={{ width: "100%", height: "auto", color: "var(--ink)", display: "block" }}
        >
          <defs>
            <marker id="story-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
            <marker
              id="story-arrow-accent"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={accent} />
            </marker>
          </defs>
          {fig.draw(accent)}
        </svg>
      </div>
      <figcaption
        className="mono"
        style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".5rem" }}
      >
        {fig.caption}
      </figcaption>
    </figure>
  );
}
