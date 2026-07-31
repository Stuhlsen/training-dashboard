/* ============================================================
   SCRIPTS/LIB/COVERAGE.JS — Geteilte Feld-Abdeckungs-Zählung
   Reine Zählschleife: non-null-Werte je Feld über eine Liste bereits
   gemappter Objekte. War unabhängig in scripts/lib/wellness.js
   (fieldCoverage, gebunden an WELLNESS_FIELDS) UND scripts/lib/
   map-activity.js::rpeFeelCoverage() (rpe/feelIcu hartkodiert)
   dupliziert, s. docs/offene-punkte.md. Beide behalten ihre eigene
   Logging-Ausgabe (unterschiedlicher Ton: Wellness-Lücken sind normal/
   erwartet, RPE/Feel-Lücken deuten eher auf falsche Feldnamen hin) —
   nur die Zählung selbst ist hier geteilt.
   ============================================================ */

/**
 * Non-null-Zählung je Feld.
 * @param {Array<Record<string, unknown>>} rows bereits gemappte Objekte
 * @param {string[]} fields zu zählende Feldnamen
 * @returns {Record<string, number>}
 */
export function countFieldCoverage(rows, fields) {
  const counts = {};
  for (const f of fields) counts[f] = 0;
  for (const row of rows || []) {
    for (const f of fields) {
      if (row[f] != null) counts[f]++;
    }
  }
  return counts;
}
