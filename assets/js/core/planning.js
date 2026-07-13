/* ============================================================
   CORE/PLANNING.JS — Session + Adjustment → aktueller Zustand (kein DOM)
   Zentrale Zusammenführung von plannedSessions (statischer Plan) und
   adjustments.json (Verschiebung/Ausfall) zu einem aktuellen Termin.
   Wird von ui/planned.js (Planungs-Tab-Anzeige + Workout-Push),
   core/weekreview.js, core/adherence.js und core/ftp-progress.js
   genutzt, statt die Zusammenführung an jeder Stelle zu duplizieren.
   ============================================================ */

/**
 * Wendet ein Adjustment (verschoben/ausgefallen) auf eine einzelne
 * geplante Session an.
 * @param {{date: string}} session
 * @param {Record<string, {cancelled?: boolean, movedTo?: string, reason?: string}>} [adjustments]
 * @returns {Object & {date: string, originalDate?: string, cancelled?: boolean, cancelReason?: string, movedReason?: string}}
 */
export function applyAdjustment(session, adjustments) {
  const adj = adjustments?.[session.date];
  if (!adj) return session;
  if (adj.cancelled) return { ...session, cancelled: true, cancelReason: adj.reason };
  if (adj.movedTo) {
    return { ...session, originalDate: session.date, date: adj.movedTo, movedReason: adj.reason };
  }
  return session;
}

/**
 * Wendet Adjustments auf alle Sessions an und entfernt ausgefallene —
 * Standardfall für Auswertungen, die nur (ggf. verschobene) aktive
 * Termine zählen (Wochenrückblick, Adhärenz, nächste Session). Der
 * Planungs-Tab selbst listet ausgefallene Sessions weiter auf und ruft
 * dafür applyAdjustment() direkt pro Session auf.
 * @param {Array<{date: string}>} sessions
 * @param {Record<string, Object>} [adjustments]
 * @returns {Array}
 */
export function effectiveSessions(sessions, adjustments) {
  return (sessions || [])
    .map((s) => applyAdjustment(s, adjustments))
    .filter((s) => !s.cancelled);
}
