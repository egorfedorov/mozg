/**
 * Loads every dictionary. Imported for its side effect at the top of each page
 * of the site, before any sentence is asked for.
 */
import "./messages";
import "./docs";
import "./operator";

export * from "@/lib/i18n";
