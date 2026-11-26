import CopyButton from "@/components/CopyButton";
import { t } from "@/lib/i18n";

/**
 * A command or a piece of text, as printed, with the one thing done with it.
 *
 * The copy button sits under the text, in its own row: over the text it would
 * cover the end of a long line, and a command that has to be scrolled to be
 * read is a command that is mis-copied.
 */
export default function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="codeblock">
      {label && <span className="codeblock-label eyebrow">{label}</span>}
      <pre>
        <code>{code}</code>
      </pre>
      <div className="codeblock-bar">
        <CopyButton text={code} label={t("Copy")} copied={t("Copied")} className="btn btn-sm codeblock-copy" />
      </div>
    </div>
  );
}
