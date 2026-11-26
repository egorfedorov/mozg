"use client";

import { useEffect } from "react";
import { setLanguage, type Lang } from "@/lib/i18n";
// The dictionaries themselves. A page is printed with them on the server; in
// the browser they have to be brought along, or every word chosen after a
// click falls back to English whatever the page's language is.
import "@/i18n/messages";

/**
 * From here on, what a page says in the browser is said in the page's language.
 *
 * A page is printed in its language on the server. In the browser the
 * dictionary starts in English, and a part that speaks only after a click (a
 * panel that opens, a card that arrives) chooses its words here.
 */
export default function Speak({ lang }: { lang: Lang }) {
  useEffect(() => {
    setLanguage(lang);
  }, [lang]);
  return null;
}
