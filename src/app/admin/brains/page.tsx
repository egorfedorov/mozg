import Link from "next/link";
import AppShell from "@/components/AppShell";
import AdminNav from "../AdminNav";
import { requireAdmin, adminBrains } from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { setListing, deleteBrain } from "../actions";
import { TOPICS } from "@/lib/topics";

export const dynamic = "force-dynamic";

export const metadata = { title: "Brains — admin", robots: { index: false, follow: false } };

export default async function AdminBrainsPage() {
  await requireAdmin();
  const brains = await adminBrains();

  return (
    <AppShell active="/admin" eyebrow="Operator" title="Brains">
        <AdminNav active="/admin/brains" />

        <p style={{ color: "var(--ink-2)", maxWidth: "62ch" }}>
          {brains.length} brain{brains.length === 1 ? "" : "s"}. Changing
          visibility away from public also clears the price — a listing nobody
          can reach cannot be bought.
        </p>

        <div className="adm-scroll" style={{ marginTop: "1rem" }}>
          <table className="adm">
            <thead>
              <tr>
                <th>Brain</th>
                <th>Owner</th>
                <th style={{ textAlign: "right" }}>Notes</th>
                <th style={{ textAlign: "right" }}>Sources</th>
                <th style={{ textAlign: "right" }}>Score</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Sold</th>
                <th>Listing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {brains.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--ink-2)" }}>
                    No brains yet.
                  </td>
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
                          <option value="private">private</option>
                          <option value="link">link</option>
                          <option value="public">public</option>
                        </select>
                        <select name="topic" defaultValue={b.topic}>
                          {TOPICS.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit">Set</button>
                      </form>
                    </td>

                    <td>
                      {b.sales_count === 0 ? (
                        <form action={deleteBrain}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" data-danger="true">
                            Delete
                          </button>
                        </form>
                      ) : (
                        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>
                          sold — kept
                        </span>
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
