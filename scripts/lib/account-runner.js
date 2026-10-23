/* ============================================================
   SCRIPTS/LIB/ACCOUNT-RUNNER.JS — einen Account des Syncs mit Zeitlimit
   und Fehlerisolation ausführen (Fahrplan 26, E2, Q4).

   Ein hängender oder fehlerhafter Account darf den Lauf der anderen nicht
   blockieren. runAccount() liefert immer ein Result und wirft nie; die
   Laufzeit wird gemessen, geloggt und in `timings` gesammelt (Zusammenfassung
   am Ende des Laufs). Die Aufgabe bekommt ein AbortSignal: nach Ablauf des
   Limits schreibt sie nichts mehr (training-store.js prüft es vor jeder
   Anfrage). Bereits laufende intervals.icu-Abrufe enden von selbst über
   ihr eigenes Timeout (http.js).

   Als Label nur ein Slug oder eine gekürzte Profil-ID — nie Namen oder Keys.
   ============================================================ */

import { log } from "./log.js";

/** Standard-Zeitlimit je Account; per SYNC_ACCOUNT_TIMEOUT_MS überschreibbar. */
export const DEFAULT_ACCOUNT_TIMEOUT_MS = 5 * 60 * 1000;

/** @returns {number} Limit aus der Umgebung, sonst der Standard */
export function accountTimeoutMs(env = process.env) {
  const n = Number(env.SYNC_ACCOUNT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ACCOUNT_TIMEOUT_MS;
}

/**
 * @template T
 * @param {string} label
 * @param {(signal: AbortSignal) => Promise<T>} task
 * @param {{ timeoutMs?: number, timings?: Array<{ label: string, ms: number, ok: boolean }>,
 *           now?: () => number }} [opts]
 * @returns {Promise<{ ok: true, value: T, ms: number } | { ok: false, error: { code: string, message: string }, ms: number }>}
 */
export async function runAccount(label, task, opts = {}) {
  const { timeoutMs = DEFAULT_ACCOUNT_TIMEOUT_MS, timings, now = Date.now } = opts;
  const controller = new AbortController();
  const started = now();
  let timer;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        ok: false,
        error: { code: "TIMEOUT", message: `Zeitlimit von ${timeoutMs} ms überschritten` },
      });
    }, timeoutMs);
  });
  const work = (async () => {
    try {
      return { ok: true, value: await task(controller.signal) };
    } catch (err) {
      return { ok: false, error: { code: "UNKNOWN", message: err?.message ?? String(err) } };
    }
  })();

  const outcome = await Promise.race([work, timeout]);
  clearTimeout(timer);
  const ms = now() - started;
  const result = { ...outcome, ms };

  timings?.push({ label, ms, ok: result.ok });
  if (result.ok) {
    log.info(`⏱️  ${label}: ${(ms / 1000).toFixed(1)} s`);
  } else {
    log.error(
      `${label}: ${result.error.code} — ${result.error.message} (nach ${(ms / 1000).toFixed(1)} s)`
    );
  }
  return result;
}

/** Laufzeit-Zusammenfassung als Logzeilen. @param {Array<{label:string, ms:number, ok:boolean}>} timings */
export function logTimings(timings) {
  if (timings.length === 0) return;
  const total = timings.reduce((sum, t) => sum + t.ms, 0);
  log.info(`\n⏱️  Laufzeit je Account (${timings.length}, gesamt ${(total / 1000).toFixed(1)} s):`);
  for (const t of timings) {
    log.info(`   ${t.ok ? "✓" : "✗"} ${t.label}: ${(t.ms / 1000).toFixed(1)} s`);
  }
}
