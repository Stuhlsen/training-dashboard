/* ============================================================
   STATE/DATA.JS — Datenladen, Normalisierung, Getter
   Datenquelle: Statisches JSON (generiert per GitHub Action)
   Fallback: STATIC_RIDES (für lokale Entwicklung)

   Berechnung liegt in core/* — hier nur Zustand + Orchestrierung.
   ============================================================ */

import { CONFIG } from "./config.js";
import { STATIC_RIDES } from "./static-rides.js";
import { normalizeRide, normalizeWellness } from "../core/normalize.js";
import { weeklyFromPlanWeeks, weeklyByCalendar } from "../core/aggregate.js";
import { validateRidesPayload } from "../core/validate.js";
import { log } from "../ui/log.js";

export const Data = {

  /** @type {import("../types.js").Ride[]} */
  rides: [],
  /** @type {import("../types.js").WellnessDay[]} */
  wellness: [],
  powerCurves: null,
  athleteWeight: null,
  athleteFtp: null,
  plannedSessions: [],
  adjustments: {},
  forecast: {},
  activeAthleteId: CONFIG.primaryAthleteId,

  /** Setzt alle Datenfelder zurück (vor Fallback/Fehlerpfad) */
  _reset() {
    this.rides = [];
    this.wellness = [];
    this.powerCurves = null;
    this.athleteWeight = null;
    this.plannedSessions = [];
    this.adjustments = {};
    this.forecast = {};
  },

  /** Übernimmt ein validiertes Payload in den Store
   *  @param {Object} json */
  _apply(json) {
    this.rides = json.rides.map((r) => normalizeRide(r));
    this.wellness = (json.wellness || []).map((w) => normalizeWellness(w));
    this.powerCurves = json.powerCurves || null;
    this.athleteWeight = json.athleteWeight || null;
    this.athleteFtp = json.ftp || null;
    this.plannedSessions = json.plannedSessions || [];
    this.adjustments = json.adjustments || {};
    this.forecast = json.forecast || {};
  },

  /* ── Laden ──────────────────────────────────────────────────── */

  /**
   * Lädt Fahrten vom Endpoint, mit STATIC_RIDES-Fallback für den
   * primären Endpoint (lokale Entwicklung).
   * @param {string} [endpoint]
   * @returns {Promise<import("../types.js").LoadResult>}
   */
  async load(endpoint) {
    const url = endpoint || CONFIG.apiEndpoint;
    try {
      const res = await fetch(url + "?_=" + Date.now());
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}: ${await res.text()}`), { code: "HTTP" });
      }
      const json = await res.json();

      // Schema-Validierung: warnt früh statt leerer Charts (siehe core/validate.js)
      const problems = validateRidesPayload(json);
      if (problems.length) {
        // Fehlende/leere rides sind fatal — alles andere nur eine Warnung
        const fatal = problems.some((p) => p.startsWith("payload.rides"));
        if (fatal) {
          throw Object.assign(new Error(problems.join(" · ")), { code: "SCHEMA" });
        }
        log.warn(`Schema-Abweichungen in ${url}:`, problems);
      }

      this._apply(json);
      return { ok: true, source: "json", updated: json.updated };
    } catch (err) {
      const error = { code: err.code || "NETWORK", message: err.message, cause: err };

      // Fallback-Daten nur für den primären Endpoint sinnvoll
      if (url !== CONFIG.apiEndpoint) {
        log.error(`Daten für ${url} nicht ladbar:`, err.message);
        this._reset();
        return { ok: false, source: "none", error };
      }

      log.warn("JSON nicht verfügbar, nutze eingebettete Daten:", err.message);
      this._reset();
      this.rides = STATIC_RIDES.map((r) => normalizeRide(r));
      return { ok: true, source: "static", error };
    }
  },

  /**
   * Athleten wechseln — lädt den passenden Datensatz.
   * @param {string} athleteId
   * @returns {Promise<import("../types.js").LoadResult>}
   */
  async switchAthlete(athleteId) {
    const athlete = CONFIG.athletes.find((a) => a.id === athleteId);
    if (!athlete) {
      return { ok: false, source: "none", error: { code: "UNKNOWN", message: "Unbekannter Athlet" } };
    }
    this.activeAthleteId = athleteId;
    return await this.load(athlete.endpoint);
  },

  /* ── Getter ─────────────────────────────────────────────────── */

  /** Alle Fahrten sortiert nach Datum aufsteigend
   *  @returns {import("../types.js").Ride[]} */
  byDate() {
    return [...this.rides].sort((a, b) => {
      const dateComp = a.dateISO.localeCompare(b.dateISO);
      if (dateComp !== 0) return dateComp;
      // Tiebreaker: Startzeitpunkt (z.B. zwei Fahrten am selben Tag)
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      return 0;
    });
  },

  /** Fahrten nach Phase filtern @param {string} phase */
  byPhase(phase) {
    return this.rides.filter((r) => r.phase === phase);
  },

  /** Fahrten nach Plan filtern @param {string} plan */
  byPlan(plan) {
    return this.rides.filter((r) => r.plan === plan);
  },

  /** Letzter FTP-Test @returns {import("../types.js").Ride|null} */
  latestFTP() {
    const tests = this.rides
      .filter((r) => r.typ === "FTP-Test")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return tests.length ? tests[tests.length - 1] : null;
  },

  /** FTP-Wert: letzter FTP-Test > athleteFtp (Athlet 2) > CONFIG.ftp
   *  @returns {number|null} */
  ftpValue() {
    const test = this.latestFTP();
    if (test) return test.ftpWatt || test.np || test.watt || CONFIG.ftp;
    // Vergleichsathlet: echte FTP aus dem JSON nutzen, falls vorhanden
    if (this.activeAthleteId !== CONFIG.primaryAthleteId) {
      if (this.athleteFtp) return this.athleteFtp;
      const npRides = this.rides.filter((r) => r.np).sort((a, b) => b.np - a.np);
      return npRides.length ? npRides[0].np : null;
    }
    return CONFIG.ftp;
  },

  /** Wöchentliche Aggregation — Plan-Wochen wenn vorhanden,
   *  sonst ISO-Kalenderwochen (Vergleichsdaten).
   *  @returns {import("../types.js").WeekAggregate[]} */
  weekly() {
    const hasOwnPlan = this.rides.some((r) => r.week);
    if (!hasOwnPlan) return weeklyByCalendar(this.rides);
    return weeklyFromPlanWeeks(this.rides, (w) => CONFIG.weekIndex(w));
  },
};
