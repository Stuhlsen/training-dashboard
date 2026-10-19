import type { CSSProperties } from "react";

/** Geteilte Stil-Bausteine der Settings-Sektionen — Muster wie
 *  LABEL_STYLE/INPUT_STYLE in EventForm.tsx, hier lokal für alle
 *  Settings-Sektionen statt pro Datei dupliziert. */
/** Ein Abschnitt als eigene, leicht abgesetzte Karte innerhalb der großen
 *  Gruppen-Karte (SettingsPage). Nur vorhandene Tokens — der Abstand zwischen
 *  den Karten kommt vom Stapel (`SECTION_STACK_STYLE`), nicht vom Abschnitt. */
export const SECTION_STYLE: CSSProperties = {
  padding: "18px 20px",
  background: "rgba(255,255,255,.03)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius)",
};

/** Stapel der Abschnitts-Karten innerhalb einer Gruppe. */
export const SECTION_STACK_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

/** Erklärzeile direkt unter dem Abschnittstitel. */
export const SECTION_DESC_STYLE: CSSProperties = {
  margin: "0 0 14px",
  fontFamily: "var(--font-body)",
  fontSize: ".78rem",
  lineHeight: 1.5,
  color: "var(--ink-3)",
};

export const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--ink-3)",
  marginBottom: 4,
};

export const INPUT_STYLE: CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 11px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".85rem",
  width: "100%",
};

export const LINK_BUTTON_STYLE: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
  color: "var(--ss)",
  padding: 0,
};

/** Abschnittstitel — bewusst deutlicher als die Feld-Labels darunter
 *  (LABEL_STYLE bleibt klein/mono), damit man Abschnitt und Feld auseinanderhält. */
export const HEADING_STYLE: CSSProperties = {
  fontFamily: "var(--font-disp)",
  fontSize: ".92rem",
  fontWeight: 600,
  color: "var(--ink)",
  marginBottom: 6,
};

export const ERROR_STYLE: CSSProperties = {
  color: "var(--danger)",
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
  minHeight: "1em",
};
