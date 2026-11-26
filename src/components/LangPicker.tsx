import { LANG_LABEL, LANG_NAME, LANG_SHORT, LANG_TAG, type Lang } from "@/lib/i18n";
import { DOCS_LANGS, SITE_LANGS, sitePath } from "@/site/paths";

/**
 * The way from one language to another: the same page, in the next language.
 *
 * Only languages translated in full are listed. On a documentation page that
 * is fewer than on the rest of the site, because half a documentation is worse
 * than the English one.
 *
 * It is a `<details>`: it opens and closes without a line of script of its own,
 * and so works before anything has loaded.
 */
export default function LangPicker({ lang, path, surface = "site" }: { lang: Lang; path: string; surface?: "site" | "docs" }) {
  const options = surface === "docs" ? DOCS_LANGS : SITE_LANGS;
  return (
    <details className="lang pop">
      <summary className="lang-btn" title={LANG_LABEL[lang]} aria-label={`${LANG_LABEL[lang]}: ${LANG_NAME[lang]}`}>
        {/* A letter of two scripts: a page speaks more than one alphabet. */}
        <svg className="lang-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M1.5 3.5h8M5.5 1.5v2M8 3.5c-.6 2.6-2.6 4.9-5.5 6M3.5 6c1.2 1.9 3 3.3 4.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8.5 14.5l3-8 3 8M9.6 11.6h3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="lang-name">{LANG_NAME[lang]}</span>
        <span className="lang-short">{LANG_SHORT[lang]}</span>
        <span className="lang-caret" aria-hidden="true" />
      </summary>
      <ul className="lang-menu">
        {options.map((option) => (
          <li key={option}>
            <a href={sitePath(option, path)} hrefLang={LANG_TAG[option]} lang={LANG_TAG[option]} aria-current={option === lang ? "true" : undefined}>
              {LANG_NAME[option]}
              {option === lang && <span aria-hidden="true">✓</span>}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Closes an open menu when the pointer goes elsewhere, on Escape, and when
 * another one opens: two panels open at once would lie over each other.
 * Written once, for every `details.pop` on the page (the top bar's menu too).
 */
export const CLOSE_PICKER = `addEventListener("click",function(e){document.querySelectorAll("details.pop[open]").forEach(function(d){d.contains(e.target)||(d.open=false)})}),addEventListener("keydown",function(e){if("Escape"===e.key){document.querySelectorAll("details.pop[open]").forEach(function(d){d.open=false})}}),addEventListener("toggle",function(e){var t=e.target;t.open&&document.querySelectorAll("details.pop[open]").forEach(function(d){d!==t&&(d.open=false)})},!0);`;
