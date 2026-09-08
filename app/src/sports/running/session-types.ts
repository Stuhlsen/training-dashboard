/* ============================================================
   SPORTS/RUNNING/SESSION-TYPES.TS — Typvokabular Laufen (Fahrplan 10 E5)

   Aufbau 1:1 wie sports/cycling/session-types.ts. Das Vokabular
   ("Dauerlauf"/"Tempolauf"/…) ist Lauf-spezifisch und stammt aus
   Fahrplan 10 Vertrag V4. Es wird in Phase 2 zum Vokabular des
   Karten-Dialogs und des Vorschlags-Validators.

   ALLE Lastwerte (defaultLoad) sind UNKALIBRIERT: Athlet 3 hat erst
   2 Läufe im Account (E0-Bericht 2026-09-07). Deshalb steht jeder Typ
   in `defaultLoadApprox`. Die Werte sind grobe Banister-TRIMP-Schätzungen
   (TRIMP = Dauer_min × HRr × a × e^(b·HRr), Konstanten aus der Literatur —
   die echte Rechnung baut E6) für eine typische Einheit des jeweiligen Typs.
   ============================================================ */

import type {
  SportSessionTypes,
  PhaseSignature,
  EfficiencyComparable,
} from "../types.js";

/** Bekannte Lauf-Einheitstypen (Fahrplan 10 V4). Wird in Phase 2 das
 *  Auswahl-Vokabular für den Karten-Dialog + Vorschlags-Validator.
 *  Kein "Ruhetag" — Ruhetage sind seit Fahrplan 6 abgeleitet, keine Karten. */
export const RUNNING_KNOWN_TYPES: readonly string[] = [
  "Dauerlauf",
  "Intervalle",
  "Longrun",
  "Tempolauf",
  "Rekom",
];

/** Typ-Default-TRIMP: greift nur, wenn eine Karte weder einen expliziten
 *  Lastwert noch eine Workout-Struktur trägt. UNKALIBRIERT — grobe
 *  Banister-TRIMP-Schätzung je typischer Einheit (Dauer × HFr-Reserve),
 *  gegen echte Läufe zu prüfen, sobald welche existieren. */
export const RUNNING_TYPE_DEFAULT_LOAD: Readonly<Record<string, number>> = Object.freeze({
  Dauerlauf: 55, // ~45 min ruhiges aerobes Laufen, HFr ≈ 0,60
  Intervalle: 80, // ~50 min inkl. Ein-/Auslaufen, VO2max-/Schwellen-Wiederholungen
  Longrun: 120, // ≥ 90 min aerob, HFr ≈ 0,65
  Tempolauf: 75, // ~40 min Schwellen-Dauerlauf plus Ein-/Auslaufen
  Rekom: 25, // ~25 min sehr lockeres Regenerationstraben
});

/** ALLE Lauftypen sind Näherungen (kein echter Median) — Athlet 3 hat
 *  keine belastbare Lauf-Datenbasis. Analog `scale: "tss-approx"` beim Rad
 *  markiert E6 diese Werte zusätzlich in der `scale`-Herkunft. */
export const RUNNING_TYPE_DEFAULT_LOAD_APPROX_TYPES: ReadonlySet<string> = new Set(
  RUNNING_KNOWN_TYPES,
);

/** Intensitätsklasse je Typ (hart/moderat/locker/ruhe) — für K-HART
 *  (harte Einheiten an Folgetagen). Nicht gelistete Typen gelten als
 *  "moderat" (Konvention aus core/plan-config.js::intensityClass). */
export const RUNNING_INTENSITY_CLASS: Readonly<Record<string, string>> = Object.freeze({
  Tempolauf: "hart",
  Intervalle: "hart",
  Dauerlauf: "locker",
  Longrun: "locker",
  Rekom: "locker",
});

/** Erwartetes Zonen-Band (low/mid/high) je Typ — nur für den
 *  Konfidenz-Abgleich der Ist-Typerkennung, keine zweite Typenliste. */
export const RUNNING_TYPE_EXPECTED_BAND: Readonly<Record<string, string>> = Object.freeze({
  Dauerlauf: "low",
  Longrun: "low",
  Rekom: "low",
  Tempolauf: "mid",
  Intervalle: "high",
});

/** Reizsignaturen je Periodisierungsblock (Ganzeinheit-Ø-Tempo als
 *  Anteil der Schwellengeschwindigkeit). GENERISCH — Athlet 3 hat noch
 *  keinen Laufplan mit benannten Blöcken (Fahrplan 10 Q5). Minimaler Satz,
 *  damit E6/E7 etwas zum Andocken haben; in Phase 2 durch echte
 *  Plan-Blöcke ersetzt. */
export const RUNNING_PHASE_SIGNATURES: Readonly<Record<string, PhaseSignature>> = {
  Grundlage: { ifMin: 0.7, ifMax: 0.9, types: ["Dauerlauf", "Longrun"] },
  Schwelle: { ifMin: 0.95, ifMax: 1.05, types: ["Tempolauf"] },
  VO2max: { ifMin: 1.05, ifMax: 1.2, types: ["Intervalle"] },
};

/** Wann zwei Läufe für den Pace:HF-Effizienz-Trend vergleichbar sind:
 *  gleiche (niedrige) Intensität, ausreichende Dauer, moderate Temperatur.
 *  `tempRange` = Lufttemperatur °C; Läufe ohne Wetterdaten werden nicht
 *  ausgeschlossen (Konvention wie beim Rad). */
export const RUNNING_COMPARABLE: EfficiencyComparable = {
  types: ["Dauerlauf", "Longrun"],
  minDurationMin: 40,
  tempRange: [5, 25],
};

export const runningSessionTypes: SportSessionTypes = {
  known: RUNNING_KNOWN_TYPES,
  defaultLoad: RUNNING_TYPE_DEFAULT_LOAD,
  defaultLoadApprox: RUNNING_TYPE_DEFAULT_LOAD_APPROX_TYPES,
  intensityClass: RUNNING_INTENSITY_CLASS,
  expectedBand: RUNNING_TYPE_EXPECTED_BAND,
  phaseSignatures: RUNNING_PHASE_SIGNATURES,
  efficiencyComparable: RUNNING_COMPARABLE,
};
