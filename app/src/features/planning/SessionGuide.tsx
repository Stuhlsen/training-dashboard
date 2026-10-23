/* ============================================================
   FEATURES/PLANNING/SESSIONGUIDE.TSX — Trainings-Guide einer Planungskarte
   (Fahrplan 34, E3). Zielzeile immer sichtbar, darunter eingeklappt
   „Warum & wie" mit den übrigen Abschnitten und „ⓘ Quelle" (Muster
   ZoneExplainer). Native <details>/<summary>: per Tastatur bedienbar,
   standardmäßig zu. Reiner UI-Teil — Texte kommen aus dem View-Model.
   ============================================================ */

import type { CSSProperties } from "react";
import { InfoIcon } from "../../components/InfoIcon";
import { SourceList } from "../nutrition/SourceList";
import type { SessionGuideView } from "./session-guide-view-model";

const TEXT_STYLE: CSSProperties = { margin: 0, fontSize: ".8rem", lineHeight: 1.55, color: "var(--ink-2)" };

const SUMMARY_STYLE: CSSProperties = {
  cursor: "pointer",
  color: "var(--ink-3)",
  fontSize: ".76rem",
  fontWeight: 600,
  width: "fit-content",
};

const LABEL_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".66rem",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

export function SessionGuide({ view }: { view: SessionGuideView }) {
  return (
    <div data-session-guide style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ ...TEXT_STYLE, color: "var(--ink)" }}>
        <span style={LABEL_STYLE}>Ziel </span>
        {view.goal}
      </p>
      {view.sections.length > 0 && (
        <details>
          <summary style={SUMMARY_STYLE}>Warum &amp; wie</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {view.sections.map((s) => (
              <p key={s.id} style={TEXT_STYLE}>
                <span style={LABEL_STYLE}>{s.title} </span>
                {s.text}
                {s.hint && <span style={{ color: "var(--ink-3)" }}> {s.hint}</span>}
              </p>
            ))}
            {view.sources.length > 0 && (
              <details>
                <summary style={{ ...SUMMARY_STYLE, fontWeight: 400 }}>
                  <InfoIcon style={{ marginRight: "0.35em" }} />
                  Quelle
                </summary>
                <SourceList sources={view.sources} />
              </details>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
