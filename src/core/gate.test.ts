import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "./store";
import { registerDictionary, setLanguage, type Dictionary } from "@/lib/i18n";
import { decideGate, type GateFacts, type GateInput } from "./gate";
import { SAMPLE_NOW, SAMPLE_PROJECT, sampleStore } from "./sample";
import type { ModuleView, Settings } from "./types";

const FORGE = SAMPLE_PROJECT;

function facts(settings: Partial<Settings> = {}, asked: Record<string, string> = {}): GateFacts {
  const { changes, explains } = sampleStore();
  return {
    changes,
    explains,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    askedAt: (session, module) => (session === "s1" && asked[module]) || null,
  };
}

const edit = (file: string, extra: Partial<GateInput> = {}): GateInput => ({ file, cwd: FORGE, session: "s1", ...extra });

test("an explained module is the agent's to work in, and nobody is asked", () => {
  for (const file of ["src/api/routes.ts", "src/auth/session.ts", "src/ui/board.tsx", "src/storage/objects.ts"]) {
    assert.equal(decideGate(edit(file), facts(), SAMPLE_NOW).kind, "pass", file);
  }
});

test("a module that is not explained is put to the person, with the reason why", () => {
  const out = decideGate(edit("src/db/migrations/0043_ledger.sql"), facts(), SAMPLE_NOW);
  assert.equal(out.kind, "ask");
  if (out.kind !== "ask") return;
  assert.equal(out.module, "src/db/migrations");
  assert.match(out.reason, /^mozg asks before this change\. src\/db\/migrations is not explained yet: 1 change by the agent, none talked through\. /);
  assert.match(out.reason, /explain-back/);
  assert.match(out.why, /^src\/db\/migrations is not explained yet/);
  assert.match(out.next, /^Approve to let this one through\./);
  assert.equal(out.reason, `mozg asks before this change. ${out.why} ${out.next}`);

  // It was explained, and the agent has rewritten it since.
  const changed = decideGate(edit("src/payments/charge.ts"), facts(), SAMPLE_NOW);
  assert.equal(changed.kind, "ask");
  if (changed.kind === "ask") assert.match(changed.reason, /src\/payments was yours, but the agent has changed 444 lines there since you explained it\./);

  // A module mozg has never seen the agent touch.
  const first = decideGate(edit("src/brand/palette.ts"), facts(), SAMPLE_NOW);
  assert.equal(first.kind, "ask");
  if (first.kind === "ask") assert.match(first.reason, /src\/brand has never been changed here, and nobody has explained it\./);
});

test("it asks once per module per session, and again in the next session", () => {
  const once = facts({}, { "src/db/migrations": SAMPLE_NOW.toISOString() });
  assert.equal(decideGate(edit("src/db/migrations/0043_ledger.sql"), once, SAMPLE_NOW).kind, "pass", "asked already in this session");
  assert.equal(decideGate(edit("src/payments/charge.ts"), once, SAMPLE_NOW).kind, "ask", "another module is still asked about");
  assert.equal(decideGate(edit("src/db/migrations/0043_ledger.sql", { session: "s2" }), once, SAMPLE_NOW).kind, "ask", "a new session asks again");
});

test("where a prompt would reach nobody, the gate says nothing", () => {
  for (const permissionMode of ["bypassPermissions", "dontAsk"]) {
    assert.equal(decideGate(edit("src/db/migrations/0043_ledger.sql", { permissionMode }), facts(), SAMPLE_NOW).kind, "pass", permissionMode);
  }
  for (const permissionMode of ["default", "acceptEdits", "plan", undefined, null]) {
    assert.equal(decideGate(edit("src/db/migrations/0043_ledger.sql", { permissionMode: permissionMode ?? undefined }), facts(), SAMPLE_NOW).kind, "ask", String(permissionMode));
  }
});

test("switched off, hidden, or outside the project: nothing is asked", () => {
  const file = "src/db/migrations/0043_ledger.sql";
  assert.equal(decideGate(edit(file), facts({ asks: false }), SAMPLE_NOW).kind, "pass", "the setting");
  assert.equal(decideGate(edit(file), facts({ hidden: [FORGE] }), SAMPLE_NOW).kind, "pass", "a project taken off the desk");
  assert.equal(decideGate(edit("/somewhere/else/x.ts"), facts(), SAMPLE_NOW).kind, "pass", "a file that is not in the project");
  assert.equal(decideGate(edit("~/notes/x.md"), facts(), SAMPLE_NOW).kind, "pass", "nor one in the home folder");
});

test("the file is placed as the tool gave it: relative to where the agent is, even in a sub-folder", () => {
  assert.equal(decideGate(edit("db/migrations/0044.sql", { cwd: `${FORGE}/src` }), facts(), SAMPLE_NOW).kind, "ask");
  assert.equal(decideGate(edit("api/routes.ts", { cwd: `${FORGE}/src/` }), facts(), SAMPLE_NOW).kind, "pass");
  // A project mozg has never seen is its own project, and nothing in it is explained.
  const fresh = decideGate(edit("app/models/order.ts", { cwd: "/Users/ada/new" }), facts(), SAMPLE_NOW);
  assert.equal(fresh.kind, "ask");
  if (fresh.kind === "ask") assert.equal(fresh.module, "app/models", "the same module the desk would name");
});

test("the view it decides on is the same one the desk shows", async () => {
  const { changes, explains } = sampleStore();
  const { moduleViews } = await import("./ownership");
  const views: ModuleView[] = moduleViews(FORGE, changes, explains, SAMPLE_NOW);
  for (const view of views) {
    const file = view.module === "(root)" ? "next.config.ts" : `${view.module}/x.ts`;
    assert.equal(decideGate(edit(file), facts(), SAMPLE_NOW).kind, view.mode === "free" ? "pass" : "ask", view.module);
  }
});

test("a reason is one sentence with its number in a slot, so a language puts it where it wants it", () => {
  registerDictionary("de", {
    "<0/> was yours, but the agent has changed <1/> there since you explained it.": "Seit du <0/> erklärt hast, hat der Agent dort <1/> geändert, obwohl es deins war.",
    "<0/> line": "<0/> Zeile",
    "<0/> lines": "<0/> Zeilen",
  } satisfies Dictionary);
  setLanguage("de");
  const out = decideGate(edit("src/payments/charge.ts"), facts(), SAMPLE_NOW);
  if (out.kind !== "ask") throw new Error("expected a question");
  assert.equal(out.why, "Seit du src/payments erklärt hast, hat der Agent dort 444 Zeilen geändert, obwohl es deins war.");

  // A language that writes no spaces between words gets none it did not ask
  // for, and a counted phrase of its own sits in the slot as it is, once.
  registerDictionary("zh", {
    "<0/> is not explained yet: <1/> by the agent, none talked through.": "<0/> 还没有回讲过：智能体改动的 <1/>，一处都没讲过。",
    "<0/> change": "<0/> 处改动",
    "<0/> changes": "<0/> 处改动",
  } satisfies Dictionary);
  setLanguage("zh");
  const notYet = decideGate(edit("src/db/migrations/0042_x.sql"), facts(), SAMPLE_NOW);
  if (notYet.kind !== "ask") throw new Error("expected a question");
  assert.equal(notYet.why, "src/db/migrations 还没有回讲过：智能体改动的 1 处改动，一处都没讲过。");
  setLanguage("en");
});
