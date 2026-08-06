/* ============================================================
   API/RESULT.TS — Brücke zwischen Result-Konvention und React Query

   Die Adapter geben `{ ok: true, … }` / `{ ok: false, error }` zurück und
   werfen nie (Result-Konvention, s. AGENTS.md). React Query erkennt Fehler
   dagegen am geworfenen Wert. Statt in jedem Hook beides von Hand zu
   verweben, gibt es genau diese eine Umschaltstelle:

   - `unwrap()` in queryFn/mutationFn → aus `{ ok:false }` wird ein Wurf,
     damit `isError`, `onError` und der Rollback-Pfad greifen
   - `catchResult()` an der Hook-Oberfläche → daraus wird wieder ein
     Result, damit die UI wie überall sonst `result.ok` prüft

   Die Konvention gilt also weiterhin nach außen; geworfen wird nur
   innerhalb der Zugriffsschicht.
   ============================================================ */

import type { Result, ResultError } from "./types";

/** Ein als Fehler geworfener Result-Fehler. Trägt den ursprünglichen
 *  `{ code, message }` mit, damit die UI dieselbe Meldung zeigen kann wie
 *  vor dem Umbau. */
export class ResultError_ extends Error {
  readonly detail: ResultError;

  constructor(detail: ResultError) {
    super(detail.message);
    this.name = "ResultError";
    this.detail = detail;
  }
}

/** Packt ein Result aus oder wirft. In queryFn/mutationFn verwenden.
 *  `ok: true` bleibt als harmloses Zusatzfeld am Objekt stehen — es
 *  herauszuschneiden hieße, das Objekt nur der Optik wegen neu zu bauen. */
export function unwrap<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new ResultError_(result.error);
  return result as unknown as T;
}

/** Übersetzt einen beliebigen geworfenen Wert zurück in einen
 *  Result-Fehler — behält `code`/`message` bei, wenn es ein ResultError_
 *  war, und fällt sonst auf UNKNOWN zurück. */
export function toResultError(err: unknown): ResultError {
  if (err instanceof ResultError_) return err.detail;
  return { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
}

/** Führt eine werfende Operation aus und liefert wieder ein Result — für
 *  die Hook-Oberfläche, damit Aufrufer `result.ok` prüfen statt zu fangen. */
export async function catchResult<T extends object>(
  run: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return { ok: true, ...(await run()) };
  } catch (err) {
    return { ok: false, error: toResultError(err) };
  }
}
