import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, appendFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvedBy,
  changesFrom,
  hintsFor,
  readChangeText,
  readLines,
  renderChange,
  type ChangeText,
} from "./transcript";
import type { Change } from "./types";

const CWD = "/work/forge";

function call(
  id: string,
  name: string,
  input: Record<string, unknown>,
  at = "2026-11-25T10:00:00.000Z",
): string {
  return (
    JSON.stringify({
      type: "assistant",
      sessionId: "s1",
      cwd: CWD,
      timestamp: at,
      version: "2.1.319",
      message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
    }) + "\n"
  );
}

function result(
  id: string,
  extra: Record<string, unknown> = {},
  at = "2026-11-25T10:00:04.000Z",
): string {
  return (
    JSON.stringify({
      type: "user",
      timestamp: at,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] },
      ...extra,
    }) + "\n"
  );
}

async function log(text: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mozg-log-"));
  const path = join(dir, "s1.jsonl");
  await writeFile(path, text);
  return path;
}

async function read(path: string) {
  const { lines } = await readLines(path);
  return changesFrom(lines, path, "s1");
}

test("an edit is a change only once its result is seen", async () => {
  const path = await log(
    call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x\ny\n", new_string: "x\ny\nz\n" }) +
      result("a", { permissionDecision: { decision: "accept", source: "config", reasonType: "classifier" } }) +
      call("b", "Edit", { file_path: `${CWD}/src/b.ts`, old_string: "x", new_string: "y" }),
  );
  const changes = await read(path);
  assert.equal(changes.length, 1, "the second call has no result yet");
  const c = changes[0];
  assert.equal(c.module, "src");
  assert.equal(c.file, "src/a.ts");
  assert.equal(c.added, 3);
  assert.equal(c.removed, 2);
  assert.equal(c.goAheadMs, 4000);
  assert.equal(c.approvedBy, "auto");
  assert.equal(c.project, CWD);
  assert.equal(c.session, "s1");
});

test("an edit the tool refused never changed a file and is never stored", async () => {
  const refused = result("a", {}, "2026-11-25T10:00:01.000Z").replace(
    '"content":"ok"',
    '"content":"string not found","is_error":true',
  );
  const path = await log(
    call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" }) + refused,
  );
  assert.deepEqual(await read(path), []);
});

test("who let it through is read from the decision, not guessed from timing", async () => {
  const one = await log(
    call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" }) +
      result("a", { permissionDecision: { decision: "accept", source: "user_temporary", grantScope: "once" } }),
  );
  const two = await log(
    call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" }) + result("a"),
  );
  assert.equal((await read(one))[0].approvedBy, "user");
  assert.equal((await read(two))[0].approvedBy, "unknown");
  // "Always allow" is a rule the person made earlier, not a look they took now.
  assert.equal(approvedBy({ permissionDecision: { source: "user_permanent" } }), "auto");
  assert.equal(approvedBy({ permissionDecision: { decision: "accept", source: "config", reasonType: "classifier" } }), "auto");
  assert.equal(approvedBy({ permissionDecision: { source: "hook" } }), "auto");
  assert.equal(approvedBy({}), "unknown");
});

test("an older log's session_id names the session as well as sessionId does", async () => {
  const older =
    JSON.stringify({
      type: "assistant", session_id: "old-session", cwd: CWD, timestamp: "2026-10-01T10:00:00.000Z",
      message: { role: "assistant", content: [{ type: "tool_use", id: "a", name: "Edit", input: { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" } }] },
    }) +
    "\n" +
    result("a", {}, "2026-10-01T10:00:03.000Z");
  assert.equal((await read(await log(older)))[0].session, "old-session");
});

test("a structured patch counts what a replace-all really touched", async () => {
  const path = await log(
    call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y", replace_all: true }) +
      result("a", {
        toolUseResult: {
          filePath: `${CWD}/src/a.ts`,
          structuredPatch: [
            { oldStart: 1, oldLines: 1, newStart: 1, newLines: 2 },
            { oldStart: 9, oldLines: 1, newStart: 10, newLines: 2 },
          ],
        },
      }),
  );
  const c = (await read(path))[0];
  assert.equal(c.added, 4);
  assert.equal(c.removed, 2);
});

test("a whole-file write counts what it replaced when the log kept it", async () => {
  const over = await log(
    call("a", "Write", { file_path: `${CWD}/src/new.ts`, content: "a\nb\nc\n" }) +
      result("a", { toolUseResult: { type: "update", originalFile: "a\nb\n" } }),
  );
  const fresh = await log(
    call("a", "Write", { file_path: `${CWD}/src/new.ts`, content: "a\nb\nc\n" }) +
      result("a", { toolUseResult: { type: "create", originalFile: null } }),
  );
  const [a] = await read(over);
  const [b] = await read(fresh);
  assert.deepEqual([a.added, a.removed, a.tool], [3, 2, "write"]);
  assert.deepEqual([b.added, b.removed], [3, 0]);
});

test("calls that do not change files are ignored", async () => {
  const path = await log(
    call("a", "Read", { file_path: `${CWD}/src/a.ts` }) +
      result("a") +
      call("b", "Bash", { command: "ls" }) +
      result("b"),
  );
  assert.deepEqual(await read(path), []);
});

test("reading resumes after the last complete line", async () => {
  const path = await log(
    call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" }) +
      result("a"),
  );
  const first = await readLines(path);
  assert.equal(first.lines.length, 2);
  assert.equal(first.offset, (await readFile(path)).length);

  await appendFile(path, call("b", "Edit", { file_path: `${CWD}/src/b.ts`, old_string: "x", new_string: "y" }).slice(0, 40));
  const second = await readLines(path, first.offset);
  assert.equal(second.lines.length, 0, "a half line is left for next time");
  assert.equal(second.offset, first.offset);

  await appendFile(
    path,
    call("b", "Edit", { file_path: `${CWD}/src/b.ts`, old_string: "x", new_string: "y" }).slice(40) +
      result("b"),
  );
  const third = await readLines(path, second.offset);
  assert.equal(third.lines.length, 2);
  assert.equal((await read(path)).length, 2);
});

test("a log that shrank is a new file and is read from the start", async () => {
  const path = await log(call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" }) + result("a"));
  const first = await readLines(path);
  await writeFile(path, call("b", "Edit", { file_path: `${CWD}/src/b.ts`, old_string: "x", new_string: "y" }));
  const again = await readLines(path, first.offset);
  assert.equal(again.reset, true);
  assert.equal(again.lines.length, 1);
});

test("lines that cannot hold a call are never parsed", async () => {
  const path = await log(
    "not json at all\n" +
      JSON.stringify({ type: "attachment", attachment: { a: 1 } }) +
      "\n" +
      '{broken "tool_use" json\n' +
      call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "x", new_string: "y" }) +
      result("a"),
  );
  assert.equal((await read(path)).length, 1);
});

test("the text of a change is read back from its line when it is needed", async () => {
  const path = await log(
    call("a", "Edit", { file_path: `${CWD}/src/payments/charge.ts`, old_string: "take(amount)\n", new_string: "take(amount)\nif (!amount) return\n" }) +
      result("a", { permissionDecision: { decision: "accept", source: "config" } }),
  );
  const [c] = await read(path);
  const text = (await readChangeText(c))!;
  assert.equal(text.file, `${CWD}/src/payments/charge.ts`);
  assert.deepEqual(text.parts, [{ before: "take(amount)\n", after: "take(amount)\nif (!amount) return\n" }]);
  assert.ok(c.risks.includes("payments"));
  const rendered = renderChange(text);
  assert.match(rendered, /^\s+take\(amount\)\n\+ if \(!amount\) return$/m);
});

test("the changed lines are shown, not the forty around them", () => {
  const head = Array.from({ length: 20 }, (_, i) => `same ${i}`);
  const text: ChangeText = {
    file: "x.ts",
    tool: "edit",
    parts: [
      { before: [...head, "old"].join("\n"), after: [...head, "new", "extra"].join("\n") },
    ],
  };
  const out = renderChange(text).split("\n");
  assert.deepEqual(out, ["  same 18", "  same 19", "- old", "+ new", "+ extra"]);
});

test("a long change is cut and says so", () => {
  const text: ChangeText = { file: "x.ts", tool: "write", parts: [{ before: "", after: Array.from({ length: 90 }, (_, i) => `l${i}`).join("\n") }] };
  const out = renderChange(text, 10).split("\n");
  assert.equal(out.length, 11);
  assert.equal(out[10], "… 80 more lines");
});

test("hints point at the risky part", () => {
  assert.deepEqual(hintsFor({ risks: ["migration"] }, ""), ["what this does to rows that already exist"]);
  assert.ok(hintsFor({ risks: [] }, "try {\n  await x()\n} catch (e) {}").includes("what the catch block does with the error"));
  assert.deepEqual(hintsFor({ risks: [] }, "return 1"), ["what this changes for the code that calls it"]);
  assert.ok(hintsFor({ risks: ["migration", "payments", "auth", "schema"] }, "").length <= 3);
});

test("a change keeps no source code, only the way back to it", async () => {
  const path = await log(call("a", "Edit", { file_path: `${CWD}/src/a.ts`, old_string: "secret", new_string: "y" }) + result("a"));
  const [c] = await read(path);
  const stored: Change = JSON.parse(JSON.stringify(c));
  assert.ok(!JSON.stringify(stored).includes("secret"));
  assert.deepEqual(Object.keys(stored.source).sort(), ["length", "offset", "path"]);
});
