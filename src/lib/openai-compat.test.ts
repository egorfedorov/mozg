import { test } from "node:test";
import assert from "node:assert/strict";
import { toOpenAiContent } from "./openai-compat";

test("anthropic blocks translate to openai parts, images become data URIs", () => {
  const parts = toOpenAiContent([
    { type: "text", text: "hello" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
  ]);
  assert.deepEqual(parts[0], { type: "text", text: "hello" });
  assert.deepEqual(parts[1], {
    type: "image_url",
    image_url: { url: "data:image/png;base64,AAAA" },
  });
});
