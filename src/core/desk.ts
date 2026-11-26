/**
 * What the desk shows, computed from the store.
 *
 * Everything here is derived and nothing is invented: the cards, the brain's
 * lines and the big number are all functions of changes and explain-backs. The
 * landing shows the same view-model on a sample, so the sample and the real
 * desk can never disagree about what the product looks like.
 */

import { LANG_TAG, count, fill, getLanguage, msg, sentences, t } from "@/lib/i18n";
import { addDays, dayKey, daysBetween, startOfDay } from "./time";
import { NO_PAUSE_MS, daysView, moduleViews, ownershipOn, streakOf } from "./ownership";
import type { Change, DeskState, Explain, FeedCard, ModuleView } from "./types";

/** How far back a change is still worth explaining. */
export const LOOKBACK_DAYS = 7;
const DAYS_SHOWN = 14;

/** How a duration reads in a card. */
export function duration(ms: number | null): string {
  if (ms === null) return t("an unknown time");
  if (ms < NO_PAUSE_MS) return t("under 2 s");
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} ${t("s")}`;
  return `${Math.max(1, Math.round(ms / 60_000))} ${t("min")}`;
}

export function ago(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (mins < 1) return t("just now");
  if (mins < 60) return count(mins, "<0/> min ago", "<0/> min ago");
  const hours = Math.round(mins / 60);
  if (hours < 24) return count(hours, "<0/> h ago", "<0/> h ago");
  const days = Math.max(1, Math.round(hours / 24));
  return count(days, "<0/> day ago", "<0/> days ago");
}

export function projectName(project: string): string {
  return project.replace(/\/+$/, "").split("/").filter(Boolean).pop() || project || t("this project");
}

const CANDIDATE = new Set(["unexplained", "changed", "due"]);

export interface Pick {
  change: Change;
  view: ModuleView;
}

/**
 * The change to offer for each module: the largest recent one that has not
 * been explained. One per module, so every card that says "explain" can name
 * the change it means, and not only the most urgent card.
 */
export function candidates(
  project: string,
  changes: Change[],
  explains: Explain[],
  now: Date,
): Map<string, Change> {
  const explained = new Set(explains.filter((e) => e.verdict === "explained").map((e) => e.change));
  const since = startOfDay(addDays(now, -(LOOKBACK_DAYS - 1))).getTime();
  const size = (c: Change) => c.added + c.removed;
  const best = new Map<string, Change>();
  for (const c of changes) {
    if (c.project !== project || c.weight === 0 || Date.parse(c.at) < since || explained.has(c.id)) continue;
    const have = best.get(c.module);
    if (!have || size(c) > size(have)) best.set(c.module, c);
  }
  return best;
}

/**
 * The next change worth a person's minute: the one on offer in the module with
 * the most at stake.
 */
export function pickNext(
  project: string,
  changes: Change[],
  explains: Explain[],
  views: ModuleView[],
  now: Date,
): Pick | null {
  const offer = candidates(project, changes, explains, now);
  let out: Pick | null = null;
  for (const view of views) {
    if (!CANDIDATE.has(view.state)) continue;
    const change = offer.get(view.module);
    if (!change) continue;
    if (!out || view.weighted > out.view.weighted) out = { change, view };
  }
  return out;
}

function sameWeek(day: Date, now: Date): boolean {
  const monday = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
  return monday(day).getTime() === monday(now).getTime();
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? null;

/**
 * How one module's changes today went ahead, said only as far as the log
 * allows. Who approved is a fact the log records; how long somebody looked is
 * not, so timing is never dressed up as reading.
 */
export function howItWentAhead(project: string, module: string, changes: Change[], today: string): string {
  const mine = changes.filter(
    (c) => c.project === project && c.module === module && dayKey(new Date(c.at)) === today,
  );
  if (!mine.length) return "";
  const auto = mine.filter((c) => c.approvedBy === "auto").length;
  const byUser = median(mine.filter((c) => c.approvedBy === "user" && c.goAheadMs !== null).map((c) => c.goAheadMs!));

  if (byUser !== null) {
    const rest = auto ? count(auto, "<0/> went ahead with nobody asked.", "<0/> went ahead with nobody asked.") : "";
    return sentences(fill(t("You approved it in <0/>."), [duration(byUser)]), rest).trim();
  }
  if (auto) return count(auto, "Went ahead on its own, once. Nobody was asked.", "Went ahead on its own, <0/> times. Nobody was asked.");
  const timed = median(mine.filter((c) => c.goAheadMs !== null).map((c) => c.goAheadMs!));
  if (timed === null) return t("The log does not say how this went ahead.");
  return fill(t("Went ahead in <0/>. The log shows timing, not whether you read it."), [duration(timed)]);
}

/** Cards for one project's state, most urgent first. */
export function feedCards(
  project: string,
  changes: Change[],
  explains: Explain[],
  views: ModuleView[],
  now: Date,
): FeedCard[] {
  const today = dayKey(now);
  const cards: FeedCard[] = [];
  const push = (card: FeedCard) => cards.push(card);
  const lines = (v: ModuleView) => v.lines;

  for (const e of explains) {
    if (e.project !== project || !e.bug?.found || dayKey(new Date(e.at)) !== today) continue;
    push({
      id: `bug-${e.id}`,
      state: "bug",
      title: fill(t("<0/> · you found a bug by explaining"), [e.module]),
      text: e.bug.note,
      action: { label: t("Show the answer"), hint: `explain:${e.id}` },
      change: null,
      module: e.module,
    });
  }

  const explainedToday = views.filter(
    (v) => v.lastExplainedAt && dayKey(new Date(v.lastExplainedAt)) === today && v.state === "explained",
  );
  for (const v of explainedToday.slice(0, 2)) {
    push({
      id: `explained-${v.module}`,
      state: "explained",
      title: fill(t("<0/> is yours now."), [v.module]),
      text: fill(t("Explained <0/>."), [ago(v.lastExplainedAt!, now)]),
      action: null,
      change: null,
      module: v.module,
    });
  }

  const offer = candidates(project, changes, explains, now);
  const unexplained = views.filter((v) => v.state === "unexplained").slice(0, 3);
  for (const v of unexplained) {
    const link = offer.get(v.module)?.id ?? null;
    push({
      id: `unexplained-${v.module}`,
      state: "unexplained",
      title: v.module,
      // Touched today, the card says how it went ahead; otherwise it says when,
      // so that no card asks for a minute without saying why.
      text: `${count(v.changes, "<0/> change", "<0/> changes")}, ${count(lines(v), "<0/> line", "<0/> lines")}. ${
        howItWentAhead(project, v.module, changes, today) || (v.lastChangeAt ? fill(t("Last changed <0/>."), [ago(v.lastChangeAt, now)]) : "")
      }`,
      action: { label: t("Explain · 60 s"), hint: `explain:${link ?? ""}` },
      change: link,
      module: v.module,
    });
  }

  for (const v of views.filter((x) => x.state === "changed").slice(0, 2)) {
    const link = offer.get(v.module)?.id ?? null;
    push({
      id: `changed-${v.module}`,
      state: "changed",
      title: fill(t("<0/> was yours. The agent has been back."), [v.module]),
      text: count(v.sinceExplained, "<0/> line changed since you explained it.", "<0/> lines changed since you explained it."),
      action: { label: t("Explain · 60 s"), hint: `explain:${link ?? ""}` },
      change: link,
      module: v.module,
    });
  }

  for (const v of views.filter((x) => x.state === "due").slice(0, 2)) {
    const days = v.lastExplainedAt ? Math.max(1, daysBetween(new Date(v.lastExplainedAt), now)) : 0;
    const link = offer.get(v.module)?.id ?? null;
    push({
      id: `due-${v.module}`,
      state: "due",
      title: fill(t("<0/> · time for a re-check"), [v.module]),
      text: fill(t("Last explained <0/>."), [count(days, "<0/> day ago", "<0/> days ago")]),
      action: { label: t("Re-check · 60 s"), hint: `explain:${link ?? ""}` },
      change: link,
      module: v.module,
    });
  }

  const week = changes.filter((c) => c.project === project && sameWeek(new Date(c.at), now));
  const weekModules = new Set(week.map((c) => c.module));
  const owned = views.filter((v) => weekModules.has(v.module) && (v.state === "explained" || v.state === "due")).length;
  if (week.length) {
    push({
      id: "info-week",
      state: "info",
      title: `${count(week.length, "This week: <0/> agent change", "This week: <0/> agent changes")}${count(weekModules.size, " in <0/> module.", " in <0/> modules.")}`,
      text:
        weekModules.size === 1
          ? fill(t("You can vouch for <0/> of it."), [owned])
          : fill(t("You can vouch for <0/> of the <1/>."), [owned, weekModules.size]),
      action: null,
      change: null,
      module: null,
    });
  }
  return cards;
}

/** The brain, in the first person. Every line is a fact from the numbers. */
export function brainLines(views: ModuleView[], explains: Explain[], project: string, now: Date): DeskState["brain"] {
  const out: DeskState["brain"] = [];
  const today = dayKey(now);
  if (!views.length) {
    out.push({ tone: "plain", text: t("I have not seen your agent change anything here yet.") });
    return out;
  }
  const bug = explains.some((e) => e.project === project && e.bug?.found && dayKey(new Date(e.at)) === today);
  if (bug) out.push({ tone: "good", text: t("That one had a real bug in it. You found it by explaining.") });

  const mine = views.filter((v) => v.lastExplainedAt && dayKey(new Date(v.lastExplainedAt)) === today && v.state === "explained");
  if (mine.length) {
    out.push({ tone: "good", text: fill(t(mine.length === 1 ? msg("<0/> is mine now.") : msg("<0/> are mine now.")), [mine.map((v) => v.module).join(t(" and "))]) });
  }
  const blind = views.filter((v) => v.state === "unexplained" || v.state === "changed").slice(0, 2);
  if (blind.length) {
    out.push({
      tone: "warn",
      text: fill(t("I still cannot vouch for <0/>. Explain one to me?"), [blind.map((v) => v.module).join(t(" or "))]),
    });
  } else if (views.length) {
    out.push({ tone: "good", text: t("Everything your agent touched here, I can vouch for.") });
  }
  return out.slice(0, 4);
}

/**
 * The project an agent is working in, as mozg names projects: the working
 * folder itself, or the project that contains it. A folder inside a project is
 * part of that project, not a project of its own. Null when nothing is known
 * there, and then nobody may speak for another project in its place.
 */
export function projectFor(cwd: string | null, changes: Change[]): string | null {
  const here = cwd?.replace(/\/+$/, "") || null;
  if (!here) return null;
  return changes
    .map((c) => c.project)
    .filter((p): p is string => Boolean(p) && (here === p || here.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

export interface DeskInput {
  changes: Change[];
  explains: Explain[];
  now: Date;
  project?: string | null;
  /** Projects taken off the desk. Left out of every number on it. */
  hidden?: string[];
}

export function buildDeskState({ changes: all, explains: allExplains, now, project, hidden = [] }: DeskInput): DeskState {
  // A hidden project is left out here, at the door, so that no count further
  // down has to remember it.
  const away = new Set(hidden);
  const changes = all.filter((c) => !away.has(c.project));
  const explains = allExplains.filter((e) => !away.has(e.project));
  const projects = [...new Set(changes.map((c) => c.project))]
    .map((p) => ({
      project: p,
      name: projectName(p),
      lastChangeAt: changes.filter((c) => c.project === p).reduce((m, c) => (c.at > m ? c.at : m), ""),
    }))
    .sort((a, b) => b.lastChangeAt.localeCompare(a.lastChangeAt));

  const current = project && projects.some((p) => p.project === project) ? project : (projects[0]?.project ?? null);
  const mine = current ? changes.filter((c) => c.project === current) : [];
  const myExplains = explains.filter((e) => !current || e.project === current);

  const views = current ? moduleViews(current, changes, explains, now) : [];
  const today = dayKey(now);
  const todayChanges = mine.filter((c) => dayKey(new Date(c.at)) === today);
  const { pct } = current ? ownershipOn(today, current, changes, views) : { pct: null };
  const touched = views.filter((v) => v.todayLines > 0);

  const streak = streakOf(explains, now);
  const days = current ? daysView(now, DAYS_SHOWN, current, changes, explains, views) : [];

  // What explaining buys, in edits: those in a module that is theirs, and
  // that the log says nobody was asked for. The module is taken as it stands
  // now. An edit the person approved before they explained the module is in a
  // module that is theirs now, but it was asked for, and is not counted:
  // "none asked" is said only where the log says so.
  const weekSince = startOfDay(addDays(now, -(LOOKBACK_DAYS - 1))).getTime();
  const modeOf = new Map(views.map((v) => [v.module, v.mode]));
  const week = mine.filter((c) => c.weight > 0 && Date.parse(c.at) >= weekSince);
  const free = week.filter((c) => modeOf.get(c.module) === "free" && c.approvedBy === "auto").length;

  return {
    generatedAt: now.toISOString(),
    projects,
    project: current,
    today: {
      ownership: pct,
      changes: todayChanges.length,
      lines: todayChanges.reduce((n, c) => n + c.added + c.removed, 0),
      words: todayChanges.filter((c) => c.weight === 0).length,
      modulesTouched: touched.length,
      modulesOwned: touched.filter((v) => v.state === "explained" || v.state === "due").length,
      unattended: todayChanges.filter((c) => c.approvedBy === "auto").length,
      approved: todayChanges.filter((c) => c.approvedBy === "user").length,
    },
    streak: {
      days: streak.days,
      best: streak.best,
      explainedTotal: explains.filter((e) => e.verdict === "explained").length,
      bugsFound: explains.filter((e) => e.bug?.found).length,
    },
    // An edit a person approved in a module that is theirs now is in neither
    // number: it is neither a prompt that was saved nor one still to come.
    week: { free, guarded: week.filter((c) => modeOf.get(c.module) !== "free").length },
    feed: current ? feedCards(current, changes, explains, views, now) : [],
    modules: views,
    days,
    explains: [...myExplains].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    brain: brainLines(views, explains, current ?? "", now),
    pending: current ? views.filter((v) => CANDIDATE.has(v.state) && Date.parse(v.lastChangeAt ?? "") >= startOfDay(addDays(now, -(LOOKBACK_DAYS - 1))).getTime()).length : 0,
  };
}

/** The day in a few lines, to paste into a journal, a PR or a chat. */
export function recapText(state: DeskState): string {
  // Spoken to the person, and pasted by them somewhere else: so it goes
  // through `t()`, number by number, like everything else they read.
  const date = new Date(state.generatedAt);
  const when = date.toLocaleDateString(LANG_TAG[getLanguage()], { weekday: "short", day: "numeric", month: "short" });
  const t0 = state.today;
  const worth = state.modules.filter((v) => v.state === "unexplained" || v.state === "changed" || v.state === "due").map((v) => v.module);
  return [
    `mozg · ${state.project ? projectName(state.project) : "—"} · ${when}`,
    t0.ownership === null
      ? t("Ownership today: nothing to own yet.")
      : fill(count(t0.modulesTouched, "Ownership today: <1/>%. Yours: <2/> of the <0/> module it touched.", "Ownership today: <1/>%. Yours: <2/> of the <0/> modules it touched."), [
          // In the order of the slots: <0/> touched, <1/> the score, <2/> yours.
          t0.modulesTouched,
          t0.ownership,
          t0.modulesOwned,
        ]),
    t0.changes
      ? `${count(t0.changes, "Agent changes today: <0/> change", "Agent changes today: <0/> changes")} (${count(t0.lines, "<0/> line", "<0/> lines")}${t0.words ? ` · ${count(t0.words, "<0/> in words only, not counted", "<0/> in words only, not counted")}` : ""}) · ${count(
          t0.unattended,
          "<0/> with nobody asked",
          "<0/> with nobody asked",
        )} · ${count(t0.approved, "<0/> approved by a person", "<0/> approved by a person")}`
      : t("Agent changes today: none"),
    `${t("Streak")}: ${count(state.streak.days, "<0/> day", "<0/> days")} · ${t("explained in all")}: ${state.streak.explainedTotal} · ${t("bugs found by explaining")}: ${state.streak.bugsFound}`,
    state.week.free + state.week.guarded === 0
      ? t("This week: the agent changed nothing here.")
      : `${t("This week")}: ${count(state.week.free, "<0/> agent edit in modules that are yours, none asked", "<0/> agent edits in modules that are yours, none asked")} · ${count(
          state.week.guarded,
          "<0/> in modules to explain",
          "<0/> in modules to explain",
        )}`,
    worth.length ? `${t("Still to explain")}: ${worth.slice(0, 6).join(", ")}` : t("Nothing left to explain."),
  ].join("\n");
}
