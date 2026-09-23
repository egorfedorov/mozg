import type { Metadata } from "next";
import { translator } from "@/lib/t";

export const metadata: Metadata = {
  title: "mozg is closed while 2.0 is built",
  robots: { index: false, follow: false },
};

/**
 * What every page serves while CLOSED is set in middleware.ts. No header, no
 * links: everything a link could lead to is this page too.
 */
export default async function Closed() {
  const t = await translator();

  return (
    <main
      className="shell"
      style={{ paddingBlock: "clamp(4rem, 14vw, 9rem)", maxWidth: 640 }}
    >
      <p className="eyebrow">
        mozg<span style={{ color: "var(--color-riso-red)" }}>.</span> · {t("temporarily closed")}
      </p>
      <h1
        className="display"
        style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)", margin: ".75rem 0 1.5rem" }}
      >
        {t("We are building")}{" "}
        <span
          style={{
            display: "inline-block",
            background: "var(--color-riso-yellow)",
            border: "3px solid var(--ink)",
            boxShadow: "5px 5px 0 var(--ink)",
            padding: "0 .3em",
            transform: "rotate(-2deg)",
          }}
        >
          mozg 2.0
        </span>
      </h1>
      <p style={{ fontSize: "1.125rem", marginTop: 0 }}>
        {t("The service is closed while the next version is built. Signing up, reading brains and the MCP connection are paused until then.")}
      </p>
      <p style={{ color: "var(--ink-2)" }}>
        {t("Nothing is deleted: your account, your brains and everything they learned will be there when mozg reopens.")}
      </p>
    </main>
  );
}
