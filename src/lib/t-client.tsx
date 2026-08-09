"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { normalize } from "@/lib/msg";

/**
 * Translation for the half of the site that runs in the browser.
 *
 * lib/t.ts cannot be used here: it reads the reader's cookie through
 * next/headers, which does not exist on the client, and its keys are a sha1
 * computed with node:crypto, which does not either. So the client gets its own
 * dictionary, and it is keyed by the English sentence rather than by a hash —
 * the hash bought nothing here except a dependency the browser does not have.
 *
 * The English still lives in the JSX and still prints when a translation is
 * missing, which is the whole point of the server side's design and not worth
 * abandoning three components in.
 *
 * What ships: only the strings that client components actually use, and only
 * for the reader's language — see the client/ half of scripts/translate.ts. An
 * English reader gets an empty object. That mattered enough to build: the full
 * dictionary is a quarter of a megabyte in Thai, and it would ride along on
 * every page of the site to translate a cookie bar.
 */
export type ClientDictionary = Record<string, string>;

const Ctx = createContext<ClientDictionary>({});

/**
 * Rendered once, in the root layout, with the dictionary the server loaded.
 *
 * There is no fallback path where this is missing: a client component whose
 * provider never rendered reads the empty default and prints English, which is
 * the same failure as a missing translation and needs no special handling.
 */
export function Translations({
  dict,
  children,
}: {
  dict: ClientDictionary;
  children: ReactNode;
}) {
  return <Ctx.Provider value={dict}>{children}</Ctx.Provider>;
}

/**
 * The client's `t`. Same shape and same promise as the server's:
 *
 *   const t = useT();
 *   <button>{t("Accept all")}</button>
 */
export function useT(): (english: string) => string {
  const dict = useContext(Ctx);
  // Memoised on the dictionary, not rebuilt per render: the returned function
  // ends up in the dependency array of effects in a couple of these
  // components, and a fresh identity every render is a re-run every render.
  return useMemo(() => (english: string) => dict[normalize(english)] ?? english, [dict]);
}
