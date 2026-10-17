/* ============================================================
   FEATURES/NUTRITION/NUTRITION-STYLES.TS — gemeinsame Inline-Stile
   (Fahrplan 23, E6 PR B) — dieselben Werte wie NutritionPage.tsx
   ============================================================ */

import type { CSSProperties } from "react";

export const HEADING_STYLE: CSSProperties = {
  margin: "0 0 12px",
  fontFamily: "var(--font-disp)",
  fontSize: "1.1rem",
  fontWeight: 600,
  color: "var(--ink)",
};

export const TEXT_STYLE: CSSProperties = { margin: "0 0 8px", color: "var(--ink-2)", fontSize: ".9rem", lineHeight: 1.5 };

export const META_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  color: "var(--ink-3)",
  margin: "0 0 6px",
};

export const BUTTON_STYLE: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".8rem",
  cursor: "pointer",
};

export const BUTTON_DISABLED_STYLE: CSSProperties = { ...BUTTON_STYLE, opacity: 0.5, cursor: "not-allowed" };

/* ── Tippziel ≥ 44 px (Fahrplan 25, R1) — für alles Neue; BUTTON_STYLE
   (30 px) bleibt für Bestehendes, das hier nicht angefasst wird. ── */
export const TAP_MIN = 44;

export const TAP_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  minHeight: TAP_MIN,
  padding: "8px 18px",
  fontSize: ".85rem",
};

export const TAP_BUTTON_DISABLED_STYLE: CSSProperties = { ...TAP_BUTTON_STYLE, opacity: 0.5, cursor: "not-allowed" };

/* Liegt direkt über dem Seitenhintergrund: Glas-Fill statt reiner Haarlinie (DESIGN.md, Ghost-Regel) */
export const GLASS: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "var(--glass)",
  backdropFilter: "blur(16px)",
  boxShadow: "var(--e2)",
};

export const FIELD_STYLE: CSSProperties = {
  ...GLASS,
  minHeight: TAP_MIN,
  padding: "8px 14px",
  borderRadius: "var(--radius)",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontSize: ".9rem",
};

/** Feldbeschriftung über Eingabefeldern (Formulare). */
export const LABEL_STYLE: CSSProperties = {
  display: "block",
  margin: "0 0 6px",
  fontFamily: "var(--font-disp)",
  fontSize: ".85rem",
  fontWeight: 600,
  color: "var(--ink)",
};

/** Fehlermeldung unter einem Feld (Farbe = Bedeutung: Gefahr). */
export const FIELD_ERROR_STYLE: CSSProperties = { margin: "6px 0 0", fontSize: ".82rem", color: "var(--danger)" };

/** Die eine Primäraktion je Ansicht: Akzentfläche, dunkler Text (DESIGN.md, Primary). */
export const PRIMARY_BUTTON_STYLE: CSSProperties = {
  ...TAP_BUTTON_STYLE,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "#17110a",
  padding: "9px 22px",
};

export const PRIMARY_BUTTON_DISABLED_STYLE: CSSProperties = {
  ...PRIMARY_BUTTON_STYLE,
  opacity: 0.5,
  cursor: "not-allowed",
};
