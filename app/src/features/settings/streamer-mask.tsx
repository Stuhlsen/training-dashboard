/* ============================================================
   FEATURES/SETTINGS/STREAMER-MASK.TSX — gemeinsame Maske für „Streamer-Modus"
   (hooks/useStreamerMode.ts) und die immer maskierten Felder (Stadt,
   Athlete-ID).

   Die Maske hat bewusst eine FESTE Länge: Punkte in der Länge des Werts
   würden die Länge von Stadt/ID/Gewicht verraten.
   ============================================================ */

import { INPUT_STYLE } from "./section-styles";

export const MASK = "••••••••";

/** Gesperrtes Eingabefeld, das nur die Maske zeigt (Streamer-Modus). */
export function MaskedInput({ label }: { label: string }) {
  return (
    <input
      type="text"
      value={MASK}
      readOnly
      disabled
      aria-label={`${label} (verdeckt)`}
      style={{ ...INPUT_STYLE, letterSpacing: ".15em" }}
    />
  );
}

/** Kurzer Hinweis unter gesperrten Feldern. */
export function StreamerNote() {
  return (
    <p style={{ margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--ink-3)" }}>
      Streamer-Modus aktiv — Felder sind verdeckt und gesperrt. Zum Bearbeiten oben ausschalten.
    </p>
  );
}
