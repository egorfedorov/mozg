import { t, type Lang } from "@/lib/i18n";
import { INSTALL } from "@/lib/install";
import { DOCS_LANGS, sitePath } from "@/site/paths";
import LangPicker, { CLOSE_PICKER } from "./LangPicker";

/**
 * The header of every page a person reads.
 *
 * Identity on the left, the way around the site, the language, and the one
 * thing to do next. Pricing and the questions are sections of the landing: on
 * the landing itself they are anchors, from anywhere else a link back to them.
 *
 * The links are written once and shown twice: in a row where they fit beside
 * the wordmark, and behind one button where they do not.
 */
export default function TopBar({ lang, path, surface = "site" }: { lang: Lang; path: string; surface?: "site" | "docs" }) {
  const home = sitePath(lang, "/");
  const onLanding = path === "/";
  const section = (id: string) => (onLanding ? `#${id}` : `${home}#${id}`);
  // The documentation is offered in a language only once it is translated in
  // full; until then its link leads to the English pages.
  const docsHref = surface === "docs" || DOCS_LANGS.includes(lang) ? sitePath(lang, "/docs/") : sitePath("en", "/docs/");
  // The desk is a page on the visitor's own machine. It opens only where the
  // plugin is installed, and a refused tab says so plainly.
  const away = { target: "_blank", rel: "noopener noreferrer" } as const;
  const deskTitle = t("Opens on your own machine. It needs the plugin.");
  const links = [
    { href: section("pricing"), label: t("Pricing") },
    { href: section("questions"), label: t("Questions") },
    { href: sitePath(lang, "/changelog"), label: t("Changelog") },
    { href: docsHref, label: t("Docs") },
    { href: INSTALL.desk, label: t("Your desk"), away: true },
  ];
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <a href={home} className="wordmark" aria-label={t("mozg, to the top")}>
          mozg
          <span aria-hidden="true">.</span>
        </a>

        <nav className="topnav" aria-label={t("Site")}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`navlink ${link.away ? "hide-sm" : "hide-md"}`}
              {...(link.away ? { ...away, title: deskTitle } : {})}
            >
              {link.label}
              {link.away && <span aria-hidden="true"> ↗</span>}
            </a>
          ))}
        </nav>

        <div className="topbar-end">
          {/* Below the middle width the links do not fit beside the wordmark,
              so they sit behind this button. A <details>, like the language
              picker: no script of its own, and it works before anything has
              loaded. */}
          <details className="lang mnav pop">
            <summary className="lang-btn">
              <span className="lang-name">{t("Menu")}</span>
              <span className="lang-caret" aria-hidden="true" />
            </summary>
            <ul className="lang-menu mnav-list">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} {...(link.away ? { ...away, title: deskTitle } : {})}>
                    {link.label}
                    {link.away && <span aria-hidden="true"> ↗</span>}
                  </a>
                </li>
              ))}
              {/* Where the bar is too narrow for the button beside the two
                  menus, it lives in here instead. */}
              <li className="mnav-install">
                <a className="btn" href={section("install")}>
                  {t("Install")}
                </a>
              </li>
            </ul>
          </details>
          <LangPicker lang={lang} path={path} surface={surface} />
          <a className="btn" href={section("install")}>
            {t("Install")}
          </a>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: CLOSE_PICKER }} />
    </header>
  );
}
