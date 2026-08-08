/* ============================================================
   CORE/BRUSH.JS — Reine Zeitfenster-Mathematik fürs Brushing (Etappe 8b)
   docs/phase-5-konzept-explorer.md §4/§7.2 Schritt 1: ein Zeitfenster
   [fromISO, toISO] über dem vollen Horizont [anchorISO, horizonEndISO],
   das Charts (PmcChart) filtert. Kein DOM, keine Pixel — die Pixel-Seite
   übernimmt core/chart-scale.js::makeIndexScale, wie in 8a.
   ============================================================ */

import { addDaysISO, diffDays } from "./format.js";

/**
 * Klemmt ein Fenster auf `[anchorISO, horizonEndISO]` und erzwingt eine
 * Mindestlänge, indem `fromISO` zurückgeschoben wird (nie vor `anchorISO`,
 * nie über `toISO` hinaus — ein kürzerer Horizont als `minDays` bleibt dann
 * einfach so kurz wie er ist, statt zu brechen).
 * @param {{fromISO: string, toISO: string}} win
 * @param {{anchorISO: string, horizonEndISO: string, minDays?: number}} bounds
 * @returns {{fromISO: string, toISO: string}}
 */
export function clampWindow(win, { anchorISO, horizonEndISO, minDays = 3 }) {
  let fromISO = win.fromISO < anchorISO ? anchorISO : win.fromISO;
  let toISO = win.toISO > horizonEndISO ? horizonEndISO : win.toISO;
  if (toISO < anchorISO) toISO = anchorISO;
  if (fromISO > horizonEndISO) fromISO = horizonEndISO;
  if (fromISO > toISO) {
    [fromISO, toISO] = [toISO, fromISO];
  }
  if (diffDays(toISO, fromISO) < minDays) {
    const wanted = addDaysISO(toISO, -minDays);
    fromISO = wanted < anchorISO ? anchorISO : wanted;
  }
  return { fromISO, toISO };
}

/**
 * Voreingestellte Fenster für die Preset-Knopfzeile (§4). `"plan2"` liefert
 * `null`, wenn kein `plan2StartISO` übergeben wurde (Athlet 2/kein Plan 2) —
 * Aufrufer blenden den Button in diesem Fall aus, statt eine leere Auswahl
 * anzubieten.
 * @param {"30"|"90"|"365"|"plan2"|"all"} preset
 * @param {{todayISO: string, anchorISO: string, horizonEndISO: string, plan2StartISO?: string|null}} bounds
 * @returns {{fromISO: string, toISO: string}|null}
 */
export function presetWindow(preset, { todayISO, anchorISO, horizonEndISO, plan2StartISO }) {
  const clamp = (win) => clampWindow(win, { anchorISO, horizonEndISO });
  switch (preset) {
    case "30":
      return clamp({ fromISO: addDaysISO(todayISO, -30), toISO: horizonEndISO });
    case "90":
      return clamp({ fromISO: addDaysISO(todayISO, -90), toISO: horizonEndISO });
    case "365":
      return clamp({ fromISO: addDaysISO(todayISO, -365), toISO: horizonEndISO });
    case "plan2":
      return plan2StartISO ? clamp({ fromISO: plan2StartISO, toISO: horizonEndISO }) : null;
    case "all":
      return clamp({ fromISO: anchorISO, toISO: horizonEndISO });
    default:
      return null;
  }
}
