import { messageUser } from "./actions";
import { REPLY_LANGS } from "@/lib/translate";

/**
 * The one "write to a person" form, folded shut until needed. Lives on the
 * payments list, the people table and the chat page — same action, same
 * translation behaviour everywhere: write Russian, pick the wire language.
 */
export default function MessageUserForm({
  userId,
  label,
}: {
  userId: string;
  label: string;
}) {
  return (
    <details className="reach">
      <summary className="mono">message {label} →</summary>
      <form action={messageUser}>
        <input type="hidden" name="user_id" value={userId} />
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Пиши по-русски — уйдёт на языке собеседника"
        />
        <span style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
          <button className="btn" style={{ padding: ".35rem .8rem" }}>Send</button>
          <label className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", display: "flex", gap: ".35rem", alignItems: "center" }}>
            send in
            <select name="lang" defaultValue="auto" style={{ font: "inherit", border: "1.5px solid var(--ink)", background: "var(--paper)", padding: ".2rem .3rem" }}>
              {REPLY_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
        </span>
      </form>
    </details>
  );
}
