/**
 * End-to-end access-control check against a running server.
 *
 * Unit-testing `access.ts` would only prove the function is self-consistent.
 * This drives the real MCP endpoint with a real second user's token, which is
 * the thing that actually leaks if a query forgets its `where owner_id`.
 *
 *   npm run check:access
 */
import { one, maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { issueToken } from "@/lib/tokens";
import { env } from "@/lib/env";

const MCP = `${env.NEXT_PUBLIC_APP_URL}/mcp`;

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
}

async function call(token: string, name: string, args: Record<string, unknown>) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const json = (await res.json()) as {
    result?: { content: { text: string }[]; isError?: boolean };
  };
  return {
    status: res.status,
    text: json.result?.content?.[0]?.text ?? "",
    isError: json.result?.isError ?? false,
  };
}

async function main() {
  const owner = await one<{ id: string }>(
    `select id from "user" order by "createdAt" limit 1`,
  );

  // A second account with no relationship to the first.
  const stranger =
    (await maybeOne<{ id: string }>(`select id from "user" where id = 'stranger'`)) ??
    (await one<{ id: string }>(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt",
                           plan, handle)
       values ('stranger', 'Stranger', 'stranger@localhost', true, now(), now(),
               'pro', 'stranger')
       returning id`,
    ));

  const brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = 'design'`,
    [owner.id],
  );
  if (!brain) throw new Error("run `npm run seed` first");

  const wasPublic = brain.visibility === "public";
  await query(`update brains set visibility = 'private' where id = $1`, [brain.id]);

  const theirs = (await issueToken(stranger.id, "access check")).token;

  console.log("\nprivate brain, stranger's token:");

  const list = await call(theirs, "brain_list", {});
  check("brain_list hides it", !list.text.includes("Design system"), list.text.slice(0, 60));

  const bySlug = await call(theirs, "brain_search", { brain: "design", query: "spacing" });
  check("brain_search by slug is refused", bySlug.isError);

  const byHandle = await call(theirs, "brain_search", {
    brain: "egor/design",
    query: "spacing",
  });
  check("brain_search by owner/slug is refused", byHandle.isError);

  const write = await call(theirs, "brain_write", {
    brain: "egor/design",
    title: "Injected",
    body: "This must never be stored.",
  });
  check("brain_write is refused", write.isError);

  const injected = await maybeOne(
    `select 1 from notes where brain_id = $1 and title = 'Injected'`,
    [brain.id],
  );
  check("nothing was written", !injected);

  // Public brains are readable but still not writable by a stranger.
  await query(`update brains set visibility = 'public' where id = $1`, [brain.id]);
  console.log("\npublic brain, stranger's token:");

  const publicRead = await call(theirs, "brain_search", {
    brain: "egor/design",
    query: "spacing between sections",
  });
  check("read is allowed", !publicRead.isError && publicRead.text.includes("Section"));

  const publicWrite = await call(theirs, "brain_write", {
    brain: "egor/design",
    title: "Injected2",
    body: "Still must never be stored.",
  });
  check("write is still refused", publicWrite.isError);

  console.log("\nno token:");
  const anon = await fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("unauthenticated request is 401", anon.status === 401, `got ${anon.status}`);

  // Leave the brain as we found it.
  await query(`update brains set visibility = $2 where id = $1`, [
    brain.id,
    wasPublic ? "public" : "private",
  ]);
  await query(`delete from mcp_tokens where user_id = 'stranger'`);

  console.log(
    failures ? `\n✗ ${failures} check(s) FAILED\n` : "\n✓ all access checks passed\n",
  );
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
