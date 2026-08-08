/* ============================================================
   API/WRITE-GUARD.TS — Reihenfolgeschutz für nebenläufige Mutationen

   Was Query-Keys lösen und was nicht:

   Keyed Queries schließen einen ganzen Fehlerfall strukturell aus — eine
   überholte LADE-Antwort kann nicht mehr im Cache eines anderen Athleten
   landen, weil sie nur unter ihrem eigenen Key ankommt. Dafür braucht es
   den `loadedForAthleteId`-Vergleich der alten `state/*.js`-Module nicht
   mehr.

   Nebenläufige SCHREIBvorgänge auf DENSELBEN Key lösen sie aber nicht. Der
   React-Query-Standardweg für Optimistik (`onMutate` schnappt einen
   Snapshot, `onError` spielt ihn zurück) hat dabei genau den Fehler, den
   die Vanilla-Version bewusst vermeidet: der Rollback eines fehlgeschlagenen
   Vorgangs setzt blind auf einen Stand zurück, der einen inzwischen
   erfolgreichen ZWEITEN Vorgang noch nicht kannte — die neuere Änderung
   verschwindet aus der Anzeige, obwohl die DB sie führt.

   Deshalb bleibt das requestId-Muster erhalten, nur an React Querys
   Lebenszyklus gehängt: `begin()` VOR dem Schreiben, `isCurrent(token)` in
   onError/onSuccess. Ist der Token nicht mehr aktuell, hat ein neuerer
   Vorgang das Feld übernommen — dann wird weder zurückgerollt noch ein
   überholtes Server-Ergebnis angewandt.

   Jede Mutation bumpt, nicht nur die gleichartigen: sonst sähe ein
   laufendes Verschieben ein dazwischengeschobenes Ausfallen nicht und
   würde dessen Ergebnis beim Fehlschlagen wegrollen.

   Der Zustand ist bewusst modulweit (ein Zähler je Key, keine Daten): der
   Schutz muss über einzelne Hook-Instanzen und Re-Renders hinweg gelten —
   zwei Komponenten, die dieselben Karten schreiben, teilen sich dieselbe
   Reihenfolge.
   ============================================================ */

import { createRequestGuard } from "../core/request-guard.js";

interface Guard {
  bump: () => number;
  isCurrent: (token: number) => boolean;
  current: () => number;
}

const guards = new Map<string, Guard>();

function guardFor(scope: string): Guard {
  let guard = guards.get(scope);
  if (!guard) {
    guard = createRequestGuard() as Guard;
    guards.set(scope, guard);
  }
  return guard;
}

/** Beginnt einen Schreibvorgang auf `scope` (i.d.R. die serialisierte
 *  Query-Key-Wurzel, z.B. "plan-cards:athlete1") und liefert den Token,
 *  gegen den später geprüft wird. */
export function beginWrite(scope: string): number {
  return guardFor(scope).bump();
}

/** `false`, sobald ein neuerer Schreibvorgang auf denselben `scope`
 *  begonnen hat — dann Finger weg vom Cache. */
export function isCurrentWrite(scope: string, token: number): boolean {
  return guardFor(scope).isCurrent(token);
}

/** Nur für Tests: setzt die Zähler zurück, damit ein Testfall nicht die
 *  Reihenfolge des vorherigen erbt. */
export function __resetWriteGuards(): void {
  guards.clear();
}
