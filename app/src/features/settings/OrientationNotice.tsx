/* ============================================================
   FEATURES/SETTINGS/ORIENTATIONNOTICE.TSX — Hinweis bei Zielen und
   Ernährungszielen (Fahrplan 43 E7)

   Ein kurzer, ruhiger Satz: Die Werte sind Orientierung und kein Ersatz für
   Fachberatung. Bewusst ohne Warnfarbe, ohne Symbol, ohne Diagnose. Ein
   gemeinsamer Text für die Ziel-Einstellungen, die Ernährungsziele und die
   Hinweise am Tagesziel.
   ============================================================ */

export const ORIENTATION_NOTICE_TEXT = "Die Werte sind Orientierung und kein Ersatz für Fachberatung.";

const NOTICE_STYLE = {
  margin: 0,
  color: "var(--ink-3)",
  fontFamily: "var(--font-body)",
  fontSize: ".74rem",
  lineHeight: 1.5,
} as const;

export function OrientationNotice() {
  return <p style={NOTICE_STYLE}>{ORIENTATION_NOTICE_TEXT}</p>;
}
