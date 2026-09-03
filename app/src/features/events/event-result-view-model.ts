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
 * „3:12:45" → 11565. Bewusst NUR das eindeutige `h:mm:ss`-Format —
 * „45:30" wäre sonst mehrdeutig (45 h 30 min vs. 45 min 30 s). Führende/
 * folgende Leerzeichen egal. Leer, falsches Format, nicht-numerisch, mm/ss
 * > 59, Null-Dauer → `null` (der Aufrufer zeigt dann einen Formatfehler
 * statt zu speichern).
 * @param {string} input
 * @returns {number | null} Sekunden
 */
export function parseFinishTime(input: string): number | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = /^(\d{1,3}):([0-5]?\d):([0-5]?\d)$/.exec(s);
  if (!m) return null;
  const total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
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
