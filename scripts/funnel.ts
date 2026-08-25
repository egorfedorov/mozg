/**
 * What the posting bought, in a terminal.
 *
 * The same reading /admin/marketing puts at the top of the kit, for the agent
 * sitting in this repository rather than the operator sitting in a browser.
 * `/mozg:report` runs this: a campaign is only worth writing down once its
 * number is known, and an agent that has to be handed a screenshot cannot
 * close that loop on its own.
 *
 * Read-only. Safe against production, which is where the only interesting
 * answer lives.
 *
 *   npm run funnel                # last 30 days
 *   npm run funnel -- --days 90
 *   npm run funnel -- --all
 */
import { signupFunnel } from "@/lib/attribution";
import { formatCents } from "@/lib/money-math";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const all = process.argv.includes("--all");
  const days = all ? null : Number(arg("days") ?? 30);
  if (!all && (!Number.isFinite(days) || days! < 1)) {
    console.error("--days takes a positive number of days, or pass --all");
    process.exit(2);
  }

  const rows = await signupFunnel(days);
  console.log(`\nwhere they came from — ${all ? "all time" : `last ${days} days`}\n`);

  if (rows.length === 0) {
    console.log("  nobody signed up in this window.\n");
    return;
  }

  const w = Math.max(6, ...rows.map((r) => r.source.length));
  const head = ["source".padEnd(w), "signed", "conn", "called", "paid", "money", "last"];
  console.log("  " + head.join("  "));
  console.log("  " + "─".repeat(head.join("  ").length));

  for (const r of rows) {
    console.log(
      "  " +
        [
          r.source.padEnd(w),
          String(r.signups).padStart(6),
          String(r.connected).padStart(4),
          String(r.active).padStart(6),
          String(r.paying).padStart(4),
          (r.revenue_cents > 0 ? formatCents(r.revenue_cents) : "—").padStart(5),
          r.last,
        ].join("  "),
    );
  }

  const t = rows.reduce(
    (a, r) => ({
      signups: a.signups + r.signups,
      connected: a.connected + r.connected,
      active: a.active + r.active,
    }),
    { signups: 0, connected: 0, active: 0 },
  );
  console.log(
    `\n  ${t.signups} signed up · ${t.connected} connected · ${t.active} actually called\n` +
      `  First touch only, and it undercounts: an untagged link shared in a DM\n` +
      `  arrives as "direct". Tag the next one — ?utm_source=<where>-<mmdd>.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
