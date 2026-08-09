import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lessons — mozg admin" };

/**
 * The editor pass, surveyed: which modules have a compiled lesson, which are
 * still teaching in raw note order. Compiles happen lazily on first study —
 * this page is how the operator pre-warms a course instead
 * (npm run lesson -- --brain <slug>).
 */
export default async function AdminLessonsPage() {
  const t = await translator();

  await requireAdmin().catch(() => redirect("/"));

  const rows = await query<{
    title: string;
    slug: string;
    modules: number;
    compiled: number;
    latest: string | null;
  }>(
    `with mods as (
       select brain_id, coalesce(category, 'general') as cat
         from notes where status = 'active' group by 1, 2
     )
     select b.title, b.slug,
            count(m.cat)::int as modules,
            count(l.category)::int as compiled,
            to_char(max(l.created_at) at time zone 'UTC', 'MM-DD HH24:MI') as latest
       from brains b
       join mods m on m.brain_id = b.id
       left join lessons l on l.brain_id = b.id and l.category = m.cat
      where b.visibility = 'public'
      group by b.id
      order by count(m.cat) - count(l.category) desc, b.title
      limit 100`,
  );

  const done = rows.reduce((n, r) => n + r.compiled, 0);
  const total = rows.reduce((n, r) => n + r.modules, 0);

  return (
    <AppShell active="/admin/lessons" eyebrow={t("Operator")} title={t("Lessons")}>
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        {markup(t("<0/> of <1/> public modules have a compiled lesson. The rest compile on first study, or now: <2>npm run lesson -- --brain &lt;slug&gt;</2>"), [
        done,
        total,
        <span className="mono" key="s2" />,
      ])}</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9375rem" }}>
        <thead>
          <tr className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", textAlign: "left" }}>
            <th style={{ padding: ".4rem .6rem" }}>{t("brain")}</th>
            <th style={{ padding: ".4rem .6rem" }}>{t("modules")}</th>
            <th style={{ padding: ".4rem .6rem" }}>{t("compiled")}</th>
            <th style={{ padding: ".4rem .6rem" }}>{t("latest")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} style={{ borderTop: "1px solid var(--rule)" }}>
              <td style={{ padding: ".45rem .6rem" }}>{r.title}</td>
              <td style={{ padding: ".45rem .6rem" }} className="mono">{r.modules}</td>
              <td style={{ padding: ".45rem .6rem" }} className="mono">
                <span style={{ color: r.compiled === r.modules ? "var(--color-riso-green)" : "var(--color-riso-red)" }}>
                  {r.compiled}
                </span>
              </td>
              <td style={{ padding: ".45rem .6rem" }} className="mono">{r.latest ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
