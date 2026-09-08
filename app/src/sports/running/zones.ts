/* ============================================================
   SPORTS/RUNNING/ZONES.TS — Zonengrenzen Laufen (Fahrplan 10 E5)

   Aufbau 1:1 wie sports/cycling/zones.ts. Werte NEU hergeleitet
   (kein Umzug aus core/) — jede Konstante trägt ihre Quelle im
   Kommentar. Noch von niemandem konsumiert: E7 baut daraus die
   Pace-Zonen, E6 die Default-Lasten.

   ANKER (Fahrplan 10 V4 / Q2): `upperPct` ist der Anteil der
   geschätzten Schwellen-GESCHWINDIGKEIT (nicht der Pace) — aufsteigend,
   exakt dieselbe Denkweise wie % FTP beim Rad. 1.0 = Schwellentempo,
   < 1.0 langsamer, > 1.0 schneller.
   ============================================================ */

import type { ZoneMeta, SportZones } from "../types.js";

/** Ziel-Anteil niedrigintensiver Zeit als Richtwert.
 *  Quelle: Seiler, Intensitätsverteilungs-Forschung — ~80 % der Zeit
 *  niedrigintensiv, sportartübergreifend (identisch zum Radsport). */
export const LOW_INTENSITY_TARGET = 0.8;

/** IF-Grenzen für die grobe Ganzfahrt-Bänderung (Ø-Tempo der Einheit
 *  als Anteil der Schwellengeschwindigkeit): low < 0.88 · mid 0.88–1.08 ·
 *  high > 1.08. Deckungsgleich mit classify.ts (`ifLowMax` / `ifSchwelleMax`)
 *  gehalten — dasselbe Muster wie beim Rad (IF_BANDS-Endpunkte = die
 *  äußeren SESSION_CLASSIFY-Grenzen). UNKALIBRIERT — Athlet 3 hat erst
 *  2 Läufe im Account (E0-Bericht 2026-09-07). */
export const RUNNING_IF_BANDS = { lowMax: 0.88, midMax: 1.08 };

/** Obergrenzen der 5 Lauf-Trainingszonen als Anteil der
 *  Schwellengeschwindigkeit. Modell: Jack Daniels, "Daniels' Running
 *  Formula" — E (Easy) / M (Marathon) / T (Threshold) / I (Interval) /
 *  R (Repetition). Herleitung: T-Tempo ≈ 88 % der Geschwindigkeit an
 *  vVO2max; die Zonen-Obergrenzen in % vVO2max (E ≤ 78 · M ≤ 84 ·
 *  T ≤ 92 · I ≤ 100 · R > 100) durch 0,88 auf die Schwellengeschwindigkeit
 *  bezogen und mit dem VDOT-49-Rechenbeispiel gegengeprüft (E 8:19 · M 7:11
 *  · T 6:56 · I 6:21 · R 6:00 pro Meile → Geschwindigkeitsverhältnisse
 *  0,83 / 0,97 / 1,00 / 1,09 / 1,16). Lückenlos verkettet wie beim Rad.
 *  Z6+ (Sprint über R) bewusst NICHT im Array. UNKALIBRIERT. */
export const DANIELS_ZONE_UPPER_PCT = [0.89, 0.97, 1.04, 1.13, 1.2];

/** Anzeige-Metadaten der Daniels-Zonen, index-gleich zu
 *  DANIELS_ZONE_UPPER_PCT. `farbe` = CSS-Variablenname (Vorbestand-Muster
 *  aus cycling/zones.ts — UI-Token in der Wertschicht, s. sports/README.md).
 *  Farbrollen deckungsgleich zum Rad: Recovery grün → VO2max violett. */
export const DANIELS_ZONE_META: readonly ZoneMeta[] = [
  { id: "e", label: "E Easy", farbe: "var(--z1)" },
  { id: "m", label: "M Marathon", farbe: "var(--z2)" },
  { id: "t", label: "T Schwelle", farbe: "var(--z3)" },
  { id: "i", label: "I Intervall", farbe: "var(--thr)" },
  { id: "r", label: "R Wiederholung", farbe: "var(--vo2)" },
];

export const runningZones: SportZones = {
  upperPct: DANIELS_ZONE_UPPER_PCT,
  meta: DANIELS_ZONE_META,
  // Laufen kennt kein Sweet-Spot-Overlay — genau der Fall, für den das
  // Vertragsfeld nullable ist (s. sports/README.md).
  overlayBandPct: null,
  ifBands: RUNNING_IF_BANDS,
  lowIntensityTarget: LOW_INTENSITY_TARGET,
};
