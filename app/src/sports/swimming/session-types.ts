/* ============================================================
   SPORTS/SWIMMING/SESSION-TYPES.TS — Typvokabular Schwimmen (Fahrplan 10 E5)

   !!! UNKALIBRIERT — 0 Schwimm-Aktivitäten im Account (E0 2026-09-07) !!!
   Sämtliche `defaultLoad`-Werte sind reine Lehrbuch-/Erfahrungsschätzungen
   ohne Datenbasis. Jeder Typ steht deshalb in `defaultLoadApprox`. Gegen
   echte Daten prüfen, sobald welche existieren.

   Aufbau 1:1 wie sports/cycling/session-types.ts. Vokabular aus
   Fahrplan 10 V4 (wird Phase-2-Kartendialog-/Validator-Vokabular).
   ============================================================ */

import type {
  SportSessionTypes,
  PhaseSignature,
  EfficiencyComparable,
} from "../types.js";

/** Bekannte Schwimm-Einheitstypen (Fahrplan 10 V4). Kein "Ruhetag" —
 *  Ruhetage sind seit Fahrplan 6 abgeleitet, keine Karten. */
export const SWIMMING_KNOWN_TYPES: readonly string[] = [
  "Technik",
  "Intervalle",
  "Longswim",
  "Rekom",
];

/** Typ-Default-TRIMP je typischer Einheit. UNKALIBRIERT — grobe
 *  Schätzung ohne Datenbasis (0 Schwimm-Aktivitäten). Schwimmeinheiten
 *  sind meist kürzer als Rad/Lauf; die Werte liegen entsprechend tiefer. */
export const SWIMMING_TYPE_DEFAULT_LOAD: Readonly<Record<string, number>> = Object.freeze({
  Technik: 25, // technikbetont, viele Pausen, niedrige Intensität
  Intervalle: 55, // CSS-/VO2max-Wiederholungen inkl. Ein-/Ausschwimmen
  Longswim: 70, // langes zusammenhängendes Grundlagentempo
  Rekom: 20, // sehr lockeres kurzes Regenerationsschwimmen
});

/** ALLE Schwimmtypen sind Näherungen — keine Datenbasis. */
export const SWIMMING_TYPE_DEFAULT_LOAD_APPROX_TYPES: ReadonlySet<string> = new Set(
  SWIMMING_KNOWN_TYPES,
);

/** Intensitätsklasse je Typ (hart/moderat/locker/ruhe). Nicht gelistete
 *  Typen gelten als "moderat" (Konvention aus core/plan-config.js). */
export const SWIMMING_INTENSITY_CLASS: Readonly<Record<string, string>> = Object.freeze({
  Intervalle: "hart",
  Technik: "locker",
  Longswim: "locker",
  Rekom: "locker",
});

/** Erwartetes Zonen-Band je Typ, für den Konfidenz-Abgleich. */
export const SWIMMING_TYPE_EXPECTED_BAND: Readonly<Record<string, string>> = Object.freeze({
  Technik: "low",
  Longswim: "low",
  Rekom: "low",
  Intervalle: "high",
});

/** Reizsignaturen je Periodisierungsblock (Ganzeinheit-Ø-Tempo als
 *  Anteil der CSS-Geschwindigkeit). GENERISCH — Schwimmen hat noch keinen
 *  Plan mit benannten Blöcken (Fahrplan 10 Q5). Minimaler Satz, in
 *  Phase 2 durch echte Plan-Blöcke ersetzt. UNKALIBRIERT. */
export const SWIMMING_PHASE_SIGNATURES: Readonly<Record<string, PhaseSignature>> = {
  Grundlage: { ifMin: 0.85, ifMax: 0.97, types: ["Longswim", "Technik"] },
  Schwelle: { ifMin: 0.97, ifMax: 1.03, types: ["Intervalle"] },
  VO2max: { ifMin: 1.0, ifMax: 1.12, types: ["Intervalle"] },
};

/** Wann zwei Schwimmeinheiten für den Pace:HF-Effizienz-Trend
 *  vergleichbar sind. `tempRange` = WASSERtemperatur °C (nicht Luft) —
 *  weit gefasst, weil v1 Becken und Freiwasser nicht unterscheidet
 *  (OF-3). Einheiten ohne Temperaturdaten werden nicht ausgeschlossen. */
export const SWIMMING_COMPARABLE: EfficiencyComparable = {
  types: ["Longswim"],
  minDurationMin: 20,
  tempRange: [18, 32],
};

export const swimmingSessionTypes: SportSessionTypes = {
  known: SWIMMING_KNOWN_TYPES,
  defaultLoad: SWIMMING_TYPE_DEFAULT_LOAD,
  defaultLoadApprox: SWIMMING_TYPE_DEFAULT_LOAD_APPROX_TYPES,
  intensityClass: SWIMMING_INTENSITY_CLASS,
  expectedBand: SWIMMING_TYPE_EXPECTED_BAND,
  phaseSignatures: SWIMMING_PHASE_SIGNATURES,
  efficiencyComparable: SWIMMING_COMPARABLE,
};
