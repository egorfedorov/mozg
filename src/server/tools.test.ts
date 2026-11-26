import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLE_NOW, sampleStore } from "@/core/sample";
import { Store } from "@/core/store";
import { EXAMINER, TOOLS, toolByName, type Ctx } from "./tools";

process.env.MOZG_CLAUDE_PROJECTS = await mkdtemp(join(tmpdir(), "mozg-nologs-"));

async function loaded(): Promise<Ctx> {
  const store = await Store.open(await mkdtemp(join(tmpdir(), "mozg-tools-")));
  const { changes, explains } = sampleStore();
  for (const e of explains) await store.addExplain(e);
  await store.record(changes, {});
  return { store, now: SAMPLE_NOW };
}

test("every tool is fully described, because the description decides whether it is used", () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of TOOLS) {
    assert.match(tool.name, /^mozg_[a-z]+$/);
    assert.ok(tool.description.length > 120, `${tool.name} says when to call it`);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(tool.inputSchema).sort(), ["additionalProperties", "properties", "required", "type"].filter((k) => k in tool.inputSchema).sort());
    assert.ok(toolByName(tool.name));
  }
});

test("status says what is owned, what is waiting, and what to do next", async () => {
  const out = await toolByName("mozg_status")!.run({}, await loaded());
  assert.equal(out.isError, undefined);
  assert.match(out.text, /^mozg · forge\n/);
  assert.match(out.text, /Ownership today: 48%\. 3 of the 5 modules/);
  assert.match(out.text, /Agent changes today: 8 changes \(\d+ lines\)\. 3 went ahead with nobody asked; 5 a person approved\./);
  assert.match(out.text, /Worth explaining \(5\): src\/payments, src\/storage, src\/db\/migrations, \(root\), \.github\./);
  assert.match(out.text, /call mozg_next and ask the question it gives you\.$/);
});

test("next hands over the riskiest change and tells the agent to wait for the answer", async () => {
  const out = await toolByName("mozg_next")!.run({}, await loaded());
  assert.match(out.text, /^Explain-back · change sample-\d+/);
  assert.match(out.text, /module src\/payments\) · \d+ lines · it went ahead with nobody asked/);
  assert.match(out.text, /Worth a question because: payments/);
  assert.match(out.text, /This module: was explained once; the agent has rewritten it since\./);
  assert.match(out.text, /the log line holding this change's text is gone/i);
  assert.match(out.text, /Ask the user ONE question about this change[\s\S]*wait for the answer\./);
  assert.match(out.text, new RegExp(EXAMINER));
});

test("record refuses what cannot be graded, and explains itself", async () => {
  const ctx = await loaded();
  const record = toolByName("mozg_record")!;
  const pick = await toolByName("mozg_next")!.run({}, ctx);
  const id = pick.text.match(/change (sample-\d+)/)![1];
  const base = { change: id, question: "What happens when the charge is declined?", verdict: "explained", why: "Named the retry and the refund path." };
  const written = ctx.store.explains.length;

  assert.match((await record.run({ ...base, change: "nope" }, ctx)).text, /No change with that id/);
  assert.match((await record.run({ ...base, verdict: "fine", answer: "It retries, then refunds." }, ctx)).text, /verdict must be/);
  assert.match((await record.run({ ...base, answer: "" }, ctx)).text, /needs the question and the person's answer/);
  assert.match((await record.run({ ...base, answer: "ok" }, ctx)).text, /too short to grade/);
  assert.equal(ctx.store.explains.length, written, "nothing was written by a refused record");
});

test("record stores the verdict and the reply follows from it", async () => {
  const ctx = await loaded();
  const record = toolByName("mozg_record")!;
  const before = (await toolByName("mozg_status")!.run({}, ctx)).text;
  assert.match(before, /Ownership today: 48%\./);

  const out = await record.run(
    {
      change: "sample-0",
      question: "What happens when the charge is declined?",
      answer: "It retries twice with backoff, then marks the invoice unpaid and emits charge.failed.",
      verdict: "explained",
      why: "Named the retry count, the backoff and the terminal state.",
      evidence: "+ if (!charge.paid) await invoice.markUnpaid()",
      bug_found: true,
      bug_note: "The retry counter is never reset after a success.",
    },
    ctx,
  );
  assert.equal(out.isError, undefined);
  // The newest record, not the sample's own explain for the same change.
  const stored = [...ctx.store.explains].sort((a, b) => b.at.localeCompare(a.at))[0];
  assert.equal(stored.change, "sample-0");
  assert.equal(stored.verdict, "explained");
  assert.equal(stored.examiner, EXAMINER);
  assert.equal(stored.bug?.note, "The retry counter is never reset after a success.");
  // Payments carries most of today's weight, so owning it moves the number.
  assert.match(out.text, /^Recorded: explained\.\nsrc\/payments is yours now\.\nOwnership today: \d+%\./);
  assert.match(out.text, /Bug recorded: The retry counter/);
  assert.match(out.text, /Still worth explaining: .*Call mozg_next/);

  const miss = await record.run({ change: "sample-3", question: "q?", answer: "No idea, honestly.", verdict: "not_yet", why: "Nothing to grade." }, ctx);
  assert.match(miss.text, /Recorded: not_yet\.\nNot yet\. Nothing is lost/);
});

test("map lists every module with its state and what the agent does there", async () => {
  const out = await toolByName("mozg_map")!.run({}, await loaded());
  const lines = out.text.split("\n");
  assert.match(lines[0], /^Ownership map · forge$/);
  assert.match(out.text, /^src\/payments\s+changed\s+asks\s+\d+ lines, explained 9 days ago$/m);
  assert.match(out.text, /^src\/api\s+explained\s+runs free\s+\d+ lines, explained today$/m);
  assert.match(out.text, /Asks in: src\/payments, src\/db\/migrations, \(root\), \.github\./);
});

test("a change that is only words is said to be a change, and where mozg says nothing is said exactly", async () => {
  const ctx = await loaded();
  // Any change of today, for its time: everything else about it is replaced.
  const any = ctx.store.changes.find((c) => new Date(c.at).toDateString() === SAMPLE_NOW.toDateString())!;
  await ctx.store.record(
    [{ ...any, id: "readme-today", toolUseId: "readme-today", file: "README.md", module: "(root)", added: 12, removed: 0, weight: 0, risks: ["docs"] }],
    {},
  );
  // After the lines, so that "of them" can only mean the changes.
  assert.match((await toolByName("mozg_status")!.run({}, ctx)).text, /Agent changes today: 9 changes \(\d+ lines\), 1 of them in words only and not counted\./);
  // mozg adds no prompt of its own where a module is the person's; Claude Code's own settings still apply there.
  assert.match((await toolByName("mozg_map")!.run({}, ctx)).text, /Where it runs free, mozg adds no prompt of its own, and the session's permission settings apply\./);
});

test("with the asking switched off, the map says so and no row says it asks", async () => {
  const ctx = await loaded();
  await ctx.store.setSettings({ asks: false });
  const out = await toolByName("mozg_map")!.run({}, ctx);
  assert.match(out.text, /Asking is switched off on the desk, so it runs free everywhere\. The person can switch it on under Connection and settings\./);
  assert.doesNotMatch(out.text, /\basks\s+\d+ line/);
  assert.doesNotMatch(out.text, /Asks in:/);
});

test("with nothing recorded the tools say so instead of inventing numbers", async () => {
  const ctx: Ctx = { store: Store.blank(), now: SAMPLE_NOW };
  for (const name of ["mozg_status", "mozg_next", "mozg_map"]) {
    const out = await toolByName(name)!.run({}, ctx);
    assert.match(out.text, /has not seen any agent changes on this machine yet/);
  }
});

test("the working folder picks the project when there are several", async () => {
  const ctx = await loaded();
  const other = { ...ctx.store.changes[0], id: "other-1", toolUseId: "t-other", project: "/Users/ada/other", at: new Date(SAMPLE_NOW.getTime() + 3_600_000).toISOString() };
  await ctx.store.record([other], {});
  assert.match((await toolByName("mozg_status")!.run({}, ctx)).text, /^mozg · other\n/);
  // A folder inside a project still names that project.
  assert.match((await toolByName("mozg_status")!.run({}, { ...ctx, cwd: "/Users/ada/forge/src/payments" })).text, /^mozg · forge\n/);
  assert.match((await toolByName("mozg_status")!.run({}, { ...ctx, cwd: "/elsewhere" })).text, /^mozg · other\n/);
});

test("the desk tool reports where the desk is", async () => {
  let asked: boolean | null = null;
  const out = await toolByName("mozg_desk")!.run({}, { store: Store.blank(), desk: async (open) => ((asked = open), "http://127.0.0.1:4317/desk/") });
  assert.equal(asked, true);
  assert.match(out.text, /http:\/\/127\.0\.0\.1:4317\/desk\/ — local only/);
  const off = await toolByName("mozg_desk")!.run({}, { store: Store.blank() });
  assert.equal(off.isError, true);
});

test("in a hidden project the tools say so and give no numbers", async () => {
  const ctx = await loaded();
  await ctx.store.setSettings({ hidden: ["/Users/ada/forge"] });
  ctx.cwd = "/Users/ada/forge";
  const status = await toolByName("mozg_status")!.run({}, ctx);
  assert.match(status.text, /^This project is hidden on the mozg desk/);
  assert.equal(status.isError, undefined);
  const next = await toolByName("mozg_next")!.run({}, ctx);
  assert.match(next.text, /^This project is hidden on the mozg desk/);
  assert.equal(next.isError, true);
  assert.match((await toolByName("mozg_map")!.run({}, ctx)).text, /^This project is hidden on the mozg desk/);
  // Nor can anything be recorded there.
  const before = ctx.store.explains.length;
  const change = sampleStore().changes[0];
  const record = await toolByName("mozg_record")!.run({ change: change.id, question: "q?", answer: "an answer long enough", verdict: "explained", why: "w" }, ctx);
  assert.equal(record.isError, true);
  assert.equal(ctx.store.explains.length, before);
  // A folder inside the project is the project.
  ctx.cwd = "/Users/ada/forge/src";
  assert.match((await toolByName("mozg_status")!.run({}, ctx)).text, /^This project is hidden/);
});

test("a miss is taught once and asked again; a second miss ends the round", async () => {
  const ctx = await loaded();
  const change = sampleStore().changes.find((c) => c.module === "src/db/migrations")!;
  const answer = (text: string, extra: Record<string, unknown> = {}) =>
    toolByName("mozg_record")!.run({ change: change.id, question: "What does this change do?", answer: text, verdict: "not_yet", why: "w", lesson: "The lesson, in plain words.", ...extra }, ctx);

  const first = await answer("I am not really sure what it does.");
  assert.match(first.text, /^Recorded: not_yet\.\nNot yet\. Nothing is lost/);
  assert.match(first.text, /Now teach, once\..*\(the examiner's lesson is on record\).*ask the SAME question again/);
  assert.doesNotMatch(first.text, /Still worth explaining|Nothing else is waiting/, "it does not move on to another change");
  assert.equal(ctx.store.explains.find((e) => e.change === change.id)!.lesson, "The lesson, in plain words.");

  const second = await answer("Still not sure. Something about a ledger, I think.");
  assert.match(second.text, /^Recorded: not_yet\.\nStill not there\./);
  assert.match(second.text, /Still worth explaining|Nothing else is waiting/, "and now the round moves on");

  // A pass keeps no lesson, even when one is sent.
  const pass = await toolByName("mozg_record")!.run({ change: change.id, question: "q", answer: "an answer long enough", verdict: "explained", why: "w", lesson: "not kept" }, ctx);
  assert.match(pass.text, /^Recorded: explained\.\nsrc\/db\/migrations is yours now\./);
  assert.equal(ctx.store.explains.filter((e) => e.change === change.id).at(-1)!.lesson, null);
});
