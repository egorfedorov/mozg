import type { DayView, DeskState, ModuleView } from "@/core/types";
import { count, fill, t } from "@/lib/i18n";
import { breakable } from "@/lib/text";

const STATE_LABEL: Record<ModuleView["state"], string> = {
  idle: "Not touched",
  unexplained: "Not explained",
  explained: "Yours",
  due: "Re-check due",
  changed: "Changed since",
};

/** The score over the last two weeks. Server-rendered SVG; fourteen points need no chart library. */
export function Spark({ days }: { days: DayView[] }) {
  const W = 132;
  const H = 40;
  const n = days.length;
  if (n < 2) return null;
  const x = (i: number) => 1 + (i / (n - 1)) * (W - 2);
  const y = (p: number) => H - 3 - (p / 100) * (H - 6);

  // A day with nothing to own is a gap in the line, not a zero.
  let d = "";
  let pen = false;
  days.forEach((day, i) => {
    if (day.ownership === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(day.ownership).toFixed(1)} `;
    pen = true;
  });
  const lastIndex = days.reduce((found, day, i) => (day.ownership !== null ? i : found), -1);

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("Ownership over the last two weeks")}>
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--rule)" strokeWidth={1} />
      {d && <path d={d.trim()} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
      {lastIndex >= 0 && days[lastIndex].ownership !== null && (
        <circle cx={x(lastIndex)} cy={y(days[lastIndex].ownership!)} r={2.6} fill="var(--red)" />
      )}
    </svg>
  );
}

/** The big number and what it is made of. */
export function OwnershipHead({ state }: { state: DeskState }) {
  const { today } = state;
  return (
    <div className="own-head">
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          {t("Ownership today")}
        </p>
        <div className="own-value num" data-empty={today.ownership === null || undefined}>
          {today.ownership === null ? "—" : (
            <>
              {today.ownership}
              <sup>%</sup>
            </>
          )}
        </div>
      </div>
      <Spark days={state.days} />
      <p className="own-cap">
        {today.ownership === null
          ? t("The agent has not changed a file today.")
          : today.modulesTouched === 1
            ? // "1 of the 1 modules are yours" is not a sentence anybody says.
              (today.modulesOwned === 1 ? t("The one module it touched is yours.") : t("The one module it touched is not yours yet."))
            : fill(count(today.modulesTouched, "<1/> of the <0/> module it touched is yours.", "<1/> of the <0/> modules it touched are yours."), [
                // In the order of the slots: <0/> touched, <1/> yours.
                today.modulesTouched,
                today.modulesOwned,
              ])}
      </p>
    </div>
  );
}

/**
 * Squares of equal size, most at stake first. A treemap would be exact and
 * unreadable; this lets the eye count what is and is not yours.
 */
export function OwnMap({ modules, limit = 12 }: { modules: ModuleView[]; limit?: number }) {
  const shown = modules.filter((m) => m.state !== "idle").slice(0, limit);
  const busiest = Math.max(1, ...modules.map((m) => m.todayLines));
  return (
    <>
      <div className="own-map">
        {shown.map((m) => (
          <div key={m.module} className="own-tile" data-state={m.state} title={`${m.module}: ${t(STATE_LABEL[m.state])}`}>
            <span className="own-tile-name">{breakable(m.module)}</span>
            <span className="own-tile-meta">
              {m.todayLines
                ? count(m.todayLines, "<0/> line today", "<0/> lines today")
                : count(m.lines, "<0/> line in all", "<0/> lines in all")}
            </span>
            <span className="own-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((100 * m.todayLines) / busiest)}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="own-legend">
        <span>
          <i style={{ "--st": "var(--orange)" } as never} />
          {t("Not explained")}
        </span>
        <span>
          <i style={{ "--st": "var(--green)" } as never} />
          {t("Yours")}
        </span>
        <span>
          <i style={{ "--st": "var(--blue)" } as never} />
          {t("Re-check due")}
        </span>
        <span>
          <i style={{ "--st": "var(--orange)" } as never} />
          {t("Changed since")}
        </span>
      </div>
    </>
  );
}
