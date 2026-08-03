/**
 * Connect to a running mozg the way an agent does, over HTTP, and check the
 * whole MCP handshake end to end.
 *
 *   npm run check:mcp                       # against localhost
 *   MOZG_URL=https://mozg.sh npm run check:mcp
 *
 * Mints a throwaway token for the first account, exercises every tool, then
 * revokes it. Nothing is left behind — a live token that outlives its test is
 * a credential nobody is watching.
 */
import { query, maybeOne } from "@/db";
import { issueToken } from "@/lib/tokens";

const URL = process.env.MOZG_URL ?? "http://localhost:3300";
const ENDPOINT = `${URL}/mcp`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

interface RpcResult {
  status: number;
  body: {
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  };
}

async function rpc(method: string, params: unknown, token?: string): Promise<RpcResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: { code: -1, message: text.slice(0, 200) } };
  }
  return { status: res.status, body: body as RpcResult["body"] };
}

/** Tool results come back as MCP content blocks; this is the text of the first. */
function textOf(result: Record<string, unknown> | undefined): string {
  const content = result?.content as { type: string; text?: string }[] | undefined;
  return content?.[0]?.text ?? "";
}

async function main() {
  console.log(`\nchecking ${ENDPOINT}`);

  console.log("\nrefusing strangers");
  const anon = await rpc("tools/list", {});
  check("no token is 401", anon.status === 401, `got ${anon.status}`);
  const wrong = await rpc("tools/list", {}, "mzg_not_a_real_token");
  check("a wrong token is 401", wrong.status === 401, `got ${wrong.status}`);

  const owner = await maybeOne<{ id: string; email: string }>(
    `select id, email from "user" order by "createdAt" limit 1`,
  );
  if (!owner) {
    console.log("\n✗ no accounts in the database — sign in once first\n");
    process.exit(1);
  }

  const { token, id: tokenId } = await issueToken(owner.id, "check:mcp");
  console.log(`\nissued a temporary token for ${owner.email}`);

  try {
    console.log("\nhandshake");
    const init = await rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "check-mcp", version: "1" },
      },
      token,
    );
    check("initialize succeeds", init.status === 200 && !init.body.error);
    check(
      "server names itself and its protocol",
      typeof init.body.result?.protocolVersion === "string" &&
        Boolean((init.body.result?.serverInfo as { name?: string })?.name),
      String(init.body.result?.protocolVersion),
    );

    console.log("\ntools");
    const list = await rpc("tools/list", {}, token);
    const tools = (list.body.result?.tools ?? []) as { name: string; description: string }[];
    check("tools/list returns the tool set", tools.length >= 5, `${tools.length} tools`);
    check(
      "every tool has a description that says when to call it",
      tools.every((t) => t.description && t.description.length > 40),
    );

    const names = tools.map((t) => t.name);
    for (const expected of ["brain_list", "brain_search", "brain_read", "brain_write"]) {
      check(`${expected} is offered`, names.includes(expected));
    }

    console.log("\nreading");
    const listBrains = await rpc("tools/call", { name: "brain_list", arguments: {} }, token);
    const listText = textOf(listBrains.body.result);
    check("brain_list answers", listBrains.status === 200 && listText.length > 0);

    const brain = await maybeOne<{ slug: string; title: string; goal: string | null }>(
      `select b.slug, b.title, b.goal from brains b
        where b.owner_id = $1 and b.note_count > 0 order by b.note_count desc limit 1`,
      [owner.id],
    );

    if (!brain) {
      console.log("  (no brain with notes — skipping search and read)");
    } else {
      check("brain_list mentions the real brain", listText.includes(brain.slug), brain.slug);

      // Search in the brain's own words: the goal is the best natural query we
      // can build without hard-coding anything about this database.
      const q = (brain.goal ?? brain.title).split(/[.:—]/)[0].slice(0, 60);
      const search = await rpc(
        "tools/call",
        { name: "brain_search", arguments: { brain: brain.slug, query: q } },
        token,
      );
      const hits = textOf(search.body.result);
      check("brain_search answers", search.status === 200 && !search.body.error);
      check("brain_search finds something", hits.length > 40, `${hits.length} chars for "${q}"`);

      const read = await rpc(
        "tools/call",
        { name: "brain_read", arguments: { brain: brain.slug } },
        token,
      );
      check("brain_read answers", read.status === 200 && textOf(read.body.result).length > 40);
    }

    console.log("\nrefusing what it should refuse");
    const missing = await rpc(
      "tools/call",
      { name: "brain_search", arguments: { brain: "no-such-brain-xyz", query: "anything" } },
      token,
    );
    const missingText = textOf(missing.body.result) + (missing.body.error?.message ?? "");
    check(
      "an unknown brain names itself in the refusal",
      missingText.includes("no-such-brain-xyz"),
      missingText.slice(0, 60),
    );
    check(
      "the refusal is prose, not a stack trace",
      missingText.length > 0 && !/\bat \w+ \(|Error:|node_modules/.test(missingText),
    );

    // Per MCP 2025-06-18 an unknown tool is a protocol error, not a tool that
    // ran and failed — a client on a stale tool list has to tell them apart.
    const badTool = await rpc("tools/call", { name: "definitely_not_a_tool", arguments: {} }, token);
    check(
      "an unknown tool is a JSON-RPC error",
      badTool.body.error?.code === -32602,
      `code ${badTool.body.error?.code ?? "none"}`,
    );

    console.log("\ncreating a brain the way an agent would");
    // Free plans hold one brain, and the check must not fail because the
    // account is legitimately full — lift it for the test and put it back.
    const before = await maybeOne<{ plan: string }>(`select plan from "user" where id = $1`, [
      owner.id,
    ]);
    await query(`update "user" set plan = 'pro' where id = $1`, [owner.id]);

    const created = await rpc(
      "tools/call",
      {
        name: "brain_create",
        arguments: {
          title: "Check MCP scratch",
          goal: "Answer questions about the throwaway brain this check creates.",
          topic: "devops",
        },
      },
      token,
    );
    const createdText = textOf(created.body.result);
    check("brain_create answers", created.status === 200 && !created.body.error);
    check("it returns the handle", createdText.includes("check-mcp-scratch"), createdText.slice(0, 60));

    const scratch = await maybeOne<{ id: string; topic: string; goal: string | null }>(
      `select id, topic, goal from brains where owner_id = $1 and slug = 'check-mcp-scratch'`,
      [owner.id],
    );
    check("the brain really exists", Boolean(scratch));
    check("the topic was kept", scratch?.topic === "devops", scratch?.topic ?? "—");

    const again = await rpc(
      "tools/call",
      {
        name: "brain_create",
        arguments: { title: "Check MCP scratch", goal: "Something else entirely." },
      },
      token,
    );
    const copies = await query<{ n: number }>(
      `select count(*)::int as n from brains where owner_id = $1 and slug like 'check-mcp-scratch%'`,
      [owner.id],
    );
    check(
      "creating it twice returns the same brain",
      copies[0].n === 1 && /already exists/i.test(textOf(again.body.result)),
      `${copies[0].n} brain(s)`,
    );

    const noGoal = await rpc(
      "tools/call",
      { name: "brain_create", arguments: { title: "No goal here" } },
      token,
    );
    check(
      "a brain without a goal is refused",
      Boolean(noGoal.body.result?.isError) && /goal/i.test(textOf(noGoal.body.result)),
    );

    console.log("\nfeeding it");
    const addText = await rpc(
      "tools/call",
      {
        name: "brain_add_source",
        arguments: {
          brain: "check-mcp-scratch",
          text: "The throwaway brain exists only so this check has something to write to.",
          name: "check-mcp note",
        },
      },
      token,
    );
    check("brain_add_source accepts text", !addText.body.result?.isError, textOf(addText.body.result).slice(0, 50));

    const sources = await query<{ n: number }>(
      `select count(*)::int as n from sources where brain_id = $1`,
      [scratch?.id ?? null],
    );
    check("the source was queued", sources[0].n === 1, `${sources[0].n} source(s)`);

    // The SSRF guard is the reason an agent can be handed a URL by a poisoned
    // page without it becoming a request to the metadata service.
    const ssrf = await rpc(
      "tools/call",
      {
        name: "brain_add_source",
        arguments: {
          brain: "check-mcp-scratch",
          urls: ["http://169.254.169.254/latest/meta-data/", "http://localhost:3300/"],
        },
      },
      token,
    );
    const ssrfText = textOf(ssrf.body.result);
    check(
      "internal addresses are refused",
      Boolean(ssrf.body.result?.isError) && /169\.254|localhost/.test(ssrfText),
      ssrfText.slice(0, 70),
    );
    const afterSsrf = await query<{ n: number }>(
      `select count(*)::int as n from sources where brain_id = $1`,
      [scratch?.id ?? null],
    );
    check("nothing was queued for them", afterSsrf[0].n === 1, `${afterSsrf[0].n} source(s)`);

    const secret = await rpc(
      "tools/call",
      {
        name: "brain_add_source",
        arguments: {
          brain: "check-mcp-scratch",
          text: "Deploy with AKIAIOSFODNN7EXAMPLE and the key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY.",
        },
      },
      token,
    );
    check(
      "text containing a credential is refused",
      Boolean(secret.body.result?.isError) && /credential/i.test(textOf(secret.body.result)),
    );

    console.log("\ncleaning up the scratch brain");
    await query(`delete from brains where owner_id = $1 and slug = 'check-mcp-scratch'`, [owner.id]);
    if (before) await query(`update "user" set plan = $2 where id = $1`, [owner.id, before.plan]);
    console.log(`  removed, plan restored to ${before?.plan}`);

    console.log("\nmetering");
    const calls = await query<{ n: number }>(
      `select count(*)::int as n from calls where created_at > now() - interval '2 minutes'`,
    );
    check("the calls were recorded", calls[0].n > 0, `${calls[0].n} in the last two minutes`);
  } finally {
    await query(`update mcp_tokens set revoked_at = now() where id = $1`, [tokenId]);
    console.log("\nrevoked the temporary token");
  }

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : "\n✓ MCP answers\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
