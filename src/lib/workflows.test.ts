import { test } from "node:test";
import assert from "node:assert/strict";

// workflows.ts imports @/db, which validates env at import time.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./workflows");

test("blank canvas nodes never become steps", async () => {
  const { cleanSteps } = await load();
  const steps = cleanSteps([
    { title: "Math model", brain: "stake-engine-math-sdk", ask: "", rules: "", done_when: "" },
    { title: "   ", ask: "left over from an empty node" },
  ]);
  assert.equal(steps.length, 1);
  // Empty strings are dropped rather than stored: the agent reading this gets
  // "no rules for this step", not a rule that says nothing.
  assert.deepEqual(steps[0], { title: "Math model", brain: "stake-engine-math-sdk" });
});

test("a step keeps its prompt, its rules and its check", async () => {
  const { cleanSteps, renderWorkflow } = await load();
  const steps = cleanSteps([
    {
      title: "Books and LUTs",
      brain: "stake-engine-canonical-books",
      ask: "what does index.json require",
      rules: "never hand-edit a book file",
      done_when: "the validator exits zero",
    },
  ]);
  const text = renderWorkflow({ title: "Slot", summary: null, steps });

  for (const needle of [
    "stake-engine-canonical-books",
    "what does index.json require",
    "never hand-edit a book file",
    "the validator exits zero",
  ]) {
    assert.ok(text.includes(needle), needle);
  }
});

test("one unusable node does not cost the route the others", async () => {
  const { cleanSteps, MAX_STEPS } = await load();
  const many = Array.from({ length: MAX_STEPS + 1 }, (_, i) => ({ title: `step ${i}` }));
  // Over-length is the caller's refusal to make, not a silent trim here: every
  // step still comes back, so the action can see there are thirteen and say so.
  assert.equal(cleanSteps(many).length, MAX_STEPS + 1);
  assert.deepEqual(cleanSteps([{ nope: 1 }, { title: "real" }]), [{ title: "real" }]);
});
