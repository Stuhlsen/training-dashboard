/* ============================================================
   UI/LOG.JS — Zentrales Logging fürs Frontend
   Eine Stelle statt verstreuter console.*-Aufrufe. Hier kann
   später Nutzer-Feedback (Banner/Toast) angedockt werden, ohne
   alle Aufrufstellen anzufassen.
   ============================================================ */

const PREFIX = "[dashboard]";

export const log = {
  /** @param {...unknown} args */
  debug(...args) {
    console.debug(PREFIX, ...args);
  },
  /** @param {...unknown} args */
  info(...args) {
    console.info(PREFIX, ...args);
  },
  /** @param {...unknown} args */
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  /** @param {...unknown} args */
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
