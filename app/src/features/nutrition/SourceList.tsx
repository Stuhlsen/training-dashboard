/* ============================================================
   FEATURES/NUTRITION/SOURCELIST.TSX — Quellenliste mit Links
   (Fahrplan 23, E22) — gemeinsam für Tagesziel-Karte und Tageskarten
   ============================================================ */

import type { CSSProperties } from "react";

export interface SourceListItem {
  key: string;
  title: string;
  /** Zitat bzw. Fundstelle als Text */
  link: string;
  /** Klickbare Adresse, falls es eine stabile gibt */
  url?: string;
  /** Kurzer Herkunftsvermerk (z. B. "Originalquelle gelesen"), optional */
  status?: string;
}

const LIST_STYLE: CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: 20,
  color: "var(--ink-3)",
  fontSize: ".8rem",
  lineHeight: 1.5,
};

export function SourceList({ sources }: { sources: readonly SourceListItem[] }) {
  return (
    <ul style={LIST_STYLE}>
      {sources.map((s) => (
        <li key={s.key} style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--ink-2)" }}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                {s.title}
              </a>
            ) : (
              s.title
            )}
          </strong>
          {s.link && (
            <>
              <br />
              {s.link}
            </>
          )}
          {s.status && (
            <>
              <br />
              <em>{s.status}</em>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
