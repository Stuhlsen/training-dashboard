/* ============================================================
   CORE/PLAN-FTP-RESCALE.JS — Watt-Bänder künftiger Plankarten nach einem
   FTP-Test neu rechnen (Fahrplan 8 E12, Entscheidung 24).

   Reine Funktion, kein DOM/I/O/React. Nach einem gefahrenen FTP-Testtag
   tragen die künftigen Karten noch die `workout.watts`-Bänder, die zur
   FTP zum Zeitpunkt der Plan-Erstellung passten. `workout.pct` und
   `workout_structure` (`target_pct_ftp`) sind bereits FTP-relativ und
   bleiben unverändert — nur `workout.watts` wird aus `pct × neueFTP` neu
   gerechnet, und nur für Karten mit `date >= todayISO`.

   Bewusste Scope-Grenze: ausschließlich `workout.watts`. Kein Neubau von
   Struktur/Dauer/TSS, kein Anfassen von `plan_cards`-Feldern außerhalb von
   `workout`.
   ============================================================ */

/** Ein `[lo,hi]`-Zahlen-Band aus einem JSON-Wert lesen (oder null).
 *  @param {unknown} v @returns {[number,number]|null} */
function numberBand(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lo, hi] = v;
  if (typeof lo !== "number" || typeof hi !== "number") return null;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [lo, hi];
}

/**
 * Neues `watts`-Band eines Workouts aus `pct × newFtp`. Gibt das komplette
 * Workout-Objekt mit ersetztem `watts` zurück — oder `null`, wenn nichts zu
 * tun ist (kein Objekt, kein numerisches `pct`-Band, `newFtp` ungültig, oder
 * das neue Band ist identisch zum vorhandenen).
 * @param {unknown} workout
 * @param {number} newFtp
 * @returns {object|null}
 */
export function rescaledWorkout(workout, newFtp) {
  if (!workout || typeof workout !== "object" || Array.isArray(workout)) return null;
  if (typeof newFtp !== "number" || !Number.isFinite(newFtp) || newFtp <= 0) return null;
  const w = /** @type {Record<string, unknown>} */ (workout);
  const pct = numberBand(w.pct);
  if (!pct) return null;

  const next = /** @type {[number,number]} */ ([
    Math.round((pct[0] / 100) * newFtp),
    Math.round((pct[1] / 100) * newFtp),
  ]);
  const prev = numberBand(w.watts);
  if (prev && prev[0] === next[0] && prev[1] === next[1]) return null;

  return { ...w, watts: next };
}

/**
 * Patch-Liste für die künftigen Karten eines Plans nach einem FTP-Test.
 * Karte übersprungen wenn: Datum vor `todayISO`, ausgefallen, oder
 * `rescaledWorkout()` nichts zu tun hat.
 * @param {object} args
 * @param {Array<{id:string,date:string,cancelled?:boolean,workout?:unknown}>} args.cards
 * @param {number} args.newFtp  positiver, endlicher Wert
 * @param {string} args.todayISO
 * @returns {{ patches: Array<{id:string, workout:object}>, affectedCount:number }}
 */
export function planFtpRescale({ cards, newFtp, todayISO }) {
  const patches = [];
  for (const card of cards || []) {
    if (!card || card.cancelled) continue;
    if (!card.date || card.date < todayISO) continue;
    const workout = rescaledWorkout(card.workout, newFtp);
    if (!workout) continue;
    patches.push({ id: card.id, workout });
  }
  return { patches, affectedCount: patches.length };
}
