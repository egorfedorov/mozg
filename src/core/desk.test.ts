import { test } from "node:test";
import assert from "node:assert/strict";
import { howItWentAhead, pickNext, buildDeskState, projectFor } from "./desk";
import { sampleDesk, sampleStore, SAMPLE_NOW } from "./sample";
import type { Change, Explain } from "./types";

const SOURCE = { path: "", offset: 0, length: 0 };

function ch(id: string, module: string, lines: number, hoursAgo: number, weight = 1): Change {
  return {
    id, toolUseId: `t-${id}`, session: "s", project: "/p", file: `${module}/x.ts`, module, tool: "edit",
    at: new Date(SAMPLE_NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    added: lines, removed: 0, weight, risks: [], goAheadMs: 4000, approvedBy: "auto", source: SOURCE,
  };
}

const now = SAMPLE_NOW;

test("the sample session adds up to the number the landing shows", () => {
  const desk = sampleDesk();
  assert.equal(desk.project, "/Users/ada/forge");
  assert.equal(desk.today.ownership, 48);
  assert.equal(desk.today.changes, 8);
  assert.equal(desk.today.unattended, 3);
  assert.equal(desk.today.approved, 5);
  assert.equal(desk.today.modulesTouched, 5);
  assert.equal(desk.today.modulesOwned, 3);
  assert.equal(desk.streak.days, 4);
  assert.equal(desk.streak.bugsFound, 1);
  assert.equal(desk.days.length, 14);
  assert.equal(desk.projects[0].name, "forge");
  // The last seven days by the module as it stands: eight edits in the four
  // modules that are not theirs. In the four that are, twelve, of which the
  // log says nobody was asked for three; the other nine a person approved.
  assert.deepEqual(desk.week, { free: 3, guarded: 8 });
});

test("nobody was asked is said only where the log says so", () => {
  const byRule = { ...ch("rule", "api", 10, 1), approvedBy: "auto" as const };
  const byPerson = { ...ch("person", "api", 10, 2), approvedBy: "user" as const };
  const notSaid = { ...ch("unknown", "api", 10, 3), approvedBy: "unknown" as const };
  const elsewhere = ch("other", "db", 10, 4);
  const explained: Explain[] = [{ id: "e", change: "rule", project: "/p", module: "api", question: "q", answer: "a", verdict: "explained", why: "", evidence: null, bug: null, at: now.toISOString(), examiner: "t" }];
  const state = buildDeskState({ changes: [byRule, byPerson, notSaid, elsewhere], explains: explained, now, project: "/p" });
  // One edit in a module that is theirs went ahead with nobody asked. The one
  // a person approved and the one the log does not speak of are theirs now,
  // and are in neither number: they saved no prompt and wait for none.
  assert.deepEqual(state.week, { free: 1, guarded: 1 });
});

test("the feed is ordered by urgency and ends in the week", () => {
  const desk = sampleDesk();
  assert.deepEqual(desk.feed.map((c) => c.state), [
    "bug", "explained", "explained", "unexplained", "unexplained", "unexplained", "changed", "due", "info",
  ]);
  // Every card that offers an explain-back names its own change, and only those do.
  for (const card of desk.feed) {
    const offers = card.state === "unexplained" || card.state === "changed" || card.state === "due";
    assert.equal(card.change !== null, offers, card.id);
    if (offers) assert.equal(card.action?.hint, `explain:${card.change}`, card.id);
  }
  // Monday to Wednesday: eight today, three yesterday, three on Monday.
  assert.match(desk.feed.at(-1)!.title, /This week: 14 agent changes in 7 modules\./);
});

test("the brain only says what the numbers say", () => {
  const { brain } = sampleDesk();
  assert.ok(brain.length >= 2 && brain.length <= 4);
  assert.ok(brain.some((l) => l.tone === "warn" && /payments/.test(l.text)));
  assert.ok(brain.some((l) => l.tone === "good" && /bug/.test(l.text)));
  // With nothing to show, it says so and invents nothing.
  const empty = buildDeskState({ changes: [], explains: [], now });
  assert.deepEqual(empty.brain.map((l) => l.text), ["I have not seen your agent change anything here yet."]);
  assert.equal(empty.today.ownership, null);
  assert.equal(empty.project, null);
});

test("the next change is the largest in the module with the most at stake", () => {
  const changes = [ch("a", "api", 10, 1), ch("b", "payments", 40, 2, 2), ch("c", "payments", 10, 3, 2)];
  const pick = pickNext("/p", changes, [], [{ module: "payments", state: "unexplained", weighted: 100 } as never, { module: "api", state: "unexplained", weighted: 10 } as never], now)!;
  assert.equal(pick.change.id, "b");
  // A change explained already is not offered again, and old changes age out.
  const explained: Explain[] = [{ id: "e", change: "b", project: "/p", module: "payments", question: "q", answer: "a", verdict: "explained", why: "", evidence: null, bug: null, at: now.toISOString(), examiner: "t" }];
  const views = [{ module: "payments", state: "unexplained", weighted: 100 } as never];
  assert.equal(pickNext("/p", changes, explained, views, now)!.change.id, "c");
  assert.equal(pickNext("/p", [ch("old", "payments", 40, 24 * 9, 2)], [], views, now), null);
  assert.equal(pickNext("/p", changes, [], [{ module: "payments", state: "explained", weighted: 100 } as never], now), null);
});

test("how a change went ahead is said only as far as the log allows", () => {
  const auto = { ...ch("a", "payments", 10, 1), approvedBy: "auto" as const };
  const user = { ...ch("b", "payments", 10, 1), approvedBy: "user" as const, goAheadMs: 40_000 };
  const unknown = { ...ch("c", "payments", 10, 1), approvedBy: "unknown" as const, goAheadMs: 1500 };
  const today = "2026-11-25";
  assert.equal(howItWentAhead("/p", "payments", [auto], today), "Went ahead on its own, once. Nobody was asked.");
  assert.equal(howItWentAhead("/p", "payments", [user], today), "You approved it in 40 s.");
  assert.equal(howItWentAhead("/p", "payments", [user, auto], today), "You approved it in 40 s. 1 went ahead with nobody asked.");
  assert.equal(howItWentAhead("/p", "payments", [unknown], today), "Went ahead in under 2 s. The log shows timing, not whether you read it.");
  assert.equal(howItWentAhead("/p", "payments", [], today), "");
});

test("the desk scopes to one project and defaults to the most recent", () => {
  const { changes } = sampleStore();
  const elsewhere = { ...changes[0], id: "z", project: "/Users/ada/other", at: new Date(now.getTime() + 60_000).toISOString() };
  const both = buildDeskState({ changes: [...changes, elsewhere], explains: [], now });
  assert.equal(both.projects.length, 2);
  assert.equal(both.project, "/Users/ada/other", "the newest change decides");
  const forge = buildDeskState({ changes: [...changes, elsewhere], explains: [], now, project: "/Users/ada/forge" });
  assert.equal(forge.project, "/Users/ada/forge");
  assert.equal(forge.today.changes, 8);
});

test("the project an agent is in is the folder itself or the project holding it", () => {
  const changes = [...sampleStore().changes, { ...sampleStore().changes[0], id: "sub", project: "/Users/ada/monorepo" }];
  assert.equal(projectFor("/Users/ada/forge", changes), "/Users/ada/forge");
  assert.equal(projectFor("/Users/ada/forge/src/x/", changes), "/Users/ada/forge", "a trailing slash and a deeper folder are still that project");
  assert.equal(projectFor("/Users/ada/nothing-here", changes), null, "an unknown folder is nobody's, not the newest project's");
  assert.equal(projectFor(null, changes), null);
});

test("a hidden project is left out of every number on the desk", () => {
  const { changes, explains } = sampleStore();
  const elsewhere = { ...changes[0], id: "z", project: "/Users/ada/secret", module: "keys", at: new Date(now.getTime() + 60_000).toISOString() };
  const shown = buildDeskState({ changes: [...changes, elsewhere], explains, now });
  assert.deepEqual(shown.projects.map((p) => p.project).sort(), ["/Users/ada/forge", "/Users/ada/secret"]);
  assert.equal(shown.project, "/Users/ada/secret", "the newest change decides while it is on the desk");

  const hidden = buildDeskState({ changes: [...changes, elsewhere], explains, now, hidden: ["/Users/ada/secret"] });
  assert.deepEqual(hidden.projects.map((p) => p.project), ["/Users/ada/forge"]);
  assert.equal(hidden.project, "/Users/ada/forge");
  assert.equal(hidden.today.ownership, 48, "the sample's numbers, untouched by what is hidden");

  // An explain-back in a hidden project is not part of the streak either.
  const secretPass: Explain = { ...explains[0], id: "secret", project: "/Users/ada/secret", at: new Date(explains[0].at).toISOString() };
  const withSecret = buildDeskState({ changes, explains: [...explains, secretPass], now });
  const withoutSecret = buildDeskState({ changes, explains: [...explains, secretPass], now, hidden: ["/Users/ada/secret"] });
  assert.equal(withSecret.streak.explainedTotal, withoutSecret.streak.explainedTotal + 1);

  // Everything hidden is an empty desk, and still not an error.
  const none = buildDeskState({ changes, explains, now, hidden: ["/Users/ada/forge", "/Users/ada/secret"] });
  assert.equal(none.project, null);
  assert.deepEqual(none.feed, []);
});
