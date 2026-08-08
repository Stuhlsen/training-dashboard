import type { CSSProperties } from "react";

/** Geteilte Stil-Bausteine der Settings-Sektionen — Muster wie
 *  LABEL_STYLE/INPUT_STYLE in EventForm.tsx, hier lokal für alle
 *  Settings-Sektionen statt pro Datei dupliziert. */
export const SECTION_STYLE: CSSProperties = {
  padding: "18px 0",
  borderBottom: "1px solid var(--hair)",
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

export const HEADING_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--ink-3)",
  marginBottom: 10,
};

export const ERROR_STYLE: CSSProperties = {
  color: "var(--danger)",
  fontFamily: "var(--font-mono)",
  fontSize: ".62rem",
  minHeight: "1em",
};
