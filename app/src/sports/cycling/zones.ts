/* ============================================================
   SPORTS/CYCLING/ZONES.TS — Zonengrenzen Radsport (Etappe 3)

   Umgezogen aus core/zones.js — Werte und Herleitung unverändert, nur
   der Ort ist neu. core/zones.js re-exportiert sie unter denselben Namen
   weiter, damit keine Aufrufstelle sich ändern musste; die Berechnung
   selbst (computeZones, bandZoneTimes, …) bleibt dort.
   ============================================================ */

import type { ZoneMeta, SportZones } from "../types.js";

/** Ziel-Anteil niedrigintensiver Zeit (Z1+Z2) als Richtwert.
 *  Grundlage: Intensitätsverteilungs-Forschung (Seiler) — für
 *  Ausdauersportler haben sich pyramidale/polarisierte Verteilungen
 *  mit ≥ ~80% Zeit im niedrigintensiven Bereich bewährt. */
export const LOW_INTENSITY_TARGET = 0.8;

/** IF-Grenzen für die Fallback-Bänderung (Ganzfahrt-IF, grob):
 *  low < 0.75 · mid 0.75–1.05 · high > 1.05 */
export const IF_BANDS = { lowMax: 0.75, midMax: 1.05 };

/** Obergrenzen der Coggan-Zonen in % FTP (Z1 <55% · Z2 55–75% ·
 *  Z3 76–90% · Z4 91–105% · Z5 106–120%). Die Zonen werden lückenlos
 *  verkettet (Zone n.bisW === Zone n+1.vonW) — die minimalen
 *  1%-Textlücken der Spec ("75%" vs. "76%") verschwinden ohnehin bei
 *  gerundeten Wattgrenzen und würden sonst eine Lücke in der Skala
 *  reißen. Z6+ (>120%) ist bewusst NICHT Teil des Arrays — auf der
 *  Skala nur als offener Rand angedeutet, kein volles Segment. */
export const COGGAN_ZONE_UPPER_PCT = [0.55, 0.75, 0.9, 1.05, 1.2];

/** Anzeige-Metadaten der Coggan-Zonen, index-gleich zu
 *  COGGAN_ZONE_UPPER_PCT. Die `farbe`-Einträge sind CSS-Variablennamen —
 *  ein UI-Token in der Wertschicht, siehe README ("Grenzfälle"). */
export const COGGAN_ZONE_META: readonly ZoneMeta[] = [
  { id: "z1", label: "Z1 Recovery", farbe: "var(--z1)" },
  { id: "z2", label: "Z2 Endurance", farbe: "var(--z2)" },
  { id: "z3", label: "Z3 Tempo", farbe: "var(--z3)" },
  { id: "z4", label: "Z4 Threshold", farbe: "var(--thr)" },
  { id: "z5", label: "Z5 VO2max", farbe: "var(--vo2)" },
];

/** Sweet-Spot-Overlay-Band in % FTP (88–94%) — KEINE eigene Zone,
 *  sondern ein Band, das über der Z3/Z4-Grenze liegt. Liegt vollständig
 *  innerhalb Z3+Z4 (s. COGGAN_ZONE_UPPER_PCT); intervals.icu liefert die
 *  Zeit darin zusätzlich als "SS"-Eintrag mit, weshalb
 *  core/zones.js::normalizeZoneTimes() sie vor der Bänderung
 *  herausfiltert (sonst Doppelzählung). */
export const SWEET_SPOT_PCT: readonly [number, number] = [0.88, 0.94];

export const cyclingZones: SportZones = {
  upperPct: COGGAN_ZONE_UPPER_PCT,
  meta: COGGAN_ZONE_META,
  overlayBandPct: SWEET_SPOT_PCT,
  ifBands: IF_BANDS,
  lowIntensityTarget: LOW_INTENSITY_TARGET,
};
