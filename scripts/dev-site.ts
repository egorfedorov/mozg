/**
 * The site's server to build against, on a throwaway data folder.
 *
 *   npm run dev:site      after npm run build: http://127.0.0.1:4318/ is the
 *                         site, served from out/, and /admin/ is the panel
 *
 * Nothing real is touched: the threads, errors, announcements and drafts all
 * go to a temporary folder. No mail goes anywhere (there are no keys here), so
 * a link that opens the panel is printed instead, and it holds fifteen minutes.
 */

import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeLoginLink } from "../src/server/site";

const root = await mkdtemp(join(tmpdir(), "mozg-site-dev-"));
const dataDir = join(root, "data");
const port = process.argv[2] ?? "4318";
const origin = `http://127.0.0.1:${port}`;
const link = await makeLoginLink(dataDir, origin);

process.stderr.write(`[mozg-dev] a throwaway data folder in ${root}\n[mozg-dev] the panel, once, in the next fifteen minutes: ${link}\n`);
const child = spawn(process.execPath, ["dist/site-server.mjs", "--dev", "--port", port, "--static", "out", "--data", dataDir], {
  stdio: "inherit",
  env: { ...process.env, MOZG_OPERATOR_EMAIL: "operator@example.test", MOZG_SITE_ORIGIN: origin },
});
child.on("exit", (code) => void (process.exitCode = code ?? 0));
