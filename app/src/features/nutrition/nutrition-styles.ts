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
