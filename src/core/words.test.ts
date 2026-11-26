import { test } from "node:test";
import assert from "node:assert/strict";
import { isWords, moduleOf, risksOf, weightOf } from "./change";
import { candidates } from "./desk";
import { decideGate, type GateFacts, type GateInput } from "./gate";
import { moduleViews, ownershipOn } from "./ownership";
import { SAMPLE_NOW, SAMPLE_PROJECT, sampleStore } from "./sample";
import { DEFAULT_SETTINGS } from "./store";
import type { Change, Explain, ModuleView, Settings } from "./types";

/**
 * A change that is only words: a README, a licence, a changelog. The agent
 * makes them all the time, and nobody has to explain a sentence to own a
 * module. They are noted, and counted for nothing.
 */

const FORGE = SAMPLE_PROJECT;
const at = "2026-11-25T10:00:00.000Z";

function change(file: string, extra: Partial<Change> = {}): Change {
  const risks = risksOf(file, 10, 2, "");
  return {
    id: file, toolUseId: `t-${file}`, session: "s", project: FORGE, file, module: moduleOf(file), tool: "edit",
    at, added: 10, removed: 2, weight: weightOf(risks), risks, goAheadMs: 300, approvedBy: "auto", source: { path: "x.jsonl", offset: 0, length: 1 }, ...extra,
  };
}

test("words are told by their name alone", () => {
  for (const file of ["README.md", "docs/guide.md", "CHANGELOG", "LICENSE", "LICENSE.md", "src/NOTES.rst", "docs/usage.mdx"]) {
    assert.equal(isWords(file), true, file);
    assert.deepEqual(risksOf(file, 300, 0, "drop table users;"), ["docs"], `${file}: whatever it quotes`);
    assert.equal(weightOf(risksOf(file, 300, 0, "")), 0, file);
  }
  for (const file of ["src/api/auth.ts", "requirements.txt", "src/readme.ts", "mkdocs.yml", "Dockerfile", "notes.md.tsx"]) {
    assert.equal(isWords(file), false, file);
  }
});

test("words do not make a module, and do not dilute the score", () => {
  const code = [change("src/payments/charge.ts"), change("src/api/routes.ts")];
  const words = [change("README.md"), change("CHANGELOG.md")];
  const views = moduleViews(FORGE, [...code, ...words], [], SAMPLE_NOW);
  assert.deepEqual(views.map((v) => v.module), ["src/payments", "src/api"]);
  const day = SAMPLE_NOW.toISOString().slice(0, 10);
  const all = ownershipOn(day, FORGE, [...code, ...words], views);
  const only = ownershipOn(day, FORGE, code, views);
  assert.deepEqual(all, only);
});

test("words are not offered for an explain-back", () => {
  const changes = [change("README.md", { added: 400 }), change("src/ui/Panel.tsx", { added: 20 })];
  const offer = candidates(FORGE, [...changes, change("README.md", { added: 400 })].map((c, i) => ({ ...c, id: `${c.id}-${i}` })), [], SAMPLE_NOW);
  assert.deepEqual([...offer.keys()], ["src/ui"]);
});

test("a README is never put to the person, whatever else is unexplained", () => {
  const { changes, explains } = sampleStore();
  const facts = (settings: Partial<Settings> = {}): GateFacts => ({
    changes, explains, settings: { ...DEFAULT_SETTINGS, ...settings },
    askedAt: () => null,
  });
  const edit = (file: string): GateInput => ({ file, cwd: FORGE, session: "s-words", permissionMode: "default" });
  assert.equal(decideGate(edit(`${FORGE}/README.md`), facts(), SAMPLE_NOW).kind, "pass");
  assert.equal(decideGate(edit(`${FORGE}/docs/guide.md`), facts(), SAMPLE_NOW).kind, "pass");
  // A folder mozg has never seen asks for its code, and not for its words.
  const fresh = (file: string) => decideGate({ file, cwd: "/Users/ada/new", session: "s", permissionMode: "default" }, { changes, explains, settings: DEFAULT_SETTINGS, askedAt: () => null }, SAMPLE_NOW);
  assert.equal(fresh("/Users/ada/new/README.md").kind, "pass");
  assert.equal(fresh("/Users/ada/new/src/index.ts").kind, "ask");
});

test("once a module has code, its words are still not what the person is asked to explain", () => {
  const code = change("tsconfig.json", { added: 4 });
  const words = change("README.md", { added: 900 });
  const both = [{ ...code, id: "code" }, { ...words, id: "words" }] as Change[];
  const views: ModuleView[] = moduleViews(FORGE, both, [], SAMPLE_NOW);
  assert.deepEqual(views.map((v) => [v.module, v.lines]), [["(root)", 6]]);
  const explain: Explain = { id: "e", change: "code", project: FORGE, module: "(root)", question: "q", answer: "a", verdict: "explained", why: "w", evidence: null, bug: null, at: SAMPLE_NOW.toISOString(), examiner: "test" } as Explain;
  assert.equal(moduleViews(FORGE, both, [explain], SAMPLE_NOW)[0].mode, "free");
});
