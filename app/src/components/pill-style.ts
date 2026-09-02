import type { CSSProperties } from "react";

/** Gemeinsame Pill-Optik der Kopfzeile (Nav-Tabs, Anmelden-Link,
 *  Konto-Pille). Eigene Datei, damit `Layout.tsx` und `UserMenu.tsx` sie
 *  teilen können, ohne einen Import-Zyklus zwischen den beiden aufzumachen.
 *  Optik aus assets/css/components.css::.tab-btn, an die React-Pill-
 *  Konvention angeglichen (heller Overlay-Fill statt vollflächigem
 *  `--accent`). */
export const PILL_BUTTON_STYLE: CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--pill)",
  border: "1px solid var(--hair)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".86rem",
  whiteSpace: "nowrap",
  cursor: "pointer",
  textDecoration: "none",
};
