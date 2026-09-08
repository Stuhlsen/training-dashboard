/* ============================================================
   SCRIPTS/LIB/ATHLETES.JS — Config-Liste der vom Sync erzeugten
   Athleten-Ausgabedateien.

   Fahrplan 10 E3: statt drei fest verdrahteter Zweige in
   generate-data.js iteriert der Sync über eine Liste. Ein weiterer
   Athlet ist danach reine Konfiguration hier (+ eine Zeile in
   athlete_sync_config und in app/src/config.ts).

   Aufteilung (aus dem Grilling 2026-09-07, Variante c):
   - **Athlet 1** hat weiterhin einen EIGENEN Pfad in generate-data.js
     (`main()` Abschnitt 1–4): eingefrorene Plan-1-Historie, Notion-Ära-
     Merge, Power-Curve-Blockvergleich, `subjective.json` + `mapActivity`,
     eigene Output-Form (`dataSources`, kein `athleteName`). Das ist echt
     einzigartig und wird NICHT in den gemeinsamen Rumpf gezwängt.
   - **Athlet 2 + 4** (und künftig 3) teilen sich EINEN Rumpf
     (`syncSecondaryAthlete()` in generate-data.js), gesteuert über die
     Felder unten. Beide nutzen `mapActivity2`, dieselbe Output-Form
     (`athleteName` + `...ftpPublic` + rides/wellness/…), dieselbe
     Reihenfolge der Schlüssel.

   Datenschutz: `name` ist der selbstgewählte Anzeigename (Pseudonym /
   GitHub-Handle), muss exakt `profiles.display_name` in Supabase
   entsprechen (Lookup in sync-config-fetch.js::NAME_TO_SLUG). Keine
   Klarnamen, keine Koordinaten.
   ============================================================ */

import { OUT_FILE_2, OUT_FILE_3, OUT_FILE_4, loadAdjustments2 } from "./output.js";
import { PLANNED_SESSIONS_ATHLETE2 } from "./plan-athlete2.js";
import { shiftPlannedSessions4 } from "./plan-athlete4.js";
import { DEFAULT_FTP } from "./map-activity.js";
import { RIDE_TYPES } from "./intervals.js";

/**
 * @typedef {Object} SecondaryAthlete
 * @property {string} slug         Interne ID ("athlete2" …), Key in athlete_sync_config
 * @property {string} name         Anzeigename (= profiles.display_name)
 * @property {string} label        Log-Überschrift ("Zweiter Athlet" …)
 * @property {string} shortLabel   Kurzform für Detail-Logs ("Athlet 2" …)
 * @property {string|null} templateModule  Dateiname der Code-Vorlage (nur für den
 *                                    "wird übersprungen"-Log bei aktivem DB-Plan);
 *                                    null → kein Vorlage-Modul (Athlet 3)
 * @property {string} outfile      Zielpfad (aus output.js)
 * @property {string} ridesFileName  Basename von `outfile` (nur für Log-Texte)
 * @property {string} oldest       ISO-Startdatum für activities/wellness/planCards/Wetter
 * @property {(cfg: object, todayISO: string) => Record<string, object>} buildTemplate
 *                                 Statische Plan-Vorlage (Datum → Session)
 * @property {() => Record<string, object>} loadAdjustments  Verschiebungen/Ausfälle
 * @property {string|null} adjustmentsLabel  Dateiname für den Anzahl-Log (null → kein Log)
 * @property {number|null} fixedFtp   Feste FTP (Ramp-Test bzw. Default-Rechenwert)
 * @property {boolean} npFallbackFtp  Wenn `fixedFtp` fehlt: aus bestem NP ≥20min schätzen
 * @property {boolean} logFtp         Die "... FTP (name): …W"-Zeile ausgeben
 * @property {boolean} publicFtpScalarFromEffective  publicFtpFields-Skalar-Fallback:
 *                                    true → die effektive FTP, false → null
 * @property {boolean} requireCreds   true → ohne intervals.icu-Key/-ID komplett
 *                                    übersprungen (keine Datei); false → Datei
 *                                    trotzdem schreiben (nur Plan, `source:"plan-only"`)
 * @property {string[]} [activityTypes]  intervals.icu-`type`-Whitelist für den
 *                                    Aktivitäten-Fetch (Fahrplan 10 E6). Fehlt
 *                                    das Feld → nur `RIDE_TYPES` (1/2/4, exakt
 *                                    wie vor E6). Nur Athlet 3 (Triathlet)
 *                                    erweitert um Lauf-/Schwimm-Typen; der
 *                                    Sport-Filter in app/src/api/pipeline.ts
 *                                    hält Lauf/Schwimm bis E8 aus den
 *                                    Auswertungen.
 */

/** @type {SecondaryAthlete[]} */
export const SECONDARY_ATHLETES = [
  {
    slug: "athlete2",
    name: "hc_diZee",
    label: "Zweiter Athlet",
    shortLabel: "Athlet 2",
    templateModule: "plan-athlete2.js",
    outfile: OUT_FILE_2,
    ridesFileName: "rides-2.json",
    oldest: "2026-01-01",
    buildTemplate: () => PLANNED_SESSIONS_ATHLETE2,
    loadAdjustments: loadAdjustments2,
    adjustmentsLabel: "adjustments-2.json",
    fixedFtp: 265, // letzter Ramp-Test (früher ATHLETE_2_FTP)
    npFallbackFtp: true,
    logFtp: true,
    publicFtpScalarFromEffective: true,
    requireCreds: true,
  },
  {
    // Athlet 3 ("Hendrik") — Triathlet (Rad/Lauf/Schwimm) mit eigenem
    // intervals.icu-Account. Fahrplan 10 E4: Sync + Speicherung, noch KEINE
    // Auswertung — der sport-Filter in app/src/api/pipeline.ts hält Lauf/
    // Schwimm draußen, bis der Sport-Umschalter (E8) sie öffnet. Kein Notion,
    // keine Code-Plan-Vorlage (ein editierbarer Laufplan käme erst über
    // plan_cards in Phase 2). Lesedaten wie Athlet 4 (intervals.icu +
    // Supabase, self-service über Settings).
    slug: "athlete3",
    name: "Hendrik",
    label: "Dritter Athlet",
    shortLabel: "Athlet 3",
    templateModule: null,
    outfile: OUT_FILE_3,
    ridesFileName: "rides-3.json",
    oldest: "2025-08-01", // knapp vor der ersten Aktivität im Account (E0)
    buildTemplate: () => ({}), // keine statische Plan-Vorlage
    loadAdjustments: () => ({}), // volles Modell: Verschiebungen leben in plan_cards
    adjustmentsLabel: null,
    // WATTLOS bis zum ersten Test: kein fester FTP-Wert → aus dem besten NP
    // ≥20min geschätzt (npFallbackFtp). Ein echter Ramp-Test-/bekannter FTP
    // wird später über Settings eingetragen. publicFtpFields-Skalar bleibt
    // null (output3.ftp kommt allein aus ftp_history).
    fixedFtp: null,
    npFallbackFtp: true,
    logFtp: true,
    publicFtpScalarFromEffective: false,
    requireCreds: false,
    // Fahrplan 10 E6: Triathlet — Fetch zieht zusätzlich Lauf + Schwimm.
    // normalizeSport() (map-activity.js) mappt die Typen auf sport:"run"/
    // "swim"; week/phase bleiben null (kein Plan-Bezug für Nicht-Rad).
    activityTypes: [...RIDE_TYPES, "Run", "TrailRun", "VirtualRun", "Swim", "OpenWaterSwim"],
  },
  {
    slug: "athlete4",
    name: "bentastiic",
    label: "Vierter Athlet",
    shortLabel: "Athlet 4",
    templateModule: "plan-athlete4.js",
    outfile: OUT_FILE_4,
    ridesFileName: "rides-4.json",
    oldest: "2026-08-01", // kurz vor Planstart (KW36, 2026-08-31)
    buildTemplate: (cfg, todayISO) => shiftPlannedSessions4(cfg?.planOffsetWeeks ?? 0, todayISO),
    loadAdjustments: () => ({}), // volles Modell: Verschiebungen leben in plan_cards
    adjustmentsLabel: null,
    // WATTLOS: kein Ramp-Test → publicFtpFields-Skalar bleibt null (output4.ftp
    // kommt allein aus ftp_history). DEFAULT_FTP ist hier nur der Rechen-
    // Fallback für die Ist-Typerkennung.
    fixedFtp: DEFAULT_FTP,
    npFallbackFtp: false,
    logFtp: false,
    publicFtpScalarFromEffective: false,
    requireCreds: false,
  },
];
