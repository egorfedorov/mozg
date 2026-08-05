import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { postAnnouncement, retireAnnouncement } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Announcements — mozg admin" };

const field = {
  display: "block",
  width: "100%",
  padding: ".45rem .6rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper)",
  font: "inherit",
};

/**
 * Saying something to everyone, from one form.
 *
 * The three kinds differ in who they interrupt: maintenance is a red bar and
 * (optionally) a line in every agent's brain_list, news is a green one that also
 * lands in /changelog, notice is the quiet grey. Everything is dismissible per
 * entry, so a banner someone closed does not come back tomorrow wearing the same
 * id.
 */
export default async function AdminAnnouncementsPage() {
  await requireAdmin().catch(() => redirect("/"));

  const rows = await query<{
    id: string;
    kind: string;
    title: string;
    body: string;
    published: boolean;
    to_agents: boolean;
    live: boolean;
    starts_at: string;
    ends_at: string | null;
  }>(
    `select id, kind, title, body, published, to_agents,
            (published and starts_at <= now() and (ends_at is null or ends_at > now())) as live,
            to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as starts_at,
            to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as ends_at
       from announcements order by starts_at desc limit 50`,
  );

  return (
    <AppShell active="/admin/announcements" eyebrow="Operator" title="Announcements">
      <p className="lede">
        A banner for humans, and — when you tick it — one line inside every
        agent&apos;s <code>brain_list</code>. Maintenance wants an end time: a bar
        that outlives the outage teaches people to ignore the next one.
      </p>

      <form
        action={postAnnouncement}
        style={{ display: "grid", gap: ".7rem", maxWidth: "44rem", marginBottom: "2rem" }}
      >
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="mono" style={{ fontSize: ".75rem" }}>
            kind
            <select name="kind" defaultValue="maintenance" style={{ ...field, width: "10rem" }}>
              <option value="maintenance">maintenance</option>
              <option value="news">news</option>
              <option value="notice">notice</option>
            </select>
          </label>
          <label className="mono" style={{ fontSize: ".75rem" }}>
            minutes live (empty = until retired)
            <input name="minutes" type="number" min={1} max={10080} placeholder="30"
              style={{ ...field, width: "14rem" }} />
          </label>
          <label
            className="mono"
            style={{ fontSize: ".75rem", display: "flex", gap: ".4rem", alignItems: "center", paddingBottom: ".5rem" }}
          >
            <input type="checkbox" name="toAgents" defaultChecked />
            tell agents too
          </label>
        </div>
        <label className="mono" style={{ fontSize: ".75rem" }}>
          title
          <input name="title" required minLength={3} maxLength={120}
            placeholder="Ingest paused for a deploy" style={field} />
        </label>
        <label className="mono" style={{ fontSize: ".75rem" }}>
          body (first line shows in the banner)
          <textarea name="body" rows={3} maxLength={2000}
            placeholder="Searches keep working; new sources resume in about twenty minutes."
            style={field} />
        </label>
        <button className="btn" style={{ justifySelf: "start" }}>Post</button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9375rem" }}>
        <thead>
          <tr className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", textAlign: "left" }}>
            <th style={{ padding: ".4rem .6rem" }}>state</th>
            <th style={{ padding: ".4rem .6rem" }}>kind</th>
            <th style={{ padding: ".4rem .6rem" }}>title</th>
            <th style={{ padding: ".4rem .6rem" }}>window (UTC)</th>
            <th style={{ padding: ".4rem .6rem" }}>agents</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} style={{ borderTop: "1px solid var(--rule)" }}>
              <td className="mono" style={{ padding: ".45rem .6rem" }}>
                <span
                  style={{
                    color: a.live
                      ? "var(--color-riso-green)"
                      : a.published
                        ? "var(--ink-3)"
                        : "var(--color-riso-red)",
                  }}
                >
                  {a.live ? "live" : a.published ? "scheduled/expired" : "retired"}
                </span>
              </td>
              <td className="mono" style={{ padding: ".45rem .6rem" }}>{a.kind}</td>
              <td style={{ padding: ".45rem .6rem" }}>{a.title}</td>
              <td className="mono" style={{ padding: ".45rem .6rem", color: "var(--ink-2)" }}>
                {a.starts_at} → {a.ends_at ?? "—"}
              </td>
              <td className="mono" style={{ padding: ".45rem .6rem" }}>{a.to_agents ? "yes" : "—"}</td>
              <td style={{ padding: ".45rem .6rem", textAlign: "right" }}>
                {a.published && (
                  <form action={retireAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="mono" style={{ background: "none", border: 0, padding: 0, color: "var(--ink-2)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
                      retire
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p style={{ color: "var(--ink-2)" }}>Nothing announced yet.</p>
      )}
    </AppShell>
  );
}
