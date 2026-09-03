/* ============================================================
   SCRIPTS/LIB/PLAN-ATHLETE4.JS — Einsteiger-Trainingsplan (Athlet 4,
   "bentastiic"). Nur PLANNED_SESSIONS_ATHLETE4 (Datum → Session-Objekt),
   kein I/O.

   Athlet 4 ist Renn-/Trainings-Einsteiger und fährt vorerst überwiegend
   in Zwift. Der Plan ist eine 12-Wochen-Grundlagenvorlage (Start Mo
   2026-08-31 = KW36) und dient als statische Baseline — echte
   Verschiebungen/Anpassungen leben im vollen Modell in der Supabase-
   Tabelle plan_cards (RLS), nicht in einer adjustments-Datei.
   generate-data.js führt beide per Objekt-Spread zusammen (echte Karte
   überschreibt die Baseline pro Datum).

   STRUKTURIERT über %FTP (`workout.pct`), NICHT über absolute Watt:
   der Athlet hat noch keinen Leistungstest. %FTP-Workouts brauchen keine
   im Projekt gespeicherte FTP — Zwift rechnet sie gegen die im Zwift-
   Profil hinterlegte (zunächst geschätzte) FTP. Jede Fahr-Einheit trägt
   deshalb ein vollständiges `workout`-Objekt (warmup/intervals/duration/
   rest/cooldown/pct/label) und ist damit per .zwo nach Zwift/MyWhoosh
   exportierbar (app/src/core/zwo-export.js::canExportZwo). Ausdrücklich
   KEINE `watts`-Felder (die wären ohne echte FTP geraten) und weiterhin
   `ftpMeasured/eFTP/ftpGoal = null` in app/src/config.ts — die Hero-FTP-
   Widgets bleiben ausgeblendet. Nach dem 20-Min-Test in KW47 entsteht die
   erste FTP; dann können die Karten zusätzlich `watts` bekommen.

   Wochenmuster (Mo–So): Di locker · Do locker (außer Testwoche) ·
   Sa Qualitätstag (phasenabhängig) · So längere lockere Ausfahrt.
   Mo/Mi/Fr (und Do in KW47) sind seit Fahrplan 6 (RUH2) abgeleitete
   Ruhe-Slots (core/plan-week-model.js), keine Einträge in dieser Vorlage.

   Blockstruktur:
     KW36–38  Einstieg    Gewöhnung, alles Z2, Sa langes ruhiges Z2
     KW39     Erholung    Dauer/Intensität reduziert
     KW40–42  Grundlagen  Sa 3×8 Min Tempo (~83–90% FTP)
     KW43     Erholung
     KW44–46  Steigerung  Sa 2×15 Min Sweet Spot (~88–94% FTP)
     KW47     Test        Do frei · Sa 20-Min-Test (Basis für erste FTP)

   Phasen-Keys (Einstieg/Grundlagen/Steigerung/Test) sind eigenständig in
   app/src/config.ts PHASES eingetragen — kein Namenskonflikt mit den
   Plan-1/2-Phasen von Athlet 1 oder dem GFNY-Plan von Athlet 2. "Erholung"
   existierte dort schon und wird geteilt (identische Bedeutung/Farbe).
   ============================================================ */

/** Montag der ISO-KW36 2026 — Start der Vorlage. */
const START_MONDAY = "2026-08-31";
const WEEKS = 12;

/** @param {string} iso @param {number} days @returns {string} YYYY-MM-DD */
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Vollständiges numerisches Workout (Zwift-.zwo-exportfähig, s.
 * core/zwo-export.js::canExportZwo — braucht warmup+cooldown+intervals>0+
 * duration+pct[2]). Nur `pct`, kein `watts` (keine echte FTP).
 * @param {{warmup:number, intervals:number, duration:number, rest:number, cooldown:number, zone:string, pct:[number,number], label:string}} w
 */
function mkWorkout(w) {
  return { ...w };
}

/** Phase + phasenabhängige Einheiten je Wochenindex (0 = KW36). */
function weekPlan(i) {
  const kw = `KW${36 + i}`;
  const recovery = i === 3 || i === 7;
  let phase = "Einstieg";
  if (recovery) phase = "Erholung";
  else if (i >= 11) phase = "Test";
  else if (i >= 7) phase = "Steigerung";
  else if (i >= 3) phase = "Grundlagen";

  // Lockere Wochentagseinheit (Di/Do) — steady Z2.
  const easy = recovery
    ? { name: "Lockere Einheit", typ: "Z2", workout: mkWorkout({ warmup: 5, intervals: 1, duration: 30, rest: 0, cooldown: 5, zone: "Z2", pct: [55, 65], label: "40 Min sehr locker @ 55–65% FTP" }) }
    : { name: "Lockere Einheit", typ: "Z2", workout: mkWorkout({ warmup: 5, intervals: 1, duration: 40, rest: 0, cooldown: 5, zone: "Z2", pct: [60, 70], label: "50 Min locker @ 60–70% FTP" }) };

  // Sonntag — längere ruhige Ausfahrt.
  const sunday = recovery
    ? { name: "Längere lockere Ausfahrt", typ: "Z2 Dauer", workout: mkWorkout({ warmup: 10, intervals: 1, duration: 40, rest: 0, cooldown: 10, zone: "Z2", pct: [60, 70], label: "60 Min locker @ 60–70% FTP (reduziert)" }) }
    : { name: "Längere lockere Ausfahrt", typ: "Z2 Dauer", workout: mkWorkout({ warmup: 10, intervals: 1, duration: 65, rest: 0, cooldown: 10, zone: "Z2", pct: [62, 72], label: "85 Min locker @ 62–72% FTP" }) };

  // Samstag — Qualitätstag, phasenabhängig.
  let saturday;
  if (phase === "Einstieg") {
    saturday = { name: "Lange ruhige Ausfahrt", typ: "Z2 Dauer", workout: mkWorkout({ warmup: 10, intervals: 1, duration: 70, rest: 0, cooldown: 10, zone: "Z2", pct: [63, 73], label: "90 Min gleichmäßig @ 63–73% FTP" }) };
  } else if (phase === "Erholung") {
    saturday = { name: "Lockere Ausfahrt (Erholungswoche)", typ: "Z2", workout: mkWorkout({ warmup: 5, intervals: 1, duration: 40, rest: 0, cooldown: 5, zone: "Z2", pct: [58, 68], label: "50 Min sehr locker @ 58–68% FTP" }) };
  } else if (phase === "Grundlagen") {
    saturday = { name: "3×8 Min Tempo", typ: "Tempo", workout: mkWorkout({ warmup: 15, intervals: 3, duration: 8, rest: 3, cooldown: 10, zone: "Z3", pct: [83, 90], label: "3×8 Min @ 83–90% FTP · 3 Min locker dazwischen" }) };
  } else if (phase === "Steigerung") {
    saturday = { name: "2×15 Min Sweet Spot", typ: "Sweet Spot", workout: mkWorkout({ warmup: 15, intervals: 2, duration: 15, rest: 5, cooldown: 10, zone: "SS", pct: [88, 94], label: "2×15 Min @ 88–94% FTP · 5 Min locker dazwischen" }) };
  } else {
    // Test-Woche: 1×20 Min so hart wie 20 Min gleichmäßig haltbar.
    saturday = { name: "20-Min-Test", typ: "FTP-Test", workout: mkWorkout({ warmup: 20, intervals: 1, duration: 20, rest: 0, cooldown: 10, zone: "THR", pct: [100, 106], label: "20 Min All-out gleichmäßig — Ø-Leistung × 0,95 = erste FTP" }) };
  }

  return { kw, phase, recovery, easy, sunday, saturday };
}

/**
 * Baseline-Plan Athlet 4: Datum → { name, typ, week, phase, workout }.
 * Rein aus START_MONDAY + weekPlan() erzeugt — kein I/O, deterministisch.
 * NUR Trainingseinheiten (Di/Do/Sa/So; Do außer Testwoche KW47) — jede mit
 * vollständigem, .zwo-exportfähigem `workout` (nur %FTP). Ruhetage (Mo/Mi/Fr,
 * plus Do in KW47) sind seit Fahrplan 6 (RUH2) KEINE Einträge, sondern
 * abgeleitete Ruhe-Slots (core/plan-week-model.js).
 * @type {Record<string, {name:string, typ:string, week:string, phase:string, workout:object}>}
 */
export const PLANNED_SESSIONS_ATHLETE4 = (() => {
  const out = {};
  for (let i = 0; i < WEEKS; i++) {
    const wp = weekPlan(i);
    const monday = addDays(START_MONDAY, i * 7);
    const tag = (s) => ({ name: s.name, typ: s.typ, week: wp.kw, phase: wp.phase, ...(s.workout ? { workout: s.workout } : {}) });

    // Di — locker
    out[addDays(monday, 1)] = tag(wp.easy);
    // Do — locker, außer in der Test-Woche (dort abgeleiteter Ruhe-Slot)
    if (wp.phase !== "Test") out[addDays(monday, 3)] = tag(wp.easy);
    // Sa — Qualitätstag
    out[addDays(monday, 5)] = tag(wp.saturday);
    // So — längere lockere Ausfahrt
    out[addDays(monday, 6)] = tag(wp.sunday);
  }
  return out;
})();

/**
 * Vorlage um N ganze Wochen verschoben (profiles.plan_offset_weeks,
 * Migration 0026 — Punkt 1 der 6-Punkte-Liste). Nur die Datumsschlüssel
 * wandern; `week`/`phase` je Eintrag bleiben unverändert (eine
 * Ganzwochen-Verschiebung lässt „Woche 1 = Einstieg" Woche 1 = Einstieg,
 * nur 7·N Tage später — dieselbe Semantik wie das offset-fähige
 * app/src/core/plan-week-model.js).
 *
 * NUR künftige Einträge (`date >= fromDateISO`) wandern — genau wie der
 * Frontend-Schreibpfad (`app/src/core/plan-shift.js::planShiftPatches`, „nur
 * künftige, nicht ausgefallene Karten"). Sonst würde ein Offset-Wechsel
 * mitten im Plan die bereits absolvierten Wochen der Sync-Baseline von den
 * echten (nicht verschobenen) plan_cards wegziehen.
 *
 * `offsetWeeks` 0/undefined ⇒ die unveränderte Konstante.
 * @param {number} [offsetWeeks]
 * @param {string} [fromDateISO] Stichtag (Default "" ⇒ alle Einträge wandern)
 * @returns {Record<string, {name:string, typ:string, week:string, phase:string, workout?:object}>}
 */
export function shiftPlannedSessions4(offsetWeeks, fromDateISO = "") {
  const n = Math.round(offsetWeeks || 0);
  if (!n) return PLANNED_SESSIONS_ATHLETE4;
  const out = {};
  for (const [date, s] of Object.entries(PLANNED_SESSIONS_ATHLETE4)) {
    const key = date >= fromDateISO ? addDays(date, n * 7) : date;
    out[key] = { ...s };
  }
  return out;
}
