/* ============================================================
   CORE/DAYS.JS — Dichtes Tagesgerüst (Phase 5, Schritt 0)
   Ersetzt eine Zeitstempelskala: über einer lückenlosen Tagesreihe
   ist der Index bereits eine Datumsachse (docs/phase-5-konzept-
   explorer.md §2.2, docs/chart-grundlagen.md §5/G10).
   ============================================================ */

import { addDaysISO } from "./format.js";

/**
 * Lückenloses Tagesgerüst zwischen zwei ISO-Daten (inklusive beider Enden).
 * Densifiziert wird nur die Achse — welchen Wert eine Serie an einem
 * fehlenden Tag bekommt, entscheidet `alignToDays()`.
 * @param {string} fromISO
 * @param {string} toISO
 * @returns {string[]}
 */
export function densifyDays(fromISO, toISO) {
  const days = [];
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) days.push(d);
  return days;
}

/**
 * Bildet eine Serie (Datum → Wert) auf ein Tagesgerüst ab. Ein fehlender Tag
 * bedeutet nicht bei jeder Metrik dasselbe: TSS/Distanz/Höhenmeter hatten an
 * einem Ruhetag tatsächlich keine Belastung (`0` ist korrekt) — CTL/ATL/TSB
 * dagegen sind ein kontinuierlicher ZUSTAND (exponentiell geglättet), der an
 * einem Ruhetag existiert, nur eben nicht als eigene Zeile in `Data.rides`
 * (das nur Aktivitäten enthält, keine Ruhetage). Für diese Zustandsgrößen ist
 * `0` eine Falschaussage — richtig ist `"gap"` (→ `null`) plus anschließend
 * `fillGaps()`, NICHT `"zero"` (s. Regressionsfund beim ersten Rendern des
 * Explorer-Hauptcharts, Playwright-Screenshot zeigte CTL/ATL fälschlich auf 0
 * einbrechend zwischen jedem Trainingstag). Messmetriken (HRV, Ruhepuls,
 * Gewicht, aerobe Effizienz, Decoupling, eFTP) bekommen aus demselben Grund
 * `"gap"`, bewusst OHNE `fillGaps()` (eine erfundene Interpolation wäre dort
 * eine Präzision, die die Messung nicht hergibt — nur bei echten
 * Zustandsgrößen ist eine Zwischenlage physikalisch begründet).
 * @param {string[]} days Tagesgerüst aus densifyDays()
 * @param {Map<string, number>|Record<string, number>} valuesByDate
 * @param {"zero"|"gap"} absence
 * @returns {Array<number|null>}
 */
export function alignToDays(days, valuesByDate, absence) {
  const get = valuesByDate instanceof Map ? (d) => valuesByDate.get(d) : (d) => valuesByDate[d];
  const fallback = absence === "zero" ? 0 : null;
  return days.map((d) => {
    const v = get(d);
    return v != null ? v : fallback;
  });
}

/**
 * Füllt `null`-Lücken einer Werteserie linear zwischen bekannten Nachbarn;
 * Ränder ohne einen bekannten Nachbarn übernehmen den nächstliegenden
 * bekannten Wert (kein Extrapolieren über den Rand hinaus). Für
 * Zustandsgrößen (CTL/ATL/TSB) gedacht, die zwischen zwei bekannten Punkten
 * stetig verlaufen — anders als core/pmc.js::interpolateCtl() (das auf
 * Fahrten-Reihen arbeitet, indexbasiert über tatsächliche Ride-Objekte)
 * arbeitet dies auf einer bereits dichten Werteserie, ein Eintrag pro
 * Kalendertag.
 * @param {Array<number|null>} values
 * @returns {Array<number|null>} unverändert (alles `null`), falls die Serie
 *  keinen einzigen bekannten Wert enthält
 */
export function fillGaps(values) {
  const n = values.length;
  const out = values.slice();
  let i = 0;
  while (i < n) {
    if (out[i] != null) {
      i++;
      continue;
    }
    let prevIdx = i - 1;
    while (prevIdx >= 0 && out[prevIdx] == null) prevIdx--;
    let nextIdx = i;
    while (nextIdx < n && values[nextIdx] == null) nextIdx++;
    const prevVal = prevIdx >= 0 ? out[prevIdx] : null;
    const nextVal = nextIdx < n ? values[nextIdx] : null;
    for (let j = i; j < nextIdx; j++) {
      if (prevVal != null && nextVal != null) {
        out[j] = prevVal + ((j - prevIdx) / (nextIdx - prevIdx)) * (nextVal - prevVal);
      } else if (prevVal != null) {
        out[j] = prevVal;
      } else if (nextVal != null) {
        out[j] = nextVal;
      }
    }
    i = nextIdx;
  }
  return out;
}
