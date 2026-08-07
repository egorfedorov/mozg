import Link from "next/link";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import StyleForm from "./StyleForm";

export const metadata = {
  title: "Create a style brain — mozg",
  description:
    "Describe your style once — palette, light, line, the hard nevers — and it becomes an exam-scored brain any buyer's agent can follow.",
};

/**
 * The guided path from "I am an illustrator" to "my style is a brain".
 * Each field becomes a properly-shaped note; the artist never needs to
 * learn what a note is.
 */
export default async function NewStylePage() {
  const t = await translator();

  return (
    <>
      <TopBar />
      <Contents active="/styles" />
      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          <Link href="/styles">style brains</Link> / new
        </p>
        <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".5rem 0 1rem" }}>
          {t("Put your style into words once.")}</h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          Two ways in, use either or both. <strong>Drop your works</strong>:
          create the brain with just a name, then upload 5–15 of your pieces on
          the next screen — mozg reads them and writes the palette, light and
          line rules it actually sees. <strong>Or write the rules yourself</strong>{" "}
          below: exact values beat adjectives — “warm red” examines terribly,
          “vermilion #e34a33, never on skin” examines well. The exam then
          proves the style is learnable, and that score is what buyers see.
        </p>
        <div style={{ marginTop: "2rem" }}>
          <StyleForm />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
