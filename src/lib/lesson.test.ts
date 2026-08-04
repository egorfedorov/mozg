import { test } from "node:test";
import assert from "node:assert/strict";

// lesson.ts validates process env at import time (via @/db); the pure helpers
// under test never open a connection, so a dummy DSN is all it takes.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("../worker/lesson");

const notes = [
  { id: "n1", title: "One", body: "first" },
  { id: "n2", title: "Two", body: "second" },
];
const checks = [
  { id: "c1", question: "Why one?" },
  { id: "c2", question: "Why two?" },
];

test("notes-only hash is unchanged, so check-less modules keep their lessons", async () => {
  const { notesHash } = await load();
  assert.equal(notesHash(notes), notesHash(notes, []));
  assert.equal(notesHash(notes), notesHash([...notes]));
});

test("checks join the hash: a changed exam recompiles the lesson", async () => {
  const { notesHash } = await load();
  const without = notesHash(notes);
  const withChecks = notesHash(notes, checks);
  assert.notEqual(withChecks, without);
  assert.equal(withChecks, notesHash(notes, checks));
  assert.notEqual(withChecks, notesHash(notes, [checks[1], checks[0]]));
  assert.notEqual(withChecks, notesHash(notes, [{ id: "c1", question: "edited?" }]));
});

test("legacy payloads without check_ids still parse", async () => {
  const { lessonShape } = await load();
  const parsed = lessonShape.safeParse({
    intro: "i",
    sections: [{ heading: "h", lead: "l", note_ids: ["n1"] }],
  });
  assert.ok(parsed.success);
  assert.equal(parsed.data.sections[0].check_ids, undefined);
});

test("each section gets its first unassigned question after its last note", async () => {
  const { sectionQuizzes } = await load();
  const quizAt = sectionQuizzes(
    [
      { note_ids: ["n1", "n2"], check_ids: ["c1"] },
      { note_ids: ["n3"], check_ids: ["c1", "c2"] },
    ],
    new Set(["c1", "c2"]),
  );
  // c1 is claimed by the first section; the second takes its next question.
  assert.equal(quizAt.get("n2"), "c1");
  assert.equal(quizAt.get("n3"), "c2");
  assert.equal(quizAt.size, 2);
});

test("unknown check ids and check-less sections get no quiz", async () => {
  const { sectionQuizzes } = await load();
  const quizAt = sectionQuizzes(
    [
      { note_ids: ["n1"], check_ids: ["nope"] },
      { note_ids: ["n2"] },
    ],
    new Set(["c1"]),
  );
  assert.equal(quizAt.size, 0);
});

test("payloads with depths parse, and depths stay optional", async () => {
  const { lessonShape } = await load();
  const withDepths = lessonShape.safeParse({
    intro: "i",
    sections: [{ heading: "h", lead: "l", note_ids: ["n1"] }],
    depths: {
      eli5: { intro: "like you are five", leads: ["kid lead"] },
      expert: { intro: "terse", leads: ["pro lead"] },
    },
  });
  assert.ok(withDepths.success);
  assert.equal(withDepths.data.depths?.eli5.leads[0], "kid lead");
  const without = lessonShape.safeParse({
    intro: "i",
    sections: [{ heading: "h", lead: "l", note_ids: ["n1"] }],
  });
  assert.ok(without.success);
  assert.equal(without.data.depths, undefined);
});

test("sectionKey is a deterministic uuid over module, heading and note order", async () => {
  const { sectionKey } = await load();
  const key = sectionKey("brain-1", "cat", "Heading", ["n1", "n2"]);
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(key, sectionKey("brain-1", "cat", "Heading", ["n1", "n2"]));
  assert.notEqual(key, sectionKey("brain-1", "cat", "Heading", ["n2", "n1"]));
  assert.notEqual(key, sectionKey("brain-1", "cat", "Other", ["n1", "n2"]));
  assert.notEqual(key, sectionKey("brain-2", "cat", "Heading", ["n1", "n2"]));
});
