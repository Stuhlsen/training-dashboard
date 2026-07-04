/* ============================================================
   SCRIPTS/LIB/LOG.JS — Logging mit Leveln für den Datensync
   Zählt Warnungen/Fehler mit, damit main() am Ende eine
   Zusammenfassung ausgeben und den Exit-Code bestimmen kann.
   ============================================================ */

let warnings = 0;
let errors = 0;

export const log = {
  /** Fortschritts-/Statusmeldung @param {...unknown} args */
  info(...args) {
    console.log(...args);
  },
  /** Nicht-fatales Problem (z.B. Wetter-API down) @param {...unknown} args */
  warn(...args) {
    warnings++;
    console.warn("⚠️ ", ...args);
  },
  /** Fataler Fehler @param {...unknown} args */
  error(...args) {
    errors++;
    console.error("❌", ...args);
  },
  /** Aktuelle Zähler @returns {{warnings: number, errors: number}} */
  get counts() {
    return { warnings, errors };
  },
  /** Abschluss-Zusammenfassung ausgeben */
  summary() {
    console.log(`\nZusammenfassung: ${warnings} Warnung(en), ${errors} Fehler`);
  },
};
