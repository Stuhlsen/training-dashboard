/* ============================================================
   FEATURES/PLANNING/COMPLIANCE-RATING.TS — geteilte Ampel-Darstellung
   (Label/Icon/Farbe je Compliance-Rating), genutzt von DoneTable.tsx und
   DoneDetailChart.tsx. Ursprünglich Teil von ComplianceTable.tsx (Etappe
   6c); die Tabellen-Komponente selbst wurde durch WeekGridDetailRow/
   DoneTable/DoneDetailChart ersetzt (Etappe 13c/13d/13e) und beim
   Gesamt-Review nach Etappe 13h als toter Code entfernt — diese drei
   Konstanten blieben die einzigen noch genutzten Exporte. ============= */

export const RATING_LABEL: Record<string, string> = { green: "grün", yellow: "gelb", red: "rot" };
export const RATING_ICON: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
export const RATING_COLOR: Record<string, string> = { green: "var(--ok)", yellow: "var(--warn)", red: "var(--danger)" };
