/* ============================================================
   CORE/REQUEST-GUARD.JS — Race-Guard für nebenläufige Async-Aufrufe
   (kein DOM)

   Ersetzt das bislang 9x unabhängig kopierte requestId/openToken-Muster
   (state/events.js, state/plan-cards.js, state/proposals.js,
   state/trainer-view.js, state/wellbeing.js, ui/checkin-dialog.js,
   ui/event-form.js, ui/import-dialog.js, ui/plan-card-dialog.js — s.
   docs/offene-punkte.md): eine späte Antwort eines überholten Aufrufs
   (Athletenwechsel während des Ladens, ein neuerer Aufruf lief schneller
   durch, ein Dialog wurde zwischenzeitlich erneut geöffnet) darf den
   State/DOM nicht mehr überschreiben. `bump()` VOR dem asynchronen Aufruf
   holen, `isCurrent(token)` DANACH prüfen — genau das Timing-Muster, das
   in jeder der 9 Kopien schon galt.
   ============================================================ */

/**
 * @returns {{bump: () => number, isCurrent: (token: number) => boolean, current: () => number}}
 */
export function createRequestGuard() {
  let current = 0;
  return {
    /** Vor dem asynchronen Aufruf holen — auch für einen reinen
     *  Invalidierungs-Bump ohne eigenen Request (z. B. bei Logout),
     *  dann den Rückgabewert einfach nicht verwenden. */
    bump: () => ++current,
    /** Danach prüfen: `false`, wenn seitdem ein neuerer bump() lief. */
    isCurrent: (token) => token === current,
    /** Nur LESEN, ohne zu bumpen — für einen Aufrufer, der sich das aktuell
     *  gültige Token einer bereits laufenden "Sitzung" merkt (z. B. ein
     *  Dialog-Submit, das sich auf das beim Öffnen geholte Token bezieht,
     *  ohne selbst eine neue Sitzung zu beginnen). */
    current: () => current,
  };
}
