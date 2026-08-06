/* ============================================================
   SPORTS/CYCLING/CLASSIFY.TS — Ist-Typerkennung Radsport (Etappe 3)

   Umgezogen aus core/plan-config.js (SESSION_CLASSIFY, FALLBACK_TSS),
   Werte und Kalibrierungsherleitung unverändert. Die Erkennung selbst
   bleibt in core/session-classify.js — hier stehen nur ihre Schwellen.

   Sportgebunden, weil die if*-Grenzen Anteile der FTP sind: eine
   Laufsport-Implementierung hätte hier Pace-Verhältnisse.
   ============================================================ */

import type { SportClassify } from "../types.js";

/**
 * Schwellen für die datenbasierte Ist-Typerkennung (core/session-classify.js).
 * Die IF-Grenzen (ifLowMax…ifSchwelleMax) sind unverändert aus
 * `scripts/lib/map-activity.js::inferTypFromIF()` übernommen — projekteigene
 * Setzungen, nicht neu erfunden. longRideMin/dauerMin ebenso (bisheriges
 * Verhalten von inferTypFromIF im ifLowMax-Zweig). Neu hinzugekommen:
 * langOverrideMin (erweitert "Z2 Lang" auch ins ifZ2DauerMax-Band, s.
 * Kommentar in session-classify.js) und die Konfidenz-Schwellen
 * (shortRideConfidenceMin, bandMinShare).
 */
export const SESSION_CLASSIFY = Object.freeze({
  ftpTestMaxMin: 30, // Fahrten < diese Dauer + hoher IF → FTP-Test
  ftpTestMinIF: 0.95,
  ifLowMax: 0.75, // < diese IF-Grenze: Recovery/Dauer/Lang je nach Dauer
  ifZ2DauerMax: 0.85, // < diese Grenze: Z2 Dauer (oder Z2 Lang, s. langOverrideMin)
  ifTempoMax: 0.9,
  ifSweetSpotMax: 0.95,
  ifSchwelleMax: 1.05, // ≥ diese Grenze: VO2max
  longRideMin: 120, // Dauer-Schwelle für "Z2 Lang" im ifLowMax-Zweig
  dauerMin: 60, // Dauer-Schwelle für "Z2 Dauer" (statt Z1 Recovery) im ifLowMax-Zweig
  langOverrideMin: 180, // NEU: sehr lange Fahrt im ifZ2DauerMax-Band trotzdem "Z2 Lang"
  shortRideConfidenceMin: 20, // unter dieser Dauer: Konfidenz höchstens "niedrig" (außer FTP-Test)
  // Mindestanteil der erwarteten Zonen-Bänder (Z1/Z2 low · Z3/Z4 mid · Z5+ high),
  // damit die Zonenverteilung die IF-Einstufung bestätigt (→ Konfidenz "hoch").
  // mid prüft mid+high zusammen (ein Schwelle/Sweet-Spot-Block hat i.d.R.
  // Warmup/Cooldown in low, das allein darf die Bestätigung nicht kippen).
  bandMinShare: Object.freeze({ low: 0.45, mid: 0.35, high: 0.15 }),
  // Blockerkennung (scripts/lib/interval-blocks.js::longestBlockAboveThreshold,
  // Schwelle dort bereits ifTempoMax) — Mindest-Arbeitszeit, ab der ein
  // gefundener Block die IF-Einstufung anheben darf. An den beiden
  // ersten Kalibrierungsfahrten vom 30.07.2026 lagen die längsten Blöcke bei
  // 53s (10.07., zu Recht kein Block) bzw. 629s (21.07., echter Sweet-Spot-
  // Ritt) — 300s (5 min) liegt sicher zwischen einer kurzen Anstrengung/einem
  // Ausreißer und einer echten zusammenhängenden Belastungsphase.
  blockMinDurationSec: 300,
  // Zusätzlich zur absoluten Dauer: der Block muss auch einen relevanten
  // ANTEIL der Fahrzeit ausmachen — sonst behandelt eine rein absolute
  // Schwelle eine kurze und eine sehr lange Fahrt gleich, obwohl 5 Minuten
  // bei einer 90-Minuten-Fahrt etwas anderes bedeuten als bei einer 4-Stunden-
  // Fahrt. Beide Bedingungen müssen erfüllt sein (UND, nicht ODER).
  // Kalibriert an allen 53 Ist-Fahrten 01.05.–30.07.2026 (Athlet 1, Bericht
  // 30.07.2026): funktionierender Korridor war 3–9 %; darüber (ab 10 %)
  // reißt bereits der knappste der drei bestätigten Zielfälle (02.07., 8 min
  // auf 88 min = 9,4 %). 8 % gewählt — sicherer Abstand nach oben zum
  // 25.07.-Grenzfall (5 min auf 244 min = 2,1 %, soll NICHT anheben) und
  // spürbarer Sicherheitsabstand nach unten zum knappsten Zielfall.
  blockMinSharePct: 0.08,
});

/** Fallback-TSS für einen Typ, der weder in TYPE_DEFAULT_TSS steht noch
 *  tssPlanned/workout trägt — grober Mittelwert einer moderaten Einheit.
 *  Unverändert seit der TSS/TRIMP-Neuberechnung (01.08.2026) — 70 bleibt
 *  ein plausibler genereller Wert auf der jetzt einheitlichen TSS-Skala. */
export const FALLBACK_TSS = 70;

export const cyclingClassify: SportClassify = {
  ...SESSION_CLASSIFY,
  fallbackLoad: FALLBACK_TSS,
};
