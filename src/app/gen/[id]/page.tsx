import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { translator } from "@/lib/t";
import { currentUser } from "@/lib/session";
import { packFor } from "@/lib/assetpacks";
import PackGrid from "./PackGrid";

export const dynamic = "force-dynamic";

/** One pack: the brief it was made from, and every asset it produced. */
export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/gen/${id}`);

  // packFor scopes to the owner, so somebody else's pack is a 404 rather than
  // a 403 — a studio's brief is as private as the art it produced.
  const pack = await packFor(id, user.id);
  if (!pack) notFound();

  const done = pack.assets.filter((a) => a.status === "done").length;
  const failed = pack.assets.filter((a) => a.status === "failed").length;

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          <Link href="/gen">{t("gen")}</Link> · {pack.created_at}
        </p>
        <h1 className="display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.5rem)", margin: ".4rem 0 .75rem" }}>
          {pack.title}
        </h1>

        <p className="lede" style={{ maxWidth: "60ch" }}>{pack.brief}</p>
        {pack.palette ? (
          <p className="muted" style={{ maxWidth: "60ch" }}>{pack.palette}</p>
        ) : null}
        {pack.style_title ? (
          <p className="muted">{t("Generated in the style")} {pack.style_title}</p>
        ) : null}

        <p className="muted" style={{ margin: "1.25rem 0" }}>
          {done}/{pack.assets.length}
          {failed ? ` · ${failed} failed and refunded` : ""}
        </p>

        <PackGrid assets={pack.assets} />

        <p className="muted" style={{ marginTop: "2rem", maxWidth: "60ch", fontSize: ".9em" }}>
          {t("Symbols arrive with the background already keyed out and the green rim pulled off the edges — the checkerboard behind each tile is what transparency looks like. Backgrounds and tiles are full bleed, so they keep theirs.")}
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
