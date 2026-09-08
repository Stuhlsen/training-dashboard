/* ============================================================
   CORE/TRIMP.JS — Herzfrequenz-basierte Trainingslast je Aktivität
   (Fahrplan 10 „Multi-Sport", Vertrag V3 — sportartübergreifende Last)

   Reine Rechenschicht, kein DOM / kein I/O. Liefert die Banister-TRIMP
   einer Einzelaktivität (Primärpfad, HF vorhanden) bzw. einen RPE-
   Ersatzwert (Schwimmen ohne HF, OF-3 — Pflichtpfad, weil Athlet 3s
   intervals.icu-Account beim E0-Bericht (2026-09-07) keine einzige
   Schwimm-Aktivität trug, Schwimm-HF also unbestätigt ist).

   FORMEL (Banister 1975 / Morton et al. 1990, Konstanten „männlich"):
     HRr   = (HRavg − HRrest) / (HRmax − HRrest)      Herzfrequenz-Reserve
     TRIMP = Dauer_min × HRr × a × e^(b × HRr),   a = 0,64,  b = 1,92
   a/b sind die geschlechtsabhängigen Literatur-Konstanten; der Faktor
   e^(b·HRr) gewichtet höhere Intensität überproportional. Hausregel wie
   CONFLICT_THRESHOLDS (plan-config.js, K1): eine begründete Setzung aus der
   Literatur, nach echter Nutzung gegen Athlet 3s empfundenen Aufwand
   reviewen.

   Diese Last speist NUR die Projektion (Zukunft) + den Governor. Die
   historische CTL/ATL/TSB-Reihe bleibt für ALLE Athleten aus
   icu_ctl/icu_atl (pmc-series.js rechnet nie aus TSS/TRIMP) — eine eigene
   historische TRIMP-PMC-Rechnung ist Fahrplan 10 Phase 3.

   App-seitig noch UNKONSUMIERT (Konsument folgt Phase 3). Der Sync nutzt
   banisterTrimp/rpeTrimp über scripts/lib/map-activity.js::mapActivity2 für
   Athlet-3-Lauf-/Schwimm-Zeilen (sport !== "ride").
   ============================================================ */

/** Banister/Morton-Konstanten, „männlich". */
export const BANISTER_A = 0.64;
export const BANISTER_B = 1.92;

/**
 * Banister-TRIMP einer Einzelaktivität (Primärpfad, HF vorhanden).
 * @param {{durationMin:number, hrAvg:number, hrRest:number, hrMax:number}} [p]
 * @returns {number|null} gerundete TRIMP-Punkte, oder null bei fehlendem/
 *   unplausiblem Eingang (nicht-endliche Zahl, Dauer ≤ 0, HRmax ≤ HRrest,
 *   HRr außerhalb des offenen Intervalls (0, 1)). Der Aufrufer behält dann
 *   den vorhandenen Wert und zählt/loggt den Ausfall.
 */
export function banisterTrimp({ durationMin, hrAvg, hrRest, hrMax } = {}) {
  if (![durationMin, hrAvg, hrRest, hrMax].every((v) => Number.isFinite(v))) return null;
  if (durationMin <= 0 || hrMax <= hrRest) return null;
  const hrr = (hrAvg - hrRest) / (hrMax - hrRest);
  if (hrr <= 0 || hrr >= 1) return null;
  const trimp = durationMin * hrr * BANISTER_A * Math.exp(BANISTER_B * hrr);
  return Math.round(trimp);
}

/** RPE-Ersatzfaktoren (Dauer_min × Faktor). UNKALIBRIERT — kein Schwimm-
 *  Material (E0: 0 Schwimm-Aktivitäten). Quelle der Klasse: Plankarten-
 *  Intensitätsklasse → sonst Morgen-Gefühl → sonst „moderat". */
export const RPE_FACTORS = Object.freeze({ locker: 0.6, moderat: 1.0, hart: 1.5 });

/**
 * RPE-Ersatzlast (Schwimmen ohne HF, V3-Ersatzpfad).
 * @param {number} durationMin
 * @param {"locker"|"moderat"|"hart"} [rpeClass] unbekannt/fehlend → „moderat"
 * @returns {number|null} gerundete Punkte, null bei ungültiger Dauer
 */
export function rpeTrimp(durationMin, rpeClass = "moderat") {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
  const f = RPE_FACTORS[rpeClass] ?? RPE_FACTORS.moderat;
  return Math.round(durationMin * f);
}
