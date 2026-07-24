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
  eventWindowA: [5, 20], // K-EVENT  A-Event Ziel-TSB-Fenster (außerhalb → Warnung)
  eventWindowB: [-5, 15], //          B-Event Ziel-TSB-Fenster (außerhalb → Hinweis)
  restBlockDays: 3, // K-LEER   harte Einheit direkt nach ≥ 3 Ruhetagen → Hinweis
});

/**
 * K3 — Typ-Default-TSS (Prioritätsstufe 3 der TSS-Herkunft, s. Konzept §2):
 * greift nur, wenn eine Karte WEDER `tssPlanned` NOCH ein `workout` trägt.
 * Werte = Median-TRIMP je Session-Typ aus den Ist-Fahrten (TRIMP dient in
 * diesem Projekt als TSS-Proxy, s. ride.trimp) — berechnet als Nebenprodukt
 * in scripts/migrate-plan-to-supabase.js (logMedianTssPerType) und hier 1:1
 * übernommen, nicht geschätzt.
 *
 * ⚠ DÜNNE DATENBASIS — beim K1-Schwellen-Review nach Plan 2 ZUERST
 *   gegenprüfen (s. docs/offene-punkte.md). Typen mit n < 5:
 *     NLS n=1 · Gruppenfahrt n=2 · Außerplanmäßig n=2 · Z2 Erholung n=2 ·
 *     Tempo n=3 · Etappe n=4 · Z2 Kadenz n=4
 *   Diese Defaults sind daher nur grobe Anhaltspunkte.
 *
 * Doppelte Schreibweise aus den Rohdaten bewusst BEIDE behalten, damit eine
 * Karte unabhängig von der Schreibweise ihres Typs auflöst:
 *   "Ausserplanmaessig" (ASCII, n=18, Median 96) vs
 *   "Außerplanmäßig"   (Umlaut, n=2,  Median 70).
 */
export const TYPE_DEFAULT_TSS = Object.freeze({
  Ausrollen: 16,
  Ausserplanmaessig: 96,
  Außerplanmäßig: 70,
  Etappe: 268,
  Freestyle: 131,
  "FTP-Test": 67,
  Gruppenfahrt: 177,
  NLS: 97,
  Rennen: 129,
  Schwelle: 97,
  "Sweet Spot": 99,
  Tempo: 84,
  VO2max: 87,
  "Z1 Recovery": 62,
  Z2: 66,
  "Z2 Dauer": 94,
  "Z2 Erholung": 101,
  "Z2 Kadenz": 109,
  "Z2 Lang": 221,
});

/** Fallback-TSS für einen Typ, der weder in TYPE_DEFAULT_TSS steht noch
 *  tssPlanned/workout trägt — grober Mittelwert einer moderaten Einheit. */
export const FALLBACK_TSS = 70;

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
