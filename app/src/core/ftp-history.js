/* ============================================================
   CORE/FTP-HISTORY.JS — "aktuell gültiger" ftp_history-Eintrag
   (rein, kein DOM/fetch — Schichtenregel core/)

   scripts/lib/ftp-history.js (Node-seitig, ftpAt()) ist eine ANDERE Datei
   und darf laut Schichtenregel nicht aus assets/js/ importiert werden.
   currentFtpEntry() ist die Frontend-Entsprechung: bisher lokal in
   ui/settings-panel.js, hierher gezogen, sobald ein zweiter Konsumenten
   (state/export.js) dazukam — genau der im dortigen Kommentar
   vorgesehene Fall.
   ============================================================ */

import { localISODate } from "./format.js";

/** Eintrag mit dem größten `validFrom <= todayISO`, oder null, wenn keiner
 *  zutrifft (leere Liste, alle Einträge in der Zukunft, oder — mit gesetztem
 *  `source` — keiner mit passender Quelle). Unabhängig von der Eingabe-
 *  Reihenfolge (kein `.at(-1)` auf ungeprüft sortierten Daten). `source`
 *  filtert zusätzlich auf `entries[].source` (z. B. `"ramp-test"`, um
 *  `"schaetzung"`-Einträge auszuschließen) — zentral hier statt an jeder
 *  Aufrufstelle einzeln dupliziert (hero-view-model.ts, export-briefing-
 *  view-model.ts, new-plan-dialog-view-model.ts).
 *  @param {Array<{validFrom:string, source?:string}>} entries
 *  @param {string} [todayISO]
 *  @param {string} [source]
 *  @returns {Object|null} */
export function currentFtpEntry(entries, todayISO = localISODate(), source = undefined) {
  const applicable = (entries || []).filter(
    (e) => e.validFrom <= todayISO && (source == null || e.source === source)
  );
  if (!applicable.length) return null;
  return applicable.reduce((a, b) => (b.validFrom > a.validFrom ? b : a));
}
