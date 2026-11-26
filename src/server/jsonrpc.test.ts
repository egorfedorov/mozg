import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { RpcError, dispatch, serve, type Handler } from "./jsonrpc";

const echo: Handler = async (method, params) => (method === "echo" ? params : method === "boom" ? Promise.reject(new Error("off it went")) : Promise.reject(new RpcError(-32601, `Method not found: ${method}`)));

test("a request is answered with its id", async () => {
  const reply = JSON.parse((await dispatch('{"jsonrpc":"2.0","id":7,"method":"echo","params":{"a":1}}', echo))!);
  assert.deepEqual(reply, { jsonrpc: "2.0", id: 7, result: { a: 1 } });
});

test("a notification is never answered", async () => {
  assert.equal(await dispatch('{"jsonrpc":"2.0","method":"notifications/initialized"}', echo), null);
  // Not even to complain that the method is unknown or the handler failed.
  assert.equal(await dispatch('{"jsonrpc":"2.0","method":"nope"}', echo), null);
  assert.equal(await dispatch('{"jsonrpc":"2.0","method":"boom"}', echo), null);
  assert.equal(await dispatch("   ", echo), null);
});

test("a failing handler answers with an error, not a hang", async () => {
  const reply = JSON.parse((await dispatch('{"jsonrpc":"2.0","id":"x","method":"boom"}', echo))!);
  assert.equal(reply.error.code, -32603);
  assert.equal(reply.error.message, "off it went");
  assert.equal(reply.id, "x");
});

test("an unknown method is the caller's mistake, with its code", async () => {
  const reply = JSON.parse((await dispatch('{"jsonrpc":"2.0","id":1,"method":"nope"}', echo))!);
  assert.equal(reply.error.code, -32601);
  assert.equal(reply.error.message, "Method not found: nope");
});

test("a line that is not JSON is refused without crashing the rest", async () => {
  const reply = JSON.parse((await dispatch("{not json", echo))!);
  assert.equal(reply.error.code, -32700);
  assert.equal(reply.id, null);
  const again = JSON.parse((await dispatch('{"jsonrpc":"2.0","id":2,"method":"echo"}', echo))!);
  assert.deepEqual(again.result, {});
});

test("a request without a method is invalid", async () => {
  const reply = JSON.parse((await dispatch('{"jsonrpc":"2.0","id":3,"params":{}}', echo))!);
  assert.equal(reply.error.code, -32600);
});

test("a batch is answered with a batch, notifications left out", async () => {
  const reply = JSON.parse(
    (await dispatch('[{"jsonrpc":"2.0","id":1,"method":"echo"},{"jsonrpc":"2.0","method":"ping"},{"jsonrpc":"2.0","id":2,"method":"nope"}]', echo))!,
  );
  assert.equal(reply.length, 2);
  assert.deepEqual(reply[0].result, {});
  assert.equal(reply[1].error.code, -32601);
});

test("over a stream, replies come back one per line and in order", async () => {
  const input = new PassThrough();
  const out = new PassThrough();
  let text = "";
  out.setEncoding("utf8");
  out.on("data", (chunk: string) => (text += chunk));
  const done = serve(input, out, async (method) => ({ method }));
  input.write('{"jsonrpc":"2.0","id":"a","method":"first"}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":"b"');
  input.write(',"method":"second"}\n');
  input.end();
  await done;
  const lines = text.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(
    lines.map((l) => [l.id, l.result.method]),
    [["a", "first"], ["b", "second"]],
  );
});
