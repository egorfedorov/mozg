/**
 * Issue or revoke an MCP token from the terminal.
 *
 *   npm run token -- --owner egor@mozg.sh --name laptop
 *   npm run token -- --revoke laptop
 *
 * The plaintext is printed once and never stored — the row keeps a SHA-256
 * hash. Anything printed here is a live credential until it is revoked.
 */
import { maybeOne, query } from "@/db";
import { issueToken } from "@/lib/tokens";

async function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(`--${flag}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const revoke = get("revoke");
  if (revoke) {
    const gone = await query<{ id: string }>(
      `update mcp_tokens set revoked_at = now()
        where name = $1 and revoked_at is null returning id`,
      [revoke],
    );
    console.log(`\nrevoked ${gone.length} token(s) named "${revoke}"\n`);
    process.exit(0);
  }

  const email = get("owner");
  if (!email) {
    console.error("\nPass --owner <email>, or --revoke <name>.\n");
    process.exit(1);
  }

  const user = await maybeOne<{ id: string; email: string }>(
    `select id, email from "user" where lower(email) = lower($1)`,
    [email],
  );
  if (!user) {
    console.error(`\nNo account for ${email}.\n`);
    process.exit(1);
  }

  const { token, prefix } = await issueToken(user.id, get("name") ?? "cli");
  console.log(`\n${token}\n`);
  console.log(`issued to ${user.email} as ${prefix}… — shown once.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
