/* ============================================================
   FEATURES/SETTINGS/PROFILE-BASICS-INPUT.TS — reine Eingabeprüfung für die
   ProfileBasicsSection-Felder (Fahrplan 17 E3). Ausgelagert wie
   cadence-target-input.ts, damit die DB-Grenzwerte (Migration 0035/0039)
   ohne DOM testbar sind.
   ============================================================ */

export type NumberFieldParse = { ok: true; value: number | null } | { ok: false; error: string };
export type DateFieldParse = { ok: true; value: string | null } | { ok: false; error: string };

function parseIntInRange(raw: string, min: number, max: number, rangeError: string): NumberFieldParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return { ok: false, error: "Bitte eine ganze Zahl eingeben." };
  if (n < min || n > max) return { ok: false, error: rangeError };
  return { ok: true, value: n };
}

/** Ruhepuls — Migration 0035: 30..100 bpm, inklusive. */
export function parseRestingHrInput(raw: string): NumberFieldParse {
  return parseIntInRange(raw, 30, 100, "Ruhepuls zwischen 30 und 100 bpm.");
}

/** Maximalherzfrequenz — Migration 0039: 100..230 bpm, inklusive. */
export function parseHrMaxInput(raw: string): NumberFieldParse {
  return parseIntInRange(raw, 100, 230, "Maximalherzfrequenz zwischen 100 und 230 bpm.");
}

/** Körpergröße — Migration 0039: 100..250 cm, inklusive. */
export function parseHeightCmInput(raw: string): NumberFieldParse {
  return parseIntInRange(raw, 100, 250, "Größe zwischen 100 und 250 cm.");
}

/** Gewicht — Migration 0039: numeric(5,1), 0 < x < 400 kg (exklusiv). Wird
 *  auf eine Nachkommastelle gerundet (DB-Präzision). */
export function parseWeightKgInput(raw: string): NumberFieldParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, error: "Bitte eine Zahl eingeben." };
  if (n <= 0 || n >= 400) return { ok: false, error: "Gewicht zwischen 0 und 400 kg." };
  return { ok: true, value: Math.round(n * 10) / 10 };
}

/** Geburtsdatum — Migration 0035: > 1900-01-01 und < heute (beides
 *  exklusiv). `raw` kommt aus einem `<input type="date">`, also bereits als
 *  `YYYY-MM-DD` oder leer. */
export function parseBirthdateInput(raw: string, today = new Date()): DateFieldParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: "Ungültiges Datum." };
  const min = new Date("1900-01-01T00:00:00Z");
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (parsed <= min || parsed >= todayUtc) {
    return { ok: false, error: "Geburtsdatum außerhalb des gültigen Bereichs." };
  }
  return { ok: true, value: trimmed };
}
