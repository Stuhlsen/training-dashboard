/* ============================================================
   SCRIPTS/LIB/HR.JS — Herzfrequenz-Hilfsrechnungen für den Sync

   Reine Funktionen, kein I/O. Aktuell nur die HFmax-Schätzung nach Tanaka
   für den Multi-Sport-TRIMP-Lastpfad (Fahrplan 10 E5a/E6). Bewusst hier in
   scripts/lib/ und NICHT in scripts/lib/core/: die HFmax-Schätzung ist
   sync-seitig — das Frontend nutzt für seine HF-Zonen das config.ts-Literal
   (s. app/src/config.ts::AthleteConfig.hrMax), es gibt keinen geteilten
   app-Konsumenten.
   ============================================================ */

/**
 * Alter in ganzen Jahren zum Stichtag. `null`, wenn kein/ungültiges
 * Geburtsdatum (fehlender Wert, unparsebar, oder in der Zukunft).
 * @param {string|null|undefined} birthdateISO  "YYYY-MM-DD"
 * @param {string} todayISO                     "YYYY-MM-DD" (Stichtag)
 * @returns {number|null}
 */
export function ageFromBirthdate(birthdateISO, todayISO) {
  if (!birthdateISO || !todayISO) return null;
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdateISO);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayISO);
  if (!b || !t) return null;
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])];
  let age = ty - by;
  // Geburtstag dieses Jahr noch nicht gehabt → ein Jahr abziehen.
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

/**
 * HFmax-Schätzung nach Tanaka et al. (2001): HFmax ≈ 208 − 0,7 × Alter.
 * GESCHÄTZT — ersetzt keinen echten Maximaltest; für den Banister-TRIMP-
 * Primärpfad (Fahrplan 10 V3) ist das der Fallback, solange kein
 * gemessener Wert vorliegt. `null`, wenn sich kein Alter bestimmen lässt.
 * @param {string|null|undefined} birthdateISO  "YYYY-MM-DD"
 * @param {string} todayISO                     "YYYY-MM-DD" (Stichtag)
 * @returns {number|null}  gerundete bpm
 */
export function tanakaHrMax(birthdateISO, todayISO) {
  const age = ageFromBirthdate(birthdateISO, todayISO);
  if (age == null) return null;
  return Math.round(208 - 0.7 * age);
}
