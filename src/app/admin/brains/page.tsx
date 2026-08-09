import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { requireAdmin, adminBrains } from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { setListing, deleteBrain, settlePublish } from "../actions";
import { query } from "@/db";
import { TOPICS } from "@/lib/topics";

export const dynamic = "force-dynamic";

export const metadata = { title: "Brains — admin", robots: { index: false, follow: false } };

export default async function AdminBrainsPage() {
  const t = await translator();

  await requireAdmin();
  const brains = await adminBrains();

  const pendingPublish = await query<{
    id: string;
    title: string;
    slug: string;
    email: string;
    note_count: number;
    score: number | null;
    price_cents: number;
    asked: string;
  }>(
    `select r.id, b.title, b.slug, u.email, b.note_count, b.score, b.price_cents,
            to_char(r.created_at at time zone 'UTC', 'MM-DD HH24:MI') as asked
       from publish_requests r
       join brains b on b.id = r.brain_id
       join "user" u on u.id = r.requested_by
      where r.status = 'pending'
      order by r.created_at`,
  );

  return (
    <AppShell active="/admin/brains" eyebrow={t("Operator")} title={t("Brains")}>
      {pendingPublish.length > 0 && (
        <div style={{ border: "1.5px solid var(--color-riso-red)", background: "var(--paper-2)", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)", margin: "0 0 .6rem" }}>
            {t("Waiting to go public — read before approving")}</p>
          {pendingPublish.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", padding: ".4rem 0", borderTop: "1px solid var(--rule)" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong>{r.title}</strong>
                <span className="mono" style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}>
                  {markup(t("<0/> · <1/> notes · <2/> <3/> · asked <4/>"), [
                  r.email,
                  r.note_count,
                  r.score === null ? t("not examined") : `${r.score}%`,
                  r.price_cents > 0 && ` · wants ${formatCents(r.price_cents)}`,
                  r.asked,
                ])}</span>
              </div>
              <form action={settlePublish}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="approve" value="yes" />
                <button className="btn" style={{ padding: ".35rem .7rem" }}>{t("Publish")}</button>
              </form>
              <form action={settlePublish}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="approve" value="no" />
                <button className="btn btn-ghost" style={{ padding: ".35rem .7rem" }}>{t("Reject")}</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <p className="lede">
          {markup(
            brains.length === 1
              ? t("<0/> brain. Changing visibility away from public also clears the price — a listing nobody can reach cannot be bought.")
              : t("<0/> brains. Changing visibility away from public also clears the price — a listing nobody can reach cannot be bought."),
            [brains.length],
          )}</p>

        <div className="adm-scroll" style={{ marginTop: "1rem" }}>
          <table className="adm">
            <thead>
              <tr>
                <th>{t("Brain")}</th>
                <th>{t("Owner")}</th>
                <th style={{ textAlign: "right" }}>{t("Notes")}</th>
                <th style={{ textAlign: "right" }}>{t("Sources")}</th>
                <th style={{ textAlign: "right" }}>{t("Score")}</th>
                <th style={{ textAlign: "right" }}>{t("Price")}</th>
                <th style={{ textAlign: "right" }}>{t("Sold")}</th>
                <th>{t("Listing")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {brains.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--ink-2)" }}>
                    {t("No brains yet.")}</td>
                </tr>
              ) : (
                brains.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.visibility === "public" && b.owner_handle ? (
                        <Link
                          href={`/b/${b.owner_handle}/${b.slug}`}
                          style={{ textDecoration: "underline" }}
                        >
                          {b.title}
                        </Link>
                      ) : (
                        b.title
                      )}
                      <span className="mono" style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}>
                        {b.slug}
                      </span>
                    </td>

                    <td style={{ color: "var(--ink-2)" }}>{b.owner_email}</td>

                    <td className="num">{b.note_count}</td>
                    <td className="num">
                      {b.source_count}
                      {b.failed_sources > 0 && (
                        <span style={{ color: "var(--color-riso-red)" }}> ({b.failed_sources}✗)</span>
                      )}
                    </td>
                    <td className="num">{b.score === null ? "—" : `${b.score}%`}</td>
                    <td className="num">{b.price_cents ? formatCents(b.price_cents) : "free"}</td>
                    <td className="num">{b.sales_count || "—"}</td>

                    <td>
                      <form action={setListing} style={{ display: "flex", gap: ".3rem" }}>
                        <input type="hidden" name="id" value={b.id} />
                        <select name="visibility" defaultValue={b.visibility}>
                          <option value="private">{t("private")}</option>
                          <option value="link">{t("link")}</option>
                          <option value="public">{t("public")}</option>
                        </select>
                        <select name="topic" defaultValue={b.topic}>
                          {TOPICS.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit">{t("Set")}</button>
                      </form>
                    </td>

                    <td>
                      {b.sales_count === 0 ? (
                        <form action={deleteBrain}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" data-danger="true">
                            {t("Delete")}</button>
                        </form>
                      ) : (
                        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>
                          {t("sold — kept")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AppShell>
  );
}
