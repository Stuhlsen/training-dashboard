/* ============================================================
   CORE/COOK-TIMER.JS — Reine Timer-Logik (Schichtenregel: kein
   DOM, kein window, kein localStorage, kein clock — `now` wird
   immer von aussen übergeben).

   Ein Timer existiert in zwei Zuständen:
   - UNSTARTED: hat kein `endAt` (resetTimer liefert diesen Zustand)
   - RUNNING: hat `endAt` (Zielzeitpunkt in ms seit Unix-Epoch)

   Ein RUNNING-Timer, dessen endAt in der Vergangenheit liegt,
   gilt als EXPIRED.

   Konstanten mit eigenem Ermessen (laut Issue markiert):
   - EXPIRE_STALE_MS: 24 h — Timer, die bei restoreTimers länger
     als 24 h abgelaufen sind, werden verworfen.
   ============================================================ */

/** @typedef {import("../types.js").CookTimer} CookTimer */

/** Maximale Zeit (ms), die ein abgelaufener Timer beim Laden noch
 *  erhalten bleibt — danach wird er verworfen.
 *  EIGENES ERMESSEN (Issue #27, Edge Cases). */
export const EXPIRE_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Prüft, ob eine Zahl ein gültiges durationSeconds ist (> 0, endlich).
 * @param {unknown} value
 * @returns {value is number}
 */
function isValidDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Prüft, ob ein Wert ein gültiger Unix-Timestamp (ms) ist.
 * @param {unknown} value
 * @returns {value is number}
 */
function isValidTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Startet einen Timer.
 *
 * @param {object} opts
 * @param {string} opts.id         Eindeutige ID (z. B. Rezept-Schritt-ID)
 * @param {string} opts.label      Anzeigetext
 * @param {number} opts.durationSeconds  Dauer in Sekunden (> 0)
 * @param {number} opts.now        Aktuelle Zeit in ms seit Unix-Epoch
 * @returns {CookTimer}
 * @throws {Error} Wenn durationSeconds ≤ 0, NaN, Infinity oder keine Zahl
 */
export function startTimer({ id, label, durationSeconds, now }) {
  if (!id || typeof id !== "string") {
    throw new Error("startTimer: id muss ein nicht-leerer String sein");
  }
  if (typeof label !== "string") {
    throw new Error("startTimer: label muss ein String sein");
  }
  if (!isValidDuration(durationSeconds)) {
    throw new Error(
      "startTimer: durationSeconds muss eine positive, endliche Zahl sein",
    );
  }
  if (!isValidTimestamp(now)) {
    throw new Error("startTimer: now muss ein gültiger Unix-Timestamp sein");
  }

  return {
    id,
    label,
    durationSeconds,
    endAt: now + durationSeconds * 1000,
  };
}

/**
 * Gibt die verbleibenden Sekunden eines Timers zurück (nie unter 0).
 * @param {CookTimer} timer
 * @param {number} now  Aktuelle Zeit in ms
 * @returns {number}  Verbleibende Sekunden (≥ 0)
 */
export function remainingSeconds(timer, now) {
  if (!timer.endAt) return timer.durationSeconds;
  const diff = timer.endAt - now;
  return Math.max(0, Math.ceil(diff / 1000));
}

/**
 * Prüft, ob ein Timer abgelaufen ist (endAt in der Vergangenheit).
 * Ein Timer ohne endAt gilt als nicht abgelaufen.
 * @param {CookTimer} timer
 * @param {number} now
 * @returns {boolean}
 */
export function isExpired(timer, now) {
  return timer.endAt != null && timer.endAt <= now;
}

/**
 * Formatiert verbleibende Sekunden als "MM:SS" oder "H:MM:SS".
 * @param {number} seconds
 * @returns {string}
 */
export function formatRemaining(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "–";
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Formatiert eine Restzeit in menschenlesbarer Form (für E7b).
 * Eigene Wahl: "ca. X Sek." / "ca. X Min." / "ca. X Std." / "ca. X Tag"
 * @param {number} seconds
 * @returns {string}
 */
export function formatRestTime(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "–";
  }
  const total = Math.floor(seconds);
  if (total < 60) return `ca. ${total} Sek.`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `ca. ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `ca. ${hours} Std.`;
  const days = Math.round(hours / 24);
  return `ca. ${days} Tag`;
}

/**
 * Setzt einen Timer zurück: entfernt endAt, setzt Zustand auf UNSTARTED.
 * Funktioniert auf RUNNING und EXPIRED Timern.
 * @param {CookTimer} timer
 * @returns {CookTimer}  Neue Kopie ohne endAt
 */
export function resetTimer(timer) {
  return {
    id: timer.id,
    label: timer.label,
    durationSeconds: timer.durationSeconds,
  };
}

/**
 * Findet Timer, die gerade abgelaufen sind (noch nicht in alreadyAlertedIds).
 * @param {CookTimer[]} timers
 * @param {number} now
 * @param {Set<string>} alreadyAlertedIds
 * @returns {string[]}  Ids der neu abgelaufenen Timer
 */
export function newlyExpired(timers, now, alreadyAlertedIds) {
  /** @type {string[]} */
  const result = [];
  for (const t of timers) {
    if (t.endAt != null && t.endAt <= now && !alreadyAlertedIds.has(t.id)) {
      result.push(t.id);
    }
  }
  return result;
}

/**
 * Serialisiert Timer für localStorage.
 * @param {CookTimer[]} timers
 * @returns {string}  JSON-String
 */
export function serializeTimers(timers) {
  return JSON.stringify(timers);
}

/**
 * Stellt Timer aus einem JSON-String wieder her.
 * Validiert jedes Objekt: verwirft Einträge mit fehlenden/ungültigen
 * Feldern. Timer, die vor mehr als EXPIRE_STALE_MS abgelaufen sind,
 * werden ebenfalls verworfen.
 *
 * @param {string} json
 * @param {number} now  Aktuelle Zeit in ms
 * @returns {CookTimer[]}
 */
export function restoreTimers(json, now) {
  if (typeof json !== "string") return [];

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  /** @type {CookTimer[]} */
  const result = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;

    const id = raw.id;
    const label = raw.label;
    const durationSeconds = raw.durationSeconds;
    const endAt = raw.endAt;

    if (typeof id !== "string" || !id) continue;
    if (typeof label !== "string") continue;
    if (!isValidDuration(durationSeconds)) continue;

    // Timer ohne endAt (UNSTARTED) sind gültig
    if (endAt == null) {
      result.push({ id, label, durationSeconds });
      continue;
    }

    if (!isValidTimestamp(endAt)) continue;

    // Timer, die vor mehr als EXPIRE_STALE_MS abgelaufen sind, verwerfen
    if (endAt <= now - EXPIRE_STALE_MS) continue;

    result.push({ id, label, durationSeconds, endAt });
  }

  return result;
}