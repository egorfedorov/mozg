import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFetchableUrl } from "./url-guard";

const blocked = async (u: string) => (await checkFetchableUrl(u)).ok === false;

test("cloud metadata is refused", async () => {
  // The one that turns "fetch a URL" into "read our cloud credentials".
  assert.ok(await blocked("http://169.254.169.254/latest/meta-data/"));
});

test("loopback and private ranges are refused", async () => {
  for (const u of [
    "http://127.0.0.1:5432/",
    "http://localhost/admin",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
  ]) {
    assert.ok(await blocked(u), `should have refused ${u}`);
  }
});

test("IPv4-mapped IPv6 does not sneak past", async () => {
  assert.ok(await blocked("http://[::ffff:127.0.0.1]/"));
});

test("non-http protocols are refused", async () => {
  for (const u of ["file:///etc/passwd", "gopher://x/", "ftp://x/"]) {
    assert.ok(await blocked(u), `should have refused ${u}`);
  }
});

test("credentials in the URL are refused", async () => {
  assert.ok(await blocked("http://user:pass@example.com/"));
});

test("garbage is refused", async () => {
  for (const u of ["", "not a url", "http://"]) {
    assert.ok(await blocked(u), `should have refused ${JSON.stringify(u)}`);
  }
});

test("an ordinary public URL is allowed", async () => {
  const result = await checkFetchableUrl("https://example.com/docs/spacing");
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.url, "https://example.com/docs/spacing");
});
