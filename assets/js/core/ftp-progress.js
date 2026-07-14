/* ============================================================
   CORE/FTP-PROGRESS.JS — Berechnungen für die Hero-Signaturen
   (Zonen-Band, FTP-Fortschrittsring, nächste geplante Einheit)
   Rein und testbar — Rendering liegt in ui/overview.js.
   ============================================================ */

import { effectiveSessions } from "./planning.js";

/**
 * Position eines Watt-Werts auf der Skala in Prozent (0–100, geklemmt).
 * @param {number|null|undefined} watts
 * @param {number} scaleMax
 * @returns {number|null}
 */
export function pinPercent(watts, scaleMax) {
  if (watts == null || !scaleMax) return null;
  return Math.min(100, Math.max(0, (watts / scaleMax) * 100));
}

/**
 * Fortschritt zum Saisonziel als Anteil 0–1.
 * Basis = Start-FTP der Saison, Ziel = Saisonziel.
 * @param {number|null|undefined} current z.B. aktuelle eFTP
 * @param {number} base
 * @param {number} goal
 * @returns {number} 0–1 (geklemmt); 1 wenn goal <= base
 */
export function ringProgress(current, base, goal) {
  if (current == null) return 0;
  const span = goal - base;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (current - base) / span));
}

/**
 * Nächste anstehende geplante Einheit bestimmen — heute fällige zuerst.
 * Wendet adjustments an (ausgefallen → übersprungen, verschoben → neues
 * Datum) und überspringt bereits absolvierte Termine.
 * @param {Array<{date: string, name?: string, typ?: string, km?: number}>} sessions
 * @param {Record<string, {cancelled?: boolean, movedTo?: string}>} adjustments
 * @param {Set<string>|string[]} doneDates Daten mit erfasster Fahrt
 * @param {string} todayISO YYYY-MM-DD
 * @returns {(Object & {date: string, isToday: boolean})|null}
 */
export function nextPlannedSession(sessions, adjustments, doneDates, todayISO) {
  const done = doneDates instanceof Set ? doneDates : new Set(doneDates || []);

  const effective = effectiveSessions(sessions, adjustments)
    .filter((s) => s.date >= todayISO && !done.has(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!effective.length) return null;
  const next = effective[0];
  return { ...next, isToday: next.date === todayISO };
}

/**
 * Ziel-Wattbereich einer strukturierten Einheit für den AKTUELLEN ftp —
 * NICHT das in scripts/lib/plan2.js fest verdrahtete workout.watts, das
 * nur für FTP=193 (Autorenzeitpunkt) stimmt und sonst veraltet.
 * Fallback auf workout.watts, wenn kein pct vorhanden ist (z.B. Athlet 2,
 * scripts/lib/plan-athlete2.js hat nur watts, kein pct) — dort dann der
 * statische Autorenzeit-Wert statt einer Neuskalierung.
 * @param {{pct?: [number, number]|null, watts?: [number, number]|null}} workout
 * @param {number} ftp
 * @returns {[number, number]|null} [vonW, bisW] gerundet, null ohne pct/watts
 */
export function workoutWattRange(workout, ftp) {
  if (workout?.pct && ftp) {
    const [lo, hi] = workout.pct;
    return [Math.round((ftp * lo) / 100), Math.round((ftp * hi) / 100)];
  }
  if (workout?.watts) return workout.watts;
  return null;
}

/**
 * Zerlegt ein workout in seine Zeitsegmente (Minuten, ungerundet) — von
 * workoutDurationMinutes() UND estimateSessionTSS() genutzt, damit die
 * Intervall-Zeitrechnung (Hauptsatz/Pausen) nur an einer Stelle steht.
 * @param {{warmup?: number, intervals?: number, duration?: number, rest?: number, cooldown?: number}} workout
 * @returns {{warmup: number, mainMin: number, restMin: number, cooldown: number}}
 */
function workoutSegments(workout) {
  const warmup = workout?.warmup || 0;
  const cooldown = workout?.cooldown || 0;
  const intervals = workout?.intervals || 0;
  const duration = workout?.duration || 0;
  const rest = workout?.rest || 0;
  return {
    warmup,
    mainMin: intervals * duration,
    // (intervals-1)×rest: Pausen zwischen den Wiederholungen, keine Pause nach der letzten
    restMin: Math.max(0, intervals - 1) * rest,
    cooldown,
  };
}

/**
 * Gesamtdauer einer strukturierten Einheit in Minuten: warmup +
 * Hauptsatz + Pausen + cooldown (siehe workoutSegments()).
 * @param {{warmup?: number, intervals?: number, duration?: number, rest?: number, cooldown?: number}} workout
 * @returns {number} Minuten, gerundet
 */
export function workoutDurationMinutes(workout) {
  if (!workout) return 0;
  const { warmup, mainMin, restMin, cooldown } = workoutSegments(workout);
  return Math.round(warmup + mainMin + restMin + cooldown);
}

/** Pauschale Intensitätsfaktor-Annahmen für Warmup/Pausen/Cooldown —
 *  dokumentierte Schätzwerte, keine Messwerte (siehe estimateSessionTSS). */
const TSS_ASSUMED_IF = { warmup: 0.6, rest: 0.5, cooldown: 0.5 };

/**
 * Geschätzter TSS einer strukturierten Einheit: Σ_segment IF²×(min/60)×100.
 * Hauptsatz-IF = Mittelwert aus workout.pct/100 (Zielintensität aus dem
 * Plan), oder — ohne pct (z.B. Athlet 2) — aus workout.watts/ftp, sofern
 * ftp übergeben wurde. Warmup/Pausen/Cooldown nutzen TSS_ASSUMED_IF —
 * explizit eine Schätzung, keine gemessene Belastung.
 * @param {{warmup?: number, intervals?: number, duration?: number, rest?: number, cooldown?: number, pct?: [number, number]|null, watts?: [number, number]|null}} workout
 * @param {number} [ftp] Nur für den watts-Fallback nötig, wenn pct fehlt.
 * @returns {number} TSS, gerundet; 0 ohne verwertbare Segmente
 */
export function estimateSessionTSS(workout, ftp) {
  if (!workout) return 0;
  const { warmup, mainMin, restMin, cooldown } = workoutSegments(workout);
  const mainIF = workout.pct
    ? (workout.pct[0] + workout.pct[1]) / 2 / 100
    : workout.watts && ftp
      ? (workout.watts[0] + workout.watts[1]) / 2 / ftp
      : 0;

  const segments = [
    { min: warmup, if: TSS_ASSUMED_IF.warmup },
    { min: mainMin, if: mainIF },
    { min: restMin, if: TSS_ASSUMED_IF.rest },
    { min: cooldown, if: TSS_ASSUMED_IF.cooldown },
  ];
  const tss = segments.reduce((sum, s) => sum + s.if * s.if * (s.min / 60) * 100, 0);
  return Math.round(tss);
}

/**
 * Geordnete Meilensteine aus der Athleten-Config + aktuellem eFTP. Jeder
 * Eintrag erscheint nur, wenn sein WERT vorhanden ist (Datum ist optionale
 * Deko, kein Gate) — kein Platzhalter für fehlende Werte.
 * @param {{seasonStartFtp?: number|null, ftpMeasured?: number, ftpMeasuredDate?: string|null, ftpGoal?: number}} athleteCfg
 * @param {number|null} currentEftp
 * @returns {Array<{label: string, value: number, date?: string}>}
 */
export function buildMilestones(athleteCfg, currentEftp) {
  if (!athleteCfg) return [];
  const milestones = [];
  if (athleteCfg.seasonStartFtp) {
    milestones.push({ label: "Start-FTP", value: athleteCfg.seasonStartFtp });
  }
  if (athleteCfg.ftpMeasured) {
    milestones.push({
      label: "Ramp-Test",
      value: athleteCfg.ftpMeasured,
      ...(athleteCfg.ftpMeasuredDate ? { date: athleteCfg.ftpMeasuredDate } : {}),
    });
  }
  if (currentEftp != null) {
    milestones.push({ label: "Aktuelle eFTP", value: currentEftp });
  }
  if (athleteCfg.ftpGoal) {
    milestones.push({ label: "Saisonziel", value: athleteCfg.ftpGoal });
  }
  return milestones;
}
