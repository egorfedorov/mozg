/**
 * The site's server, started.
 *
 *   node dist/site-server.mjs [--port 4318] [--host 127.0.0.1] [--static out] [--data DIR] [--dev]
 *   node dist/site-server.mjs token [--data DIR]
 *
 * `token` prints a link that opens the operator panel once, in the next
 * fifteen minutes: the way in when mail cannot be sent. Run it with the data
 * folder of the running server.
 *
 * Everything secret comes from the environment, never from a command line
 * that ends up in a process list or a shell history:
 *
 *   MOZG_SITE_ORIGIN     where the site is served from (https://mozg.sh)
 *   MOZG_OPERATOR_EMAIL  the one address the panel opens for
 *   MOZG_SECRET          signs sessions and links: `openssl rand -hex 32`
 *   MOZG_DATA            the data folder (default: ~/.mozg-site)
 *   MOZG_OPERATOR_LANG   the language of the operator's letters (default: the machine's)
 *   MOZG_TRUST_PROXY     "1" behind a reverse proxy, to read the caller's address
 *   RESEND_API_KEY, EMAIL_FROM   the mail; without them mail stays off
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { isLang } from "@/lib/i18n";
import { makeLoginLink, SITE_DATA_ENV, startSite } from "./site";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

const dataDir = resolve(flag("--data") ?? process.env[SITE_DATA_ENV] ?? join(homedir(), ".mozg-site"));
const origin = process.env.MOZG_SITE_ORIGIN ?? `http://127.0.0.1:${Number(flag("--port") ?? 4318)}`;

if (argv[0] === "token") {
  process.stdout.write(`${await makeLoginLink(dataDir, origin)}\n`);
  process.exit(0);
}

const staticDir = resolve(flag("--static") ?? "out");
if (!existsSync(join(staticDir, "index.html"))) {
  process.stderr.write(`site: there are no pages in ${staticDir}. Run \`npm run build\`, or pass --static DIR.\n`);
}
const asked = process.env.MOZG_OPERATOR_LANG ?? "";
const port = flag("--port") ? Number(flag("--port")) : undefined;

const site = await startSite({
  port: port && port > 0 ? port : undefined,
  host: flag("--host"),
  staticDir,
  dataDir,
  origin: process.env.MOZG_SITE_ORIGIN,
  operatorEmail: process.env.MOZG_OPERATOR_EMAIL,
  secret: process.env.MOZG_SECRET,
  operatorLang: isLang(asked) ? asked : undefined,
  trustProxy: process.env.MOZG_TRUST_PROXY === "1",
  dev: argv.includes("--dev"),
});

process.stderr.write(`the site server is at ${site.origin} (pages from ${staticDir}, data in ${dataDir})\n`);
if (!process.env.MOZG_OPERATOR_EMAIL) process.stderr.write("site: MOZG_OPERATOR_EMAIL is not set, so nobody can open the panel.\n");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void site.close().then(() => process.exit(0));
  });
}

// Stay up until told otherwise.
await new Promise<never>(() => {});
