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
 * Werte = Median-TRIMP je Session-Typ aus den Ist-Fahrten (TRIMP dient in
 * diesem Projekt als TSS-Proxy, s. ride.trimp) — berechnet als Nebenprodukt
 * in scripts/migrate-plan-to-supabase.js (logMedianTssPerType) und hier 1:1
 * übernommen, nicht geschätzt.
 *
 * **Review (30.07.2026, auf Alex' Wunsch vorgezogen — Plan 2 selbst läuft
 * noch bis zum Retest 19.09.2026):** gegen den aktuellen Datenstand
 * (`data/rides.json` + `rides-2.json`) neu berechnet. Die gut belegten Typen
 * (n≥5) haben sich moderat verschoben (z.B. Schwelle 97→104, Z2 Lang
 * 221→228, Z1 Recovery 62→67) und wurden aktualisiert — echter Gewinn aus
 * der inzwischen gefahrenen Plan-2-Historie. Die im ursprünglichen Hinweis
 * genannten DÜNNEN Typen sind aber weiterhin dünn, die Datenbasis hat sich
 * dort seit dem letzten Stand kaum bewegt (nur Gruppenfahrt +1). Nächster
 * sinnvoller Zeitpunkt für DIESEN Teil bleibt nach dem Retest.
 *
 * ⚠ DÜNNE DATENBASIS — Typen mit n < 5 (Stand 30.07.2026):
 *     NLS n=1 · Außerplanmäßig n=2 · Z2 Erholung n=2 · Gruppenfahrt n=3 ·
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
  Gruppenfahrt: 185,
  NLS: 97,
  Rennen: 129,
  Schwelle: 104,
  "Sweet Spot": 101,
  Tempo: 84,
  VO2max: 84,
  "Z1 Recovery": 67,
  Z2: 67,
  "Z2 Dauer": 93,
  "Z2 Erholung": 101,
  "Z2 Kadenz": 109,
  "Z2 Lang": 228,
});

/** Fallback-TSS für einen Typ, der weder in TYPE_DEFAULT_TSS steht noch
 *  tssPlanned/workout trägt — grober Mittelwert einer moderaten Einheit. */
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
