/**
 * A claim between two laurel branches. The branches are the printer's way of
 * saying "look here"; what they frame is only ever something the product can
 * vouch for, never a prize it was not awarded.
 */
export default function Laurel({ children }: { children: React.ReactNode }) {
  return (
    <p className="laurel">
      <Branch side="left" />
      <span>{children}</span>
      <Branch side="right" />
    </p>
  );
}

function Branch({ side }: { side: "left" | "right" }) {
  return (
    <svg className="laurel-branch" viewBox="0 0 24 44" width="20" height="38" aria-hidden="true" style={side === "right" ? { transform: "scaleX(-1)" } : undefined}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M19 41C9 34 5 22 8 9" />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const y = 37 - i * 5.2;
          const x = 17 - i * 1.75;
          return (
            <g key={i}>
              <path d={`M${x} ${y}q-8 -1.5 -9.5 -6`} />
              <path d={`M${x + 1} ${y - 3}q1 -6 -2.5 -8.5`} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
