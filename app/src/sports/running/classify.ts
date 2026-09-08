/* ============================================================
   SPORTS/RUNNING/CLASSIFY.TS — Ist-Typerkennung Laufen (Fahrplan 10 E5)

   Aufbau 1:1 wie sports/cycling/classify.ts. Die `if*`-Schwellen sind
   Anteile der geschätzten Schwellen-GESCHWINDIGKEIT (Q2), monoton
   aufsteigend — dieselbe Form wie die FTP-Anteile beim Rad. Die
   `*Min`-Felder sind Minuten bzw. Sekunden.

   UNKALIBRIERT: die Grenzen spiegeln die Form der Radsport-Kalibrierung
   und sind auf die Daniels-Zonen (zones.ts) abgestimmt, aber nicht an
   echten Läufen geprüft (Athlet 3: 2 Läufe im Account, E0 2026-09-07).
   Die Feldnamen bleiben radsport-geprägt (Fahrplan 10 Q1) — "ftpTest"
   meint hier einen Schwellen-/Zeitfahrt-Test, "SweetSpot" die
   Tempo-/Schwellen-Übergangsgrenze.
   ============================================================ */

import type { SportClassify } from "../types.js";

/** Schwellen der datenbasierten Ist-Typerkennung (künftiger Konsument:
 *  core/session-classify.js, analog zum Rad). Alle IF-Werte = Anteil der
 *  Schwellengeschwindigkeit. UNKALIBRIERT (s. Kopfkommentar). */
export const RUNNING_SESSION_CLASSIFY = Object.freeze({
  ftpTestMaxMin: 20, // Lauf-Schwellentests sind kurz (3-/5-km-Zeitfahrt, 20-min-Test)
  ftpTestMinIF: 0.98, // nahe/über Schwellentempo
  ifLowMax: 0.88, // ≤ : Rekom/Dauerlauf/Longrun je nach Dauer
  ifZ2DauerMax: 0.96, // ≤ : Marathon-nahes zügiges Dauertempo
  ifTempoMax: 1.0,
  ifSweetSpotMax: 1.03, // Tempo-/Schwellen-Übergangsgrenze (Feldname radsport-geprägt)
  ifSchwelleMax: 1.08, // ≥ : Intervalle/VO2max
  longRideMin: 90, // Dauer-Schwelle für "Longrun"
  dauerMin: 45, // Dauer-Schwelle für "Dauerlauf" statt "Rekom"
  langOverrideMin: 150, // sehr lange Einheit im Dauer-Band trotzdem "Longrun"
  shortRideConfidenceMin: 15, // darunter: Konfidenz höchstens "niedrig" (außer Test)
  // Mindestanteil der erwarteten Zonen-Bänder, damit die Zonenverteilung
  // die Tempo-Einstufung bestätigt (Konfidenz "hoch"). Generisch aus dem
  // Radsport übernommen — mangels Lauf-Datenbasis nicht neu kalibriert.
  bandMinShare: Object.freeze({ low: 0.45, mid: 0.35, high: 0.15 }),
  // Blockerkennung: Mindest-Arbeitszeit / -anteil, ab der ein
  // zusammenhängender schneller Block die Einstufung anheben darf.
  // Generisch, an die kürzeren Lauf-Intervalldauern angepasst.
  blockMinDurationSec: 240,
  blockMinSharePct: 0.08,
});

/** Rückfall-TRIMP für einen Typ ohne Eintrag in `defaultLoad` und ohne
 *  eigene Last-/Workout-Angabe — grober Mittelwert einer moderaten
 *  Laufeinheit. UNKALIBRIERT. */
export const RUNNING_FALLBACK_LOAD = 60;

export const runningClassify: SportClassify = {
  ...RUNNING_SESSION_CLASSIFY,
  fallbackLoad: RUNNING_FALLBACK_LOAD,
};
