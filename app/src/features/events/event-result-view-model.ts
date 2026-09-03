/* ============================================================
   FEATURES/EVENTS/EVENT-RESULT-VIEW-MODEL.TS — reine Zeit-Parse/Format-Logik
   für die Rennergebnis-Felder (Migration 0027, Punkt 3).

   Kein React, kein I/O — nur die Umrechnung „h:mm:ss ⇄ Sekunden" und ein
   Helfer „trägt dieses Event überhaupt ein Ergebnis". Einzeln getestet
   (event-result-view-model.test.ts), damit das Formular reines Rendering
   bleibt.
   ============================================================ */

import type { EventItem } from "../../api/types";

/**
 * „3:12:45" → 11565. Akzeptiert auch „3:12" (h:mm) und „192:30" (mm:ss,
 * erkannt daran, dass bei zwei Teilen der erste ≥ 60 ist). Führende/
 * folgende Leerzeichen egal. Leer, negativ, nicht-numerisch, > 59 in
 * einem Minuten-/Sekunden-Feld → `null` (der Aufrufer zeigt dann einen
 * Formatfehler statt zu speichern).
 * @param {string} input
 * @returns {number | null} Sekunden
 */
export function parseFinishTime(input: string): number | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  let total: number;
  if (nums.length === 3) {
    const [h, m, sec] = nums;
    if (m > 59 || sec > 59) return null;
    total = h * 3600 + m * 60 + sec;
  } else if (nums[0] >= 60) {
    // „192:30" = 192 Min 30 s (Minuten unbegrenzt, nur Sekunden < 60)
    const [m, sec] = nums;
    if (sec > 59) return null;
    total = m * 60 + sec;
  } else {
    // „3:12" = 3 h 12 min
    const [h, m] = nums;
    if (m > 59) return null;
    total = h * 3600 + m * 60;
  }
  return total > 0 ? total : null;
}

/** 11565 → „3:12:45". `null`/≤0 → "". */
export function formatFinishTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.round(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Trägt dieses Event irgendein Rennergebnis? */
export function hasRaceResult(
  e: Pick<EventItem, "resultTimeS" | "resultAvgWatts" | "resultPlaceAg" | "resultPlaceOverall">,
): boolean {
  return (
    e.resultTimeS != null ||
    e.resultAvgWatts != null ||
    e.resultPlaceAg != null ||
    e.resultPlaceOverall != null
  );
}
