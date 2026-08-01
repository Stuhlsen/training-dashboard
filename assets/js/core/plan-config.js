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
   ============================================================ */

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
  weekRampPct: 20, // K-RAMPE  Wochen-TSS-Sprung > +20 % → Hinweis
  eventWindowMain: [5, 20], // K-EVENT  Hauptziel-Event Ziel-TSB-Fenster (außerhalb → Warnung)
  eventWindowSecondary: [-5, 15], //          Nebenziel-Event Ziel-TSB-Fenster (außerhalb → Hinweis)
  restBlockDays: 3, // K-LEER   harte Einheit direkt nach ≥ 3 Ruhetagen → Hinweis
});

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
 * `Ruhetag: 0` neu (docs/konzept-progressionssteuerung.md D6, Schritt 2)
 * — bewusst komplett freier Tag, kein geschätzter Wert nötig, Karten dieses
 * Typs tragen in der Praxis ohnehin immer ein explizites `tssPlanned: 0`
 * (Prioritätsstufe 1 in estimateTss, dieser Default greift nur als
 * Rückfallebene). D6.1: `Ruhetag`-Karten werden künftig (Fenster B/C1,
 * `workout_structure`) von der Compliance-Auswertung ausgenommen — hier nur
 * dokumentiert, noch nicht implementiert (kein `workout_structure`-Feld in
 * diesem Fenster).
 *
 * Doppelte Schreibweise aus den Rohdaten bewusst BEIDE behalten, damit eine
 * Karte unabhängig von der Schreibweise ihres Typs auflöst:
 *   "Ausserplanmaessig" (ASCII) vs "Außerplanmäßig" (Umlaut) — unterschiedliche
 *   Belegstärke (s.o.), deshalb unterschiedliche Werte.
 */
export const TYPE_DEFAULT_TSS = Object.freeze({
  Ausrollen: 5,
  Ausserplanmaessig: 55,
  Außerplanmäßig: 42,
  Etappe: 155,
  Freestyle: 76,
  "FTP-Test": 45,
  Gruppenfahrt: 186,
  NLS: 44,
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
export const TYPE_DEFAULT_TSS_APPROX_TYPES = new Set([
  "Ausserplanmaessig",
  "Etappe",
  "Freestyle",
  "Z2 Erholung",
  "Z2 Kadenz",
]);

/** Fallback-TSS für einen Typ, der weder in TYPE_DEFAULT_TSS steht noch
 *  tssPlanned/workout trägt — grober Mittelwert einer moderaten Einheit.
 *  Unverändert seit der TSS/TRIMP-Neuberechnung (01.08.2026) — 70 bleibt
 *  ein plausibler genereller Wert auf der jetzt einheitlichen TSS-Skala. */
export const FALLBACK_TSS = 70;

/** Athlet-1-Zonen-Vokabular für den Karten-Dialog (Typ-Select) — hier statt
 *  in ui/planned.js, weil core/proposal-validator.js dieselbe Liste braucht
 *  (Schema-Konzept §4: "type aus der bekannten Typenliste"), core/ aber nie
 *  aus ui/ importieren darf (Schichtenregel). ui/planned.js re-exportiert
 *  dies weiterhin als TYP_OPTIONS, damit ui/plan-card-dialog.js unverändert
 *  bleibt. Athlet 2 hat keinen Dialog-/Import-Zugriff, sein schmaleres
 *  Vokabular ist hier bewusst außen vor. */
export const KNOWN_PLAN_TYPES = [
  "Sweet Spot",
  "Schwelle",
  "VO2max",
  "Z2 Lang",
  "Z2 Dauer",
  "Z1 Recovery",
  "Gruppenfahrt",
  "FTP-Test",
];

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

/** Welches Zonen-Band (low/mid/high) ein erkannter Typ erwarten lässt —
 *  nur für den Konfidenz-Abgleich in session-classify.js, keine neue
 *  Typenliste. */
export const TYPE_EXPECTED_BAND = Object.freeze({
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
 * Nicht gelistete Typen gelten als "moderat" (s. intensityClass()).
 */
export const INTENSITY_CLASS = Object.freeze({
  "Sweet Spot": "hart",
  Schwelle: "hart",
  VO2max: "hart",
  "FTP-Test": "hart",
  Rennen: "hart",
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
  Ausrollen: "locker",
  NLS: "locker",
  Ruhetag: "ruhe",
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
