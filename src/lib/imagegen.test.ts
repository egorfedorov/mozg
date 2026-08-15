import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./imagegen");

test("a gateway hiccup is retried, a rejected request is not", async () => {
  const { transient } = await load();

  // The measured failure: roughly one call in twenty comes back 502, and it
  // clears by itself. Failing the asset there refunds a studio and leaves a
  // hole in its paytable for no reason.
  assert.equal(transient(502), true);
  assert.equal(transient(500), true);
  assert.equal(transient(429), true);
  assert.equal(transient(408), true);

  // A 200 body carrying an error message the gateway wrote.
  assert.equal(transient(200, "Bad Gateway"), true);
  assert.equal(transient(200, "upstream timeout"), true);

  // These are answers, not accidents: retrying spends money to be told the
  // same thing again.
  assert.equal(transient(400, "invalid size"), false);
  assert.equal(transient(401, "bad api key"), false);
  assert.equal(transient(402, "insufficient balance"), false);
  assert.equal(transient(200, "content policy"), false);
});

test("the backoff is the one a production run measured", async () => {
  const { RETRY_BACKOFF_MS } = await load();
  assert.deepEqual([...RETRY_BACKOFF_MS], [3000, 6000, 9000]);
});
