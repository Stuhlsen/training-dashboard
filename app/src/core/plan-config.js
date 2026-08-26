/* ============================================================
   CORE/PLAN-CONFIG.JS — Konfig-Defaults für Prognose & Konfliktlogik
   (Phase 3, Schritt 4 — docs/phase-3-konzept-konfliktlogik-prognose.md)

   Reine Datenkonstanten, kein DOM, kein Laufzeit-Verhalten. Bewusst hier
   in core/ statt in state/config.js: core/projection.js und core/conflicts.js
   dürfen state/ nicht importieren (Schichtenregel), sollen aber ohne
   übergebene Options sinnvoll rechnen können. Muster wie die Governor-
   Schwellen als Consts in core/briefing.js (TSB_FRESH …) und CTL_DAYS/
   ATL_DAYS in core/pmc.js — nicht ein zentrales Config-Objekt, sondern
   benannte, an EINER Stelle änderbare Konstanten (K1).

   Etappe 3: Was hier radsportSPEZIFISCH war — das Typvokabular samt
   TSS-Defaults und Intensitätsklassen, die IF-Schwellen der Ist-
   Typerkennung — lebt jetzt in sports/cycling/ (Konzept G5) und wird
   unter unverändertem Namen re-exportiert. Was hier BLEIBT, ist das
   sportartübergreifende Trainingslast-Modell: CONFLICT_THRESHOLDS
   (TSB-/CTL-Rampen-basiert) und LADDER_PROGRESSION.
   ============================================================ */

import {
  TYPE_DEFAULT_TSS,
  TYPE_DEFAULT_TSS_APPROX_TYPES,
  KNOWN_PLAN_TYPES,
  TYPE_EXPECTED_BAND,
  INTENSITY_CLASS,
} from "../sports/cycling/session-types.js";
import { SESSION_CLASSIFY, FALLBACK_TSS } from "../sports/cycling/classify.js";

export {
  TYPE_DEFAULT_TSS,
  TYPE_DEFAULT_TSS_APPROX_TYPES,
  KNOWN_PLAN_TYPES,
  TYPE_EXPECTED_BAND,
  INTENSITY_CLASS,
  SESSION_CLASSIFY,
  FALLBACK_TSS,
};

/**
 * Konflikt-Schwellen (K1) — Coggan-Richtwerte als konservativer Start.
 * Konzept-Entscheidung K1: nach Abschluss von Plan 2 einmal gegen die
 * Ist-Daten reviewen (persönliche Kalibrierung braucht mehr Historie).
 * Alles an dieser einen Stelle änderbar, keine Magic Numbers im Regelcode.
 */
export const CONFLICT_THRESHOLDS = Object.freeze({
  tsbLow: -30, // K-TSB    projizierter TSB unterschreitet Tiefwert → Warnung
  tsbSustained: -20, // K-TSB2   anhaltend tiefer TSB → Warnung, wenn …
  tsbSustainedDays: 3, //          … an ≥ 3 Folgetagen unterschritten
  hardStreakInfo: 2, // K-HART   Hinweis ab 2 harten Tagen in Folge
  hardStreakWarn: 3, //          Warnung ab 3 harten Tagen in Folge
  // K-WOCHENSPRUNG (bis Fenster E1: K-RAMPE) — Wochen-TSS-Sprung > +20 % →
  // Hinweis. Umbenannt (docs/konzept-progressionssteuerung.md P2), weil
  // "K-RAMPE" seither die CTL-Rampe unten meint — andere Größe, anderer Name.
  weekJumpPct: 20,
  // K-RAMPE (neu, P2) — projizierte CTL-Rampe. ctlRampWarn dupliziert
  // bewusst LADDER_PROGRESSION.ctlRampLockThreshold (nicht referenziert:
  // CONFLICT_THRESHOLDS steht vor LADDER_PROGRESSION im Modul, ein Vorgriff
  // wäre eine TDZ-Falle) — gleiche Zahl, gleiche Begründung (C3-Sperrschwelle).
  ctlRampInfo: 6,
  ctlRampWarn: 8,
  // K-WOCHENTSS (neu, P2) — Wochen-TSS über CTL(Wochenstart) × Faktor → Warnung.
  weekTssCeilingFactor: 8,
  // K-TID (neu, P2) — Anteil Ist-Fahrten über dem Blockkorridor-ifMax
  // (core/periodization.js::PHASE_SIGNATURES) in den letzten 4 Wochen →
  // Hinweis. Kein Wert im Konzept vorgegeben — selbst gewählt (20 %),
  // wie K1 nach mehr echter Plan-2-Historie zu kalibrieren.
  highIntensityShareInfo: 0.2,
  eventWindowMain: [5, 20], // K-EVENT  Hauptziel-Event Ziel-TSB-Fenster (außerhalb → Warnung)
  eventWindowSecondary: [-5, 15], //          Nebenziel-Event Ziel-TSB-Fenster (außerhalb → Hinweis)
  restBlockDays: 3, // K-LEER   harte Einheit direkt nach ≥ 3 Ruhetagen → Hinweis
  // core/event-taper.js::isInEventTaper() — Auftrag "Taper-Erkennung für
  // 'Auf Event hin'". KEIN Bestandswert im Repo für den allgemeinen Fall
  // (nur Prosa "3-4 Tage" für is_test-Events in
  // docs/konzept-progressionssteuerung.md D5, bereits separat über
  // presetAction()s isTestEvent-Zweig abgedeckt). Sportwissenschaftliche
  // Empfehlung (26.08.2026 recherchiert): 7-14 Tage üblich, 7-10 Tage
  // als unteres Ende für Amateure — 10 liegt näher an der Mitte dieses
  // Korridors als der vorherige Wert (7, am unteren Rand).
  eventTaperDays: 10,
});

/**
 * Schwellen für das Soll-Ist-Matching und die Compliance-Ampel
 * (core/compliance-match.js, docs/konzept-progressionssteuerung.md C1/C2).
 * Alle Werte 1:1 aus dem Konzept übernommen (C1/C2), nicht neu hergeleitet —
 * die Kalibrierungstabelle im Auftragsbericht ist die erste echte Prüfung
 * dieser Zahlen gegen reale Fahrten, nicht diese Datei.
 */
export const COMPLIANCE = Object.freeze({
  // C1 — ein Intervall gilt als erfüllt, wenn BEIDE Bedingungen zutreffen.
  durationFulfillMinRatio: 0.9, // Ist-Dauer ≥ 90% der geplanten Dauer
  powerFulfillTolerancePct: 0.03, // mittlere Leistung ≥ Zielwatt − 3%

  // Blockerkennung (mergeActiveSegments): Schwelle je Workout wird aus der
  // niedrigsten "aktiven" Zielintensität der Struktur (set.work/
  // alternating.under) abgeleitet, minus dieser Marge (Prozentpunkte von
  // FTP) — trennt Warmup/Cooldown/volle Erholung von echten Arbeitsblöcken,
  // ohne pro Fahrt/Fahrttyp neu raten zu müssen. Bewusst großzügiger als
  // powerFulfillTolerancePct (3%): hier geht es nur um Blockgrenzen finden,
  // nicht um die Erfüllungsprüfung selbst.
  mergeMarginPct: 8,
  // Toleriert kurze Ampeln/Pausen zwischen Wiederholungen beim Zusammenführen
  // von Segmenten zu Blöcken — identischer Wert wie
  // scripts/lib/interval-blocks.js::updateIntervalBlockCache() Default,
  // bewusst hier dupliziert (core/ importiert nicht aus scripts/lib/, s.
  // Schichtenregel; derselbe Kompromiss wie die thresholdIF-Dopplung dort).
  defaultGapToleranceSec: 90,

  // C2 — Ampel. `fadePct` = mittlere Leistung des letzten Arbeitsintervalls
  // gegenüber dem ersten (negativ = Leistungsabfall).
  zoneTimeGreenMinRatio: 0.95, // Zeit in Zone ≥ 95% des Solls → grün-Kriterium
  zoneTimeYellowMinRatio: 0.85, // ≥ 85% → gelb-Kriterium, sonst rot
  fadeGreenMinPct: -0.03, // Fade ≥ −3% → grün-Kriterium
  fadeYellowMinPct: -0.08, // Fade ≥ −8% → gelb-Kriterium, sonst rot
  // C2.1: RPE ≥ 8 wertet eine sonst grüne Einheit NICHT ab bis rot, setzt sie
  // aber auf gelb (verhindert später in C3 das Hochstufen — Fenster D).
  rpeYellowMin: 8,
});

/**
 * Fortschreibungslogik (C3, docs/konzept-progressionssteuerung.md, D4a —
 * NUR als Trockenlauf, s. core/ladder-progression.js/scripts/
 * backtest-ladder.js, nicht scharf geschaltet). `rpeUpgradeBlockMin`
 * dupliziert bewusst NICHT COMPLIANCE.rpeYellowMin als Wert, sondern
 * referenziert es direkt — beide Zahlen müssen laut C2.1 identisch bleiben
 * (derselbe RPE-Schwellwert, der eine Einheit auf gelb setzt, verhindert in
 * C3 auch das Hochstufen), ein zweiter, unabhängig änderbarer Wert wäre
 * eine stille Divergenzquelle.
 */
export const LADDER_PROGRESSION = Object.freeze({
  // C3 — Sperre, wenn die projizierte CTL-Rampe der Folgewoche diesen Wert
  // überschreitet. Auf der TSS/TRIMP-Skalenmischung (vor B0) formuliert —
  // Häufigkeit auf der seit B0 korrigierten Skala ist Teil des D4a-Berichts.
  ctlRampLockThreshold: 8,
  rpeUpgradeBlockMin: COMPLIANCE.rpeYellowMin,
});

/**
 * Ride↔Format-Brücke (D4b Schritt 1, core/session-format-match.js).
 * vo2-short (30/15-Bauart) und vo2-long überlappen sich im Pct-FTP-Band
 * (106-112 vs. 110-112, s. session_formats-Seed Migration 0014) — die
 * Sekunden-Schwelle je Wiederholung der dominanten Arbeitsphase trennt
 * die "kurz"-Bauart (30/15, deutlich unter einer Minute je Wiederholung)
 * von der "lang"-Bauart (3-5 min je Wiederholung). Aus der
 * workout_structure selbst hergeleitet, NICHT aus rohen Ist-Segmenten —
 * anders als die in docs/offene-punkte.md als blockiert dokumentierte
 * Blockdauern-Klassifikation (die galt für Fahrten ohne jede Struktur).
 */
export const FORMAT_MATCH = Object.freeze({
  vo2ShortMaxWorkS: 90,
});

/**
 * Intensitätsklasse eines Session-Typs. Unbekannte Typen → "moderat"
 * (nie versehentlich "hart", damit ein neuer Typ nicht ungewollt K-HART
 * auslöst; nie "ruhe", damit er nicht fälschlich einen Ruheblock bildet).
 * @param {string|null|undefined} typ
 * @param {Record<string,string>} [table]
 * @returns {"hart"|"moderat"|"locker"|"ruhe"}
 */
export function intensityClass(typ, table = INTENSITY_CLASS) {
  return /** @type {any} */ (table[typ] ?? "moderat");
}
