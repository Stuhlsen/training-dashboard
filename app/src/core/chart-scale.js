/* ============================================================
   CORE/CHART-SCALE.JS — Pixel-Mathematik für Charts (Etappe 8a)
   Portiert aus assets/js/ui/charts/base.js (Zeile 108, 235, 249) — dort
   bewusst im ui/-Layer belassen (Konsistenz mit bestehender Testdatei,
   docs/phase-5-konzept-explorer.md §1.4 X3), hier nach core/ verschoben,
   weil core/ in 3.0 bereits andere pure Chart-Stützlogik hält (days.js,
   chart-buckets.js) und es hier keinen entsprechenden Bestand gibt, zu
   dem Konsistenz Vorrang vor der Schichtenregel hätte.
   ============================================================ */

/**
 * Index-basierte x-Skala über ein Fenster [ws, we]. Arbeitet auf
 * Tagesindizes eines dichten Tagesgerüsts (core/days.js::densifyDays),
 * nicht auf Zeitstempeln. `width` ist die bereits um beide Ränder
 * reduzierte Plotbreite (Aufrufer zieht pad.l/pad.r vorher ab) —
 * `padLeft` verschiebt nur den Ursprung. `invert()` extrapoliert linear
 * über [ws, we] hinaus (keine Klemmung).
 * @param {{ws: number, we: number, padLeft: number, width: number}} args
 * @returns {{x: (i: number) => number, invert: (px: number) => number}}
 */
export function makeIndexScale({ ws, we, padLeft, width }) {
  const span = Math.max(1, we - ws);
  return {
    x: (i) => padLeft + ((i - ws) / span) * width,
    invert: (px) => ws + ((px - padLeft) / width) * span,
  };
}

/**
 * d-String aus Punktpaaren — ersetzt das `points`-Attribut von `<polyline>`.
 * @param {Array<[number, number]>} points
 * @returns {string}
 */
export function pathD(points) {
  if (!points.length) return "";
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
}

/**
 * Wählt Label-Indizes mit Mindestabstand (px). Greedy von links, der
 * LETZTE Punkt ist immer dabei — Kandidaten, die mit ihm kollidieren
 * würden, werden übersprungen.
 * @param {number[]} xs Aufsteigende X-Positionen (Balken-/Punktmitten)
 * @param {number} [minPx]
 * @returns {Set<number>}
 */
export function pickLabelIndices(xs, minPx = 38) {
  const n = xs.length;
  const picked = new Set();
  if (!n) return picked;
  const lastX = xs[n - 1];
  let prev = -Infinity;
  for (let i = 0; i < n - 1; i++) {
    if (xs[i] - prev >= minPx && lastX - xs[i] >= minPx) {
      picked.add(i);
      prev = xs[i];
    }
  }
  picked.add(n - 1);
  return picked;
}
