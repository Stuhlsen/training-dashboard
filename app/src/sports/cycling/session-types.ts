/* ============================================================
   SPORTS/CYCLING/SESSION-TYPES.TS — Typvokabular Radsport (Etappe 3)

   Umgezogen aus core/plan-config.js (Typenliste, TSS-Defaults,
   Intensitätsklassen, erwartete Bänder), core/periodization.js
   (Reizsignaturen) und core/efficiency.js (Vergleichbarkeitskriterien).
   Werte und Herleitungen unverändert — die core-Module re-exportieren
   sie unter denselben Namen weiter.

   Das ist die Gruppe, die eine zweite Sportart am sichtbarsten ersetzen
   müsste: "Sweet Spot"/"Z2 Lang" sind Radsport-Vokabular, und die
   TSS-Defaults sind an echten Radfahrten kalibriert.
   ============================================================ */

import type {
  SportSessionTypes,
  PhaseSignature,
  EfficiencyComparable,
} from "../types.js";

/**
 * K3 — Typ-Default-TSS (Prioritätsstufe 3 der TSS-Herkunft, s. Konzept §2):
 * greift nur, wenn eine Karte WEDER `tssPlanned` NOCH ein `workout` trägt.
 *
 * **Neuberechnung (01.08.2026, docs/konzept-progressionssteuerung.md B0):**
 * Die frühere Behauptung, TRIMP sei ein verifizierter TSS-Proxy, war nie
 * geprüft worden. Gegenprobe auf allen 158 Ist-Fahrten mit BEIDEN Feldern
 * (`data/rides.json` + `rides-2.json`, `ride.tss` = `icu_training_load`
 * leistungsbasiert, `ride.trimp` = `act.trimp` herzfrequenzbasiert) zeigt:
 * TRIMP liegt nicht 10–20 % unter TSS (frühere n=4-Vermutung), sondern
 * durchgängig 30–70 % ÜBER TSS (Median-Verhältnis TSS/TRIMP je Typ 0.31–1.06,
 * gepoolter Median ≈0.58) — die beiden Metriken sind schlicht unterschiedlich
 * skaliert, kein fixer Faktor gilt für alle Typen gleich gut.
 *
 * Werte sind jetzt, wo vorhanden, ECHTE Median-TSS je Typ (nicht mehr TRIMP).
 * Alle 8 über den Dialog/Validator wählbaren Typen (KNOWN_PLAN_TYPES) haben
 * reale TSS-Belege (n=4–37):
 *   Sweet Spot n=9 (72) · Schwelle n=10 (57) · VO2max n=9 (50) ·
 *   Z2 Lang n=14 (146) · Z2 Dauer n=37 (57) · Z1 Recovery n=26 (37) ·
 *   Gruppenfahrt n=4 (186, dünn) · FTP-Test n=6 (45)
 * sowie außerhalb der Dialog-Liste (defensive Altlasten, z.B. migrierte
 * Karten): Ausrollen n=15 (5) · Rennen n=7 (75) · Tempo n=3 (46, dünn) ·
 * Außerplanmäßig n=2 (42, dünn) · NLS n=2 (44, dünn).
 *
 * Fünf Typen haben KEINE einzige Fahrt mit leistungsbasiertem TSS (reine
 * TRIMP/HF-Fahrten ohne Powermeter-Match) — für sie bleibt nur eine
 * Näherung: Median-TRIMP × gepoolter Faktor 0.58 (s.
 * TYPE_DEFAULT_TSS_APPROX_TYPES, core/projection.js::estimateTss markiert
 * diese Werte zusätzlich mit `scale: "tss-approx"`):
 *   Ausserplanmaessig 96→55 · Etappe 268→155 · Freestyle 131→76 ·
 *   Z2 Erholung 101→58 · Z2 Kadenz 109→63.
 *
 * `Race` (19.08.2026, docs/offene-punkte.md): Athlet 2s GFNY-Bremen-Renntag
 * (scripts/lib/plan-athlete2.js, "2026-08-30"), eigenes Typ-Wort neben
 * "Rennen" (Rennsimulation), noch nicht gefahren — kein Ist-TSS möglich.
 * Ebenfalls Näherung, aber aus der Standard-Coggan-Formel statt TRIMP-
 * Faktor, weil die Karte selbst schon eine Watt-/Dauer-Zielangabe trägt
 * ("Ziel unter 3:00h · Ø 220–235W"): IF = Ø227.5W / FTP 265W ≈ 0.86,
 * TSS = 3h × IF² × 100 ≈ 221. Nach dem Renntag (30.08.) durch den echten
 * Ist-Wert ersetzen, sobald die Fahrt synchronisiert ist.
 *
 * `Ruhetag: 0` (docs/konzept-progressionssteuerung.md D6, Schritt 2)
 * — bewusst komplett freier Tag, kein geschätzter Wert nötig. Seit Fahrplan 6
 * (RUH2/RUH3, docs/fahrplan-6-ruhetag-planwochen-modell.md) werden Ruhetage
 * NICHT mehr als `plan_cards`-Zeilen erzeugt, sondern aus dem Plan-Wochen-
 * Modell abgeleitet (`core/plan-week-model.js::planWeekFor().isRestSlot`).
 * Dieser Default bleibt nur als defensive Rückfallebene für Alt-/migrierte
 * Supabase-Karten mit `typ:"Ruhetag"` (bis RUH6 gelöscht).
 *
 * Doppelte Schreibweise aus den Rohdaten bewusst BEIDE behalten, damit eine
 * Karte unabhängig von der Schreibweise ihres Typs auflöst:
 *   "Ausserplanmaessig" (ASCII) vs "Außerplanmäßig" (Umlaut) — unterschiedliche
 *   Belegstärke (s.o.), deshalb unterschiedliche Werte.
 */
export const TYPE_DEFAULT_TSS: Readonly<Record<string, number>> = Object.freeze({
  Ausrollen: 5,
  Ausserplanmaessig: 55,
  Außerplanmäßig: 42,
  Etappe: 155,
  Freestyle: 76,
  "FTP-Test": 45,
  Gruppenfahrt: 186,
  NLS: 44,
  Race: 221,
  Rennen: 75,
  Ruhetag: 0,
  Schwelle: 57,
  "Sweet Spot": 72,
  Tempo: 46,
  VO2max: 50,
  "Z1 Recovery": 37,
  Z2: 33,
  "Z2 Dauer": 57,
  "Z2 Erholung": 58,
  "Z2 Kadenz": 63,
  "Z2 Lang": 146,
});

/** Typen ohne einzige Ist-Fahrt mit leistungsbasiertem TSS (Stand 01.08.2026,
 *  s. Kommentar bei TYPE_DEFAULT_TSS) — ihr Default ist eine TRIMP-Näherung,
 *  keine echte TSS-Median. core/projection.js::estimateTss markiert Karten
 *  dieser Typen zusätzlich mit `scale: "tss-approx"`. */
export const TYPE_DEFAULT_TSS_APPROX_TYPES: ReadonlySet<string> = new Set([
  "Ausserplanmaessig",
  "Etappe",
  "Freestyle",
  "Race",
  "Z2 Erholung",
  "Z2 Kadenz",
]);

/** Athlet-1-Zonen-Vokabular für den Karten-Dialog (Typ-Select) — hier statt
 *  in ui/planned.js, weil core/proposal-validator.js dieselbe Liste braucht
 *  (Schema-Konzept §4: "type aus der bekannten Typenliste"), core/ aber nie
 *  aus ui/ importieren darf (Schichtenregel). Athlet 2 hat keinen Dialog-/
 *  Import-Zugriff, sein schmaleres Vokabular ist hier bewusst außen vor. */
export const KNOWN_PLAN_TYPES: readonly string[] = [
  "Sweet Spot",
  "Schwelle",
  "VO2max",
  "Z2 Lang",
  "Z2 Dauer",
  "Z1 Recovery",
  "Gruppenfahrt",
  "FTP-Test",
  // Ruhetag (docs/konzept-progressionssteuerung.md D6, Schritt 2): bewusst
  // komplett freier Tag, target_tss=0. Reuse eines bereits bestehenden Typ-
  // Strings — INTENSITY_CLASS.Ruhetag/Planned._typColor/_typIcon kannten ihn
  // schon (bisher nur für Athlet 2s statisches, read-only Schedule genutzt,
  // dort in ui/planned.js weiterhin athletenscoped ausgeblendet). D6s
  // "recovery"-Rolle (Z1-Ausfahrt, echter TSS-Wert) deckt das bereits
  // vorhandene "Z1 Recovery" ab — kein zweiter neuer Typ nötig.
  "Ruhetag",
];

/** Welches Zonen-Band (low/mid/high) ein erkannter Typ erwarten lässt —
 *  nur für den Konfidenz-Abgleich in session-classify.js, keine neue
 *  Typenliste. */
export const TYPE_EXPECTED_BAND: Readonly<Record<string, string>> = Object.freeze({
  "Z1 Recovery": "low",
  "Z2 Dauer": "low",
  "Z2 Lang": "low",
  Ausrollen: "low",
  Tempo: "mid",
  "Sweet Spot": "mid",
  Schwelle: "mid",
  VO2max: "high",
  "FTP-Test": "high",
});

/**
 * Intensitätsklassen für K-HART (harte Einheiten an Folgetagen). Deckungs-
 * gleich mit den border-left-Farben aus dem CRUD-Konzept §2:
 *   hart    = Schwelle, VO2max, Sweet Spot, FTP-Test (+ Renn-/Etappen-Efforts)
 *   moderat = Z3/Tempo, Gruppenfahrt, Freestyle, außerplanmäßige Fahrten
 *   locker  = Z2-Varianten, Recovery, Ausrollen, NLS (Nachtlangstrecke = locker)
 *   ruhe    = Ruhetag
 * Nicht gelistete Typen gelten als "moderat" (s. core/plan-config.js
 * ::intensityClass()).
 *
 * D6.2 (docs/konzept-progressionssteuerung.md): `Ruhetag` zählt bewusst
 * weder als "hart" noch als "leicht" (locker), sondern als eigene Kategorie
 * "ruhe" — für die K-HARTFOLGE-Regel (core/conflicts.js, Fenster E1d)
 * erfüllen sowohl `Ruhetag` als auch `Z1 Recovery` die Trennbedingung
 * zwischen zwei harten Tagen, sind hier aber bewusst unterschiedlich
 * klassifiziert ("ruhe" vs. "locker"), weil nur `Ruhetag` ein echter
 * Null-Reiz-Tag ist.
 *
 * Fahrplan 6 (RUH3): „bewusst frei" für K-LEER/K-HARTFOLGE kommt jetzt
 * primär aus dem Plan-Wochen-Modell — ein Ruhe-Slot-Tag OHNE Karte gilt als
 * "ruhe", ein Trainings-Slot-Tag ohne Karte als "leer" (echte Planungslücke,
 * s. core/conflicts.js::isRestEquivalent). Der `Ruhetag`-Key hier bleibt für
 * migrierte Karten, die noch `typ:"Ruhetag"` tragen (bis RUH6).
 */
export const INTENSITY_CLASS: Readonly<Record<string, string>> = Object.freeze({
  "Sweet Spot": "hart",
  Schwelle: "hart",
  VO2max: "hart",
  "FTP-Test": "hart",
  Rennen: "hart",
  Race: "hart", // Athlet 2 GFNY-Bremen-Renntag, eigenes Typ-Wort neben "Rennen" (Rennsimulation)
  Etappe: "hart",
  Tempo: "moderat",
  Gruppenfahrt: "moderat",
  Freestyle: "moderat",
  Ausserplanmaessig: "moderat",
  Außerplanmäßig: "moderat",
  "Z2 Lang": "locker",
  "Z2 Dauer": "locker",
  Z2: "locker",
  "Z2 Kadenz": "locker",
  "Z2 Erholung": "locker",
  "Z1 Recovery": "locker",
  Z1: "locker", // Athlet 2 Kurzform von "Z1 Recovery"
  Ausrollen: "locker",
  NLS: "locker",
  Ruhetag: "ruhe",
  // Reine Erinnerungskarte ohne Trainingsreiz (z.B. Athlet 2 "Ausrüstung
  // checken" vor dem Renntag) — für K-HART/K-HARTFOLGE/K-LEER wie ein
  // Ruhetag: kein harter Tag, keine Planungslücke, trennt zwei harte Tage.
  Notiz: "ruhe",
});

/** Reizsignaturen der Plan-2-Blöcke (Ganzfahrt-IF-Korridore).
 *  Untergrenzen bewusst leicht unter Intervall-Zielbereich, weil
 *  Ein-/Ausrollen den Ganzfahrt-IF nach unten zieht. */
export const PHASE_SIGNATURES: Readonly<Record<string, PhaseSignature>> = {
  "Sweet Spot": { ifMin: 0.8, ifMax: 0.97, types: ["Sweet Spot"] },
  Schwelle: { ifMin: 0.9, ifMax: 1.05, types: ["Schwelle"] },
  VO2max: { ifMin: 1.0, ifMax: 1.4, types: ["VO2max"] },
};

/** Wann zwei Fahrten für den Effizienz-Trend (Watt/Herzschlag) vergleichbar
 *  sind: gleiche Intensität (Z2), ausreichende Dauer, moderate Temperatur.
 *  Sonst verrauschen Intervalltage und Hitzefahrten den Trend. */
export const COMPARABLE: EfficiencyComparable = {
  types: ["Z2 Lang", "Z2 Dauer"],
  minDurationMin: 60,
  tempRange: [5, 30], // °C; Fahrten ohne Wetterdaten werden nicht ausgeschlossen
};

export const cyclingSessionTypes: SportSessionTypes = {
  known: KNOWN_PLAN_TYPES,
  defaultLoad: TYPE_DEFAULT_TSS,
  defaultLoadApprox: TYPE_DEFAULT_TSS_APPROX_TYPES,
  intensityClass: INTENSITY_CLASS,
  expectedBand: TYPE_EXPECTED_BAND,
  phaseSignatures: PHASE_SIGNATURES,
  efficiencyComparable: COMPARABLE,
};
