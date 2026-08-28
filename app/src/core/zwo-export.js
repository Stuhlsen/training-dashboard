/* ============================================================
   CORE/ZWO-EXPORT.JS — Plankarte → Zwift-Workout-Datei (.zwo, kein DOM)

   Zwift und MyWhoosh lesen dasselbe .zwo-XML-Format (MyWhoosh hat keinen
   lokalen Workout-Ordner wie Zwift, sondern nimmt dieselbe Datei über den
   Web-Workout-Builder entgegen) — ein Builder reicht für beide Ziele, die
   UI unterscheidet nur den Zielhinweis (Ordner vs. Upload).

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

   isNumericWorkout() dupliziert bewusst die Formerkennung aus
   app/src/api/intervals/push.ts::isBlockWorkout() — core/ darf laut
   Schichtentabelle nichts aus api/ importieren, auch keine Hilfsfunktion.
   ============================================================ */

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

/** @param {{name?: string|null, date: string, workout?: unknown, details?: string|null}} card
 *  @returns {{ok: true, xml: string, filename: string}|{ok: false, error: {code: string, message: string}}} */
export function buildZwoWorkout(card) {
  const w = card?.workout;
  if (!canExportZwo(w)) {
    return {
      ok: false,
      error: { code: "NO_DATA", message: "Kein vollständiges Intervall-Workout mit %FTP-Werten — Dateiexport nicht möglich." },
    };
  }

  const onPower = (midPct(w.pct) / 100).toFixed(2);
  const onDuration = Math.round(w.duration * 60);

  // Pausen NUR zwischen den Wiederholungen, keine nach der letzten — dieselbe
  // Konvention wie workoutSegments() in core/ftp-progress.js (restMin =
  // (intervals-1)×rest), sonst weicht die exportierte Dauer von der Dauer/
  // TSS-Schätzung ab, die die App selbst für dieselbe Karte anzeigt.
  const mainSetSegments = [];
  if (w.intervals > 1) {
    const offDuration = Math.round((w.rest || 0) * 60);
    mainSetSegments.push(
      `<IntervalsT Repeat="${w.intervals - 1}" OnDuration="${onDuration}" OffDuration="${offDuration}" OnPower="${onPower}" OffPower="0.5"/>`,
    );
  }
  mainSetSegments.push(`<SteadyState Duration="${onDuration}" Power="${onPower}"/>`);

  const segments = [
    `<SteadyState Duration="${Math.round(w.warmup * 60)}" Power="0.6"/>`,
    ...mainSetSegments,
    `<Cooldown Duration="${Math.round(w.cooldown * 60)}" PowerLow="0.5" PowerHigh="0.4"/>`,
  ];

  const name = xmlEscape(card.name || "Training");
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

  return { ok: true, xml, filename: `${card.date}-workout.zwo` };
}
