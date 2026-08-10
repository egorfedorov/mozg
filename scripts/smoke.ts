/**
 * Does every public page actually render?
 *
 *   npm run smoke                    # against http://localhost:3300
 *   npm run smoke -- https://mozg.sh # against anything else
 *
 * The gap this closes: 253 unit tests covered pure logic and not one page, so
 * a public route that answered 200 with an EMPTY BODY shipped and was found by
 * a person opening it. A status code is not evidence that a page rendered —
 * every check here also demands a string that only appears when the real
 * content is there.
 *
 * Deliberately a script and not a test file: it needs a running app, which
 * `npm test` does not have. The deploy runs it after the swap, where it is
 * worth something.
 */

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3300").replace(
  /\/$/,
  "",
);

interface Check {
  path: string;
  /** A string the page cannot render without. */
  expect: string;
  /**
   * Signed out, the workspace must not render workspace content. Next sends
   * that bounce as a 307 or, when the shell has already started streaming, as
   * a 200 whose payload carries the redirect — both are correct, and the
   * thing worth asserting is that sign-in is where the reader ends up.
   */
  auth?: true;
}

const CHECKS: Check[] = [
  { path: "/", expect: "mozg" },
  { path: "/explore", expect: "Brains other people" },
  { path: "/build", expect: "A workflow" },
  { path: "/pricing", expect: "Pricing" },
  { path: "/changelog", expect: "Workflows" },
  { path: "/guide", expect: "brain" },
  { path: "/connect", expect: "mcp" },
  { path: "/basics", expect: "MCP" },
  { path: "/why", expect: "forty times" },
  { path: "/collective", expect: "collective" },
  { path: "/robots.txt", expect: "Sitemap" },
  { path: "/llms.txt", expect: "mozg" },
  { path: "/machine.txt", expect: "brain_search" },
  { path: "/api/health", expect: '"status":"ok"' },
  // Signed out, the workspace bounces rather than rendering an empty shell —
  // which is exactly the bug this file exists to catch, in its other form.
  { path: "/brains", expect: "", auth: true },
  { path: "/workflows", expect: "", auth: true },
];

async function main() {
  let failed = 0;
  console.log(`\nsmoke: ${base}\n`);

  for (const check of CHECKS) {
    const want = check.auth ? null : 200;
    let got = 0;
    let body = "";
    try {
      const res = await fetch(`${base}${check.path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      got = res.status;
      body = got === 200 ? await res.text() : (res.headers.get("location") ?? "");
    } catch (err) {
      console.log(`  ✗ ${check.path.padEnd(14)} ${err instanceof Error ? err.message : err}`);
      failed++;
      continue;
    }

    const statusOk = check.auth ? got === 307 || got === 200 : got === want;
    // Next streams the RSC payload after the HTML, so the marker can live in
    // either — searching the whole body is the honest test of "did this page
    // produce its content", not of how it was serialised.
    const bodyOk = check.auth
      ? body.includes("sign-in")
      : !check.expect || body.includes(check.expect);

    if (statusOk && bodyOk) {
      console.log(
        `  ✓ ${check.path.padEnd(14)} ${got}` +
          (check.auth ? "  → sign-in" : check.expect ? `  «${check.expect}»` : ""),
      );
    } else {
      failed++;
      console.log(
        `  ✗ ${check.path.padEnd(14)} ${got} (want ${check.auth ? "sign-in" : want})` +
          (statusOk && !bodyOk
            ? `  — no «${check.auth ? "sign-in" : check.expect}» in ${body.length} bytes`
            : ""),
      );
    }
  }

  console.log(failed ? `\n✗ ${failed} of ${CHECKS.length} failed\n` : `\n✓ ${CHECKS.length} pages\n`);
  process.exit(failed ? 1 : 0);
}

main();
