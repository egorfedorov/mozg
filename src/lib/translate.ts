import { env } from "@/lib/env";
import { structured, costCents } from "@/lib/claude";
import { recordSpend } from "@/lib/spend";

/**
 * Chat translation, one small model call per message. Haiku at chat-message
 * length is a fraction of a cent, so the only economy that matters is not
 * asking twice — callers cache the result on the message row.
 *
 * `target` is either a language code or `{ sameAs: text }` — "answer in
 * whatever language this sample is written in", which is how a reply follows
 * the user's own language without anyone naming it.
 */

export const REPLY_LANGS = [
  { code: "auto", label: "their language" },
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "pt", label: "Portuguese" },
] as const;

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  es: "Spanish",
  de: "German",
  fr: "French",
  pt: "Portuguese",
};

export async function translate(
  text: string,
  target: string | { sameAs: string },
): Promise<{ text: string; same: boolean }> {
  const model = env.MODEL_TRANSLATE ?? env.MODEL_JUDGE;
  const instruction =
    typeof target === "string"
      ? `Translate into ${LANG_NAMES[target] ?? target}.`
      : `Translate into the language this sample is written in:\n<sample>${target.sameAs.slice(0, 500)}</sample>`;

  const { data, usage } = await structured<{ translation: string; already_target: boolean }>({
    model,
    system:
      "You translate short support-chat messages. Keep the tone, keep code/URLs/product names (mozg, chatmozg, brain names) untranslated, no explanations. " +
      "If the text is ALREADY in the requested language, return it unchanged and set already_target=true.",
    content: [{ type: "text", text: `${instruction}\n\n<message>${text}</message>` }],
    toolName: "submit_translation",
    toolDescription: "Return the translated message.",
    schema: {
      type: "object",
      properties: {
        translation: { type: "string" },
        already_target: { type: "boolean" },
      },
      required: ["translation", "already_target"],
    },
    maxTokens: 2000,
  });

  await recordSpend("translate", costCents(model, usage), { model });

  return { text: data.already_target ? text : data.translation, same: data.already_target };
}
