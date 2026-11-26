import CodeBlock from "@/components/CodeBlock";
import { prose } from "@/components/Prose";
import type { Block } from "@/content/docs";
import { t } from "@/lib/i18n";

/** The blocks of a page, set. Every sentence goes through `t()` as it is set. */
export default function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return (
              <h2 key={i} id={b.id}>
                {prose(t(b.text))}
              </h2>
            );
          case "p":
            return <p key={i}>{prose(t(b.text))}</p>;
          case "list":
            return (
              <ul key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{prose(t(item))}</li>
                ))}
              </ul>
            );
          case "steps":
            return (
              <ol key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{prose(t(item))}</li>
                ))}
              </ol>
            );
          case "code":
            return <CodeBlock key={i} code={b.said ? t(b.code) : b.code} label={b.label ? t(b.label) : undefined} />;
          case "note":
            return (
              <aside key={i} className="doc-note" data-tone={b.tone}>
                <span className="eyebrow">{t(b.tone === "warn" ? "Mind" : "Note")}</span>
                <p>{prose(t(b.text))}</p>
              </aside>
            );
          case "table":
            return (
              <div key={i} className="doc-table">
                <table>
                  {b.head.length > 0 && (
                    <thead>
                      <tr>
                        {b.head.map((cell, j) => (
                          <th key={j} scope="col">
                            {prose(t(cell))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) =>
                          k === 0 ? (
                            <th key={k} scope="row">
                              {prose(t(cell))}
                            </th>
                          ) : (
                            <td key={k}>{prose(t(cell))}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "term":
            return (
              <dl key={i} className="doc-terms">
                <dt>
                  <code>{b.term}</code>
                </dt>
                <dd>{prose(t(b.text))}</dd>
              </dl>
            );
        }
      })}
    </>
  );
}
