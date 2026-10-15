/* ============================================================
   CORE/NUTRITION-PROGRESS.JS — Fortschritt "geplant / Ziel" (kein I/O)
   (Fahrplan 25, R1; Tagesziel-Karte und Wochenleiste)

   dayProgress → Anteil der geplanten kcal am Tagesziel, für den
                 Fortschrittsbalken. Die Ampel (rot/gelb/grün) bleibt
                 Sache von `dayAmpel` in nutrition-plan.js — hier nur
                 die Länge des Balkens.
   ============================================================ */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * @param {number | null | undefined} plannedKcal geplante Tagessumme
 * @param {number | null | undefined} targetKcal  Tagesziel
 * @returns {{ ratio: number, percent: number, over: boolean }}
 *   ratio   0…1 für die Balkenbreite (über dem Ziel bleibt der Balken voll)
 *   percent ungekürzt gerundet (115 = 15 % über dem Ziel)
 *   over    geplant > Ziel
 *   Ohne gültiges Ziel (≤ 0, NaN, null) oder ohne Plan: alles 0 — kein Raten.
 */
export function dayProgress(plannedKcal, targetKcal) {
  if (!isNum(targetKcal) || targetKcal <= 0 || !isNum(plannedKcal) || plannedKcal <= 0) {
    return { ratio: 0, percent: 0, over: false };
  }
  const raw = plannedKcal / targetKcal;
  return { ratio: Math.min(raw, 1), percent: Math.round(raw * 100), over: plannedKcal > targetKcal };
}
