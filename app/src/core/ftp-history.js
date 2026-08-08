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
 *  zutrifft (leere Liste oder alle Einträge in der Zukunft). Unabhängig von
 *  der Eingabe-Reihenfolge (kein `.at(-1)` auf ungeprüft sortierten Daten).
 *  @param {Array<{validFrom:string}>} entries
 *  @param {string} [todayISO]
 *  @returns {Object|null} */
export function currentFtpEntry(entries, todayISO = localISODate()) {
  const applicable = (entries || []).filter((e) => e.validFrom <= todayISO);
  if (!applicable.length) return null;
  return applicable.reduce((a, b) => (b.validFrom > a.validFrom ? b : a));
}
