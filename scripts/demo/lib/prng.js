/* ============================================================
   DEMO/LIB/PRNG.JS — deterministischer Zufall für Demo-Daten (Fahrplan 31 E1)
   Kein Math.random(): jeder Zufallsstrom startet aus einem String-Schlüssel
   (z. B. "seed|demo1|2026-03-04"), damit ein Tag unabhängig von allen
   anderen Tagen immer gleich ausfällt.
   ============================================================ */

/**
 * FNV-1a (32 Bit) über einen String — kleiner, stabiler Hash als Startwert.
 * @param {string} str
 * @returns {number} vorzeichenlose 32-Bit-Zahl
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 — liefert eine Funktion, die bei jedem Aufruf die nächste
 * Zahl in [0, 1) zurückgibt.
 * @param {number} seed 32-Bit-Startwert
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zufallsstrom aus beliebig vielen Schlüsselteilen.
 * @param {...(string|number)} parts
 * @returns {() => number}
 */
export function rngFor(...parts) {
  return mulberry32(hashString(parts.join("|")));
}
