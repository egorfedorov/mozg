import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seal, open } from "./secretbox";

test("seal/open round-trips and rejects tampering", () => {
  const s = seal("sk-ant-very-secret-123");
  assert.notEqual(s, "sk-ant-very-secret-123");
  assert.equal(open(s), "sk-ant-very-secret-123");
  assert.equal(open(s.slice(0, -4) + "AAAA"), null);
  assert.equal(open("garbage"), null);
});
