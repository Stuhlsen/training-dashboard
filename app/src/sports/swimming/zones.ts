/* ============================================================
   SPORTS/SWIMMING/ZONES.TS — Zonengrenzen Schwimmen (Fahrplan 10 E5)

   !!! GESAMTES SCHWIMM-PROFIL UNKALIBRIERT !!!
   Der E0-Bericht (2026-09-07) fand in Athlet 3s intervals.icu-Account
   NULL Schwimm-Aktivitäten. Alle Werte hier sind ein reines Wertegerüst
   nach Lehrbuch (Swim-Smooth CSS / Maglischo) — gegen echte Daten zu
   prüfen, sobald welche existieren. Entscheidung Alex 2026-09-07: das
   Gerüst wird trotzdem gebaut, dann steht alles, sobald geloggt wird.

   Aufbau 1:1 wie sports/cycling/zones.ts. ANKER (Fahrplan 10 V4 / Q2):
   `upperPct` = Anteil der geschätzten CSS-GESCHWINDIGKEIT (nicht der
   Pace) — aufsteigend, 1,0 = CSS-Tempo.
   ============================================================ */

import type { ZoneMeta, SportZones } from "../types.js";

/** Ziel-Anteil niedrigintensiver Zeit als Richtwert.
 *  Quelle: Seiler, sportartübergreifend (identisch zu Rad/Lauf). */
export const LOW_INTENSITY_TARGET = 0.8;

/** IF-Grenzen für die grobe Ganzeinheit-Bänderung (Ø-Tempo als Anteil
 *  der CSS-Geschwindigkeit): low < 0.90 · mid 0.90–1.05 · high > 1.05.
 *  Deckungsgleich mit classify.ts (`ifLowMax` / `ifSchwelleMax`) gehalten —
 *  dasselbe Muster wie beim Rad. UNKALIBRIERT. */
export const SWIMMING_IF_BANDS = { lowMax: 0.9, midMax: 1.05 };

/** Obergrenzen der 5 Schwimm-Trainingszonen als Anteil der
 *  CSS-Geschwindigkeit. Modell: Swim-Smooth Critical Swim Speed, Zonen
 *  nach Maglischo (2003), *Swimming Fastest*. Die verbreiteten
 *  CSS-Zonen sind als % der CSS-PACE angegeben (Z1 Rekom 115–130 % der
 *  Pace = langsamer, Z5 Sprint 75–90 % = schneller); hier auf die
 *  GESCHWINDIGKEIT umgerechnet (Kehrwert) und damit aufsteigend:
 *  Rekom ≤ 0,87 · Grundlage ≤ 0,95 · CSS ≤ 1,00 · VO2max ≤ 1,10 ·
 *  Sprint ≤ 1,25. Lückenlos verkettet. UNKALIBRIERT. */
export const CSS_ZONE_UPPER_PCT = [0.87, 0.95, 1.0, 1.1, 1.25];

/** Anzeige-Metadaten der CSS-Zonen, index-gleich zu CSS_ZONE_UPPER_PCT.
 *  `farbe` = CSS-Variablenname (Muster aus cycling/zones.ts). Farbrollen
 *  deckungsgleich zu Rad/Lauf: Recovery grün → Sprint violett. */
export const CSS_ZONE_META: readonly ZoneMeta[] = [
  { id: "s1", label: "Rekom", farbe: "var(--z1)" },
  { id: "s2", label: "Grundlage", farbe: "var(--z2)" },
  { id: "s3", label: "CSS", farbe: "var(--z3)" },
  { id: "s4", label: "VO2max", farbe: "var(--thr)" },
  { id: "s5", label: "Sprint", farbe: "var(--vo2)" },
];

export const swimmingZones: SportZones = {
  upperPct: CSS_ZONE_UPPER_PCT,
  meta: CSS_ZONE_META,
  // Schwimmen kennt kein Sweet-Spot-Overlay.
  overlayBandPct: null,
  ifBands: SWIMMING_IF_BANDS,
  lowIntensityTarget: LOW_INTENSITY_TARGET,
};
