/* ============================================================
   CORE/ZWO-EXPORT.JS — Plankarte → Zwift-Workout-Datei (.zwo, kein DOM)

   Zwift und MyWhoosh lesen dasselbe .zwo-XML-Format (MyWhoosh hat keinen
   lokalen Workout-Ordner wie Zwift, sondern nimmt dieselbe Datei über den
   Web-Workout-Builder entgegen) — ein Builder reicht für beide Ziele, die
   UI unterscheidet nur den Zielhinweis (Ordner vs. Upload).

   Generator-Karten mit gültiger `workoutStructure` (Over-Under, 30/15,
   Sprints) baut der Export aus der genauen Struktur, ein Element je Segment
   (s. core/workout-structure-format.js::usableStructure). Sonst gilt:
   Baut nur aus der numerischen Workout-Form MIT vollständigem Hauptsatz
   (Plan-2-Karten, scripts/lib/plan2.js: warmup/intervals/duration/rest/
   cooldown/pct). Die Freitext-Blockform ({ blocks: [{type, text}] },
   Karten-Dialog) trägt keine Zahlenwerte, und ein reines warmup/cooldown-
   Workout ohne Intervalle (z. B. der Ramp-Test-Eintrag mit
   intervals/duration/pct = null, s. scripts/lib/plan2.js) hat keine
   sinnvoll exportierbare ERG-Struktur — beide Fälle geben bewusst NO_DATA
   statt eines geratenen oder unvollständigen Ergebnisses (Prinzip wie im
   Kopfkommentar von core/workout-structure-derive.js: "im Zweifel nicht
   raten, auslassen").

   %FTP-Werte (nicht die eingefrorenen `watts`) sind die Quelle für die
   Power-Ziele — dieselbe Trennung wie zwischen ftpMeasured/eFTP im
   Analyse-Tab, kein Drift-Risiko gegenüber der aktuellen FTP.

   `cadenceTarget` (Fahrplan 11) ist das Intervall-Kadenzziel des Athleten;
   der Aufrufer reicht es aus useCadenceTarget durch (Default 90). Warmup
   bekommt `T-5`, die Intervalle `T`, Pausen/Cooldown `T-10` — derselbe
   Abstand wie im intervals.icu-Push-Text (api/intervals/push.ts). Zwift/
   MyWhoosh lesen `Cadence`/`CadenceResting` als Zielvorgabe; ohne die
   Attribute schlägt Zwift eine eigene (früher: fest 90) vor.

   Kadenzvorgaben NUR bei echtem Intervallsatz (`intervals > 1`). Eine freie
   Ein-Block-Fahrt (`intervals === 1`: Z2/Dauer, auch der 20-Min-Test) bekommt
   GAR KEIN `Cadence`-Attribut — die Trittfrequenz ist dort frei, nichts
   vorzugeben ("im Zweifel nicht raten, auslassen"). Gleiche Trennung im
   Push-Text (api/intervals/push.ts).

   isNumericWorkout() dupliziert bewusst die Formerkennung aus
   app/src/api/intervals/push.ts::isBlockWorkout() — core/ darf laut
   Schichtentabelle nichts aus api/ importieren, auch keine Hilfsfunktion.
   ============================================================ */

import { usableStructure, structureSegments } from "./workout-structure-format.js";

function isNumericWorkout(w) {
  return !!w && typeof w === "object" && !Array.isArray(w.blocks) && Number.isFinite(w.warmup) && Number.isFinite(w.cooldown);
}

function hasMainSet(w) {
  return (
    Number.isInteger(w.intervals) &&
    w.intervals > 0 &&
    Number.isFinite(w.duration) &&
    Array.isArray(w.pct) &&
    w.pct.length === 2 &&
    Number.isFinite(w.pct[0]) &&
    Number.isFinite(w.pct[1])
  );
}

function xmlEscape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

/** Kartenname → dateinamentauglicher Slug: klein, `×`/`₂` normalisiert, alles
 *  andere Nicht-Alphanumerische zu `-` zusammengezogen. Leerer Rest ⇒ "workout"
 *  (Fallback, damit nie `<datum>-.zwo` entsteht). */
function filenameSlug(name) {
  const s = String(name ?? "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/₂/g, "2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "workout";
}

/** @param {[number, number]} pct @returns {number} Mittelwert, gerundet — dieselbe
 *  Konvention wie FAMILY_PCT_FTP in core/workout-structure-derive.js. */
function midPct(pct) {
  return Math.round((pct[0] + pct[1]) / 2);
}

/** Ob `buildZwoWorkout()` für dieses Workout tatsächlich eine Datei bauen
 *  kann — dieselbe Bedingung, die dort geprüft wird, hier vorab exportiert,
 *  damit die UI die Export-Auswahl nicht für Karten anbietet, die garantiert
 *  mit NO_DATA scheitern (z. B. Ramp-Test-Karten ohne Hauptsatz).
 *  @param {unknown} workout @returns {boolean} */
export function canExportZwo(workout) {
  return isNumericWorkout(workout) && hasMainSet(workout);
}

/** Karten-Variante von `canExportZwo()`: auch Generator-Karten, deren genaue
 *  `workoutStructure` gilt (s. core/workout-structure-format.js), sind
 *  exportierbar. @param {{workout?: unknown, workoutStructure?: unknown}} card
 *  @returns {boolean} */
export function canExportCardZwo(card) {
  return !!usableStructure(card) || canExportZwo(card?.workout);
}

/** .zwo-Schritte aus der genauen Struktur — ein Element je Segment
 *  (Over-Under/30-15 brauchen echte Wechsel, die IntervalsT allein nicht
 *  verschachteln kann). Sprints (`target: "max"`) als FreeRide ohne
 *  Wattvorgabe, mit Hinweistext.
 *  @param {{steps: Array<any>}} structure @param {number} cadenceTarget @returns {string[]} */
function structureZwoSegments(structure, cadenceTarget) {
  const t = Math.round(cadenceTarget);
  const power = (pct) => (pct / 100).toFixed(2);
  const CADENCE = { warmup: t - 5, work: t, over: t, under: t - 10, recovery: t - 10, cooldown: t - 10 };
  return structureSegments(structure).map((s) => {
    if (s.role === "sprint") {
      return `<FreeRide Duration="${s.durationS}"><textevent timeoffset="0" message="Sprint max"/></FreeRide>`;
    }
    if (s.role === "cooldown") {
      return `<Cooldown Duration="${s.durationS}" PowerLow="${power(s.pct)}" PowerHigh="0.40" Cadence="${CADENCE.cooldown}"/>`;
    }
    return `<SteadyState Duration="${s.durationS}" Power="${power(s.pct)}" Cadence="${CADENCE[s.role]}"/>`;
  });
}

/** @param {{name?: string|null, date: string, workout?: unknown, workoutStructure?: unknown, details?: string|null}} card
 *  @param {number} [cadenceTarget] Intervall-Kadenzziel des Athleten (Default 90).
 *  @returns {{ok: true, xml: string, filename: string}|{ok: false, error: {code: string, message: string}}} */
export function buildZwoWorkout(card, cadenceTarget = 90) {
  const structure = usableStructure(card);
  let segments;
  if (structure) segments = structureZwoSegments(structure, cadenceTarget);
  else if (canExportZwo(card?.workout)) segments = numericZwoSegments(card.workout, cadenceTarget);
  else {
    return {
      ok: false,
      error: { code: "NO_DATA", message: "Kein vollständiges Intervall-Workout mit %FTP-Werten — Dateiexport nicht möglich." },
    };
  }
  return { ok: true, ...wrapZwo(card, segments) };
}

/** .zwo-Schritte aus der groben, numerischen Workout-Form (Plan-2-Karten,
 *  ältere Karten ohne Struktur). @returns {string[]} */
function numericZwoSegments(w, cadenceTarget) {
  const onPower = (midPct(w.pct) / 100).toFixed(2);
  const onDuration = Math.round(w.duration * 60);

  // Kadenz nur bei echtem Intervallsatz (>1 Wiederholung). Warmup `T-5`,
  // Intervalle `T`, Pausen/Cooldown `T-10` — derselbe Abstand wie
  // legacyDescription() in api/intervals/push.ts. Bei einer freien
  // Ein-Block-Fahrt (intervals === 1) bleibt jedes `Cadence`-Attribut weg.
  const isIntervalSet = w.intervals > 1;
  const onCadence = Math.round(cadenceTarget);
  const cad = (rpm) => (isIntervalSet ? ` Cadence="${rpm}"` : "");
  const warmupCad = cad(onCadence - 5);
  const mainCad = cad(onCadence);
  const easyCad = cad(onCadence - 10);
  const intervalCad = isIntervalSet ? ` Cadence="${onCadence}" CadenceResting="${onCadence - 10}"` : "";

  // Pausen NUR zwischen den Wiederholungen, keine nach der letzten — dieselbe
  // Konvention wie workoutSegments() in core/ftp-progress.js (restMin =
  // (intervals-1)×rest), sonst weicht die exportierte Dauer von der Dauer/
  // TSS-Schätzung ab, die die App selbst für dieselbe Karte anzeigt.
  const mainSetSegments = [];
  if (isIntervalSet) {
    const offDuration = Math.round((w.rest || 0) * 60);
    mainSetSegments.push(
      `<IntervalsT Repeat="${w.intervals - 1}" OnDuration="${onDuration}" OffDuration="${offDuration}" OnPower="${onPower}" OffPower="0.5"${intervalCad}/>`,
    );
  }
  mainSetSegments.push(`<SteadyState Duration="${onDuration}" Power="${onPower}"${mainCad}/>`);

  return [
    `<SteadyState Duration="${Math.round(w.warmup * 60)}" Power="0.6"${warmupCad}/>`,
    ...mainSetSegments,
    `<Cooldown Duration="${Math.round(w.cooldown * 60)}" PowerLow="0.5" PowerHigh="0.4"${easyCad}/>`,
  ];
}

/** Schritte in die .zwo-Datei einbetten. @returns {{xml: string, filename: string}} */
function wrapZwo(card, segments) {
  // Datum vorne im angezeigten Titel (ISO, sortiert sich in Zwifts Workout-
  // Liste chronologisch) — beim Zug aus intervals.icu/Datei geht der
  // Kalendertag sonst verloren. Gleicher Präfix wie der intervals.icu-Push
  // (api/intervals/push.ts).
  const title = `${card.date} · ${card.name || "Training"}`;
  const name = xmlEscape(title);
  const description = xmlEscape(card.details || "");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<workout_file>\n` +
    `  <author>Training Dashboard</author>\n` +
    `  <name>${name}</name>\n` +
    `  <description>${description}</description>\n` +
    `  <sportType>bike</sportType>\n` +
    `  <workout>\n    ${segments.join("\n    ")}\n  </workout>\n` +
    `</workout_file>\n`;

  return { xml, filename: `${card.date}-${filenameSlug(card.name)}.zwo` };
}
