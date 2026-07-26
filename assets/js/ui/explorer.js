/* ============================================================
   UI/EXPLORER.JS — Explorer-Mount (Phase 5, Schritt 0)
   Composition: liest Data/Projektion, berechnet den Default-Zeitraum,
   verdrahtet state/explorer.js mit dem Hauptchart. Kein Brush/Crosshair
   in Schritt 0 — die Achse zeigt immer den vollen Horizont (X8).
   ============================================================ */

import { localISODate, addDaysISO } from "../core/format.js";
import { densifyDays } from "../core/days.js";
import { Data } from "../state/data.js";
import { getState as getPlanCardsState } from "../state/plan-cards.js";
import { loadForAthlete, getState as getExplorerState } from "../state/explorer.js";
import { Charts } from "./charts/index.js";

/** Startet/aktualisiert den Explorer-Tab für den aktuell aktiven Athleten.
 *  Wird aus renderAll() neben den übrigen Charts.render*-Aufrufen gerufen. */
export function initExplorer() {
  // Data.rides ist NICHT chronologisch sortiert (nur Data.byDate() ist es,
  // s. state/data.js) — für den Fallback-Endzeitpunkt unten zählt die
  // tatsächlich letzte Fahrt, nicht das letzte Array-Element.
  const rides = Data.byDate().filter((r) => r.ctl != null && r.atl != null);
  const projection = getPlanCardsState().projection;

  const today = localISODate();
  const defaultRange = {
    from: addDaysISO(today, -90),
    to: projection?.horizonEnd ?? rides[rides.length - 1]?.dateISO ?? today,
  };
  loadForAthlete(Data.activeAthleteId, defaultRange);

  const { range } = getExplorerState();
  const to = projection?.horizonEnd ?? range.to;
  const days = densifyDays(range.from, to);

  Charts.renderExplorerMain("chart-explorer-main", days, rides, projection);
}
