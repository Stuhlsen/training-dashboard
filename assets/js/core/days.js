/* ============================================================
   CORE/DAYS.JS — Dichtes Tagesgerüst (Phase 5, Schritt 0)
   Ersetzt eine Zeitstempelskala: über einer lückenlosen Tagesreihe
   ist der Index bereits eine Datumsachse (docs/phase-5-konzept-
   explorer.md §2.2, docs/chart-grundlagen.md §5/G10).
   ============================================================ */

import { addDaysISO } from "./format.js";

/**
 * Lückenloses Tagesgerüst zwischen zwei ISO-Daten (inklusive beider Enden).
 * Densifiziert wird nur die Achse — welchen Wert eine Serie an einem
 * fehlenden Tag bekommt, entscheidet `joinSeries()`.
 * @param {string} fromISO
 * @param {string} toISO
 * @returns {Array<{dateISO: string, index: number}>}
 */
export function densifyDays(fromISO, toISO) {
  const days = [];
  let index = 0;
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) {
    days.push({ dateISO: d, index });
    index++;
  }
  return days;
}

/**
 * Bildet eine Serie (Zeilen mit `.dateISO` und `[key]`) auf ein Tagesgerüst
 * ab. Ein fehlender Tag bedeutet nicht bei jeder Metrikart dasselbe:
 *
 * - `"zero"` — echte Tagesbelastung (z.B. `tss`): ein Ruhetag ist tatsächlich
 *   null Belastung, jeder fehlende Tag wird 0.
 * - `"carry"` — abgeleitete Zustandsgrößen (CTL/ATL/TSB): existieren an
 *   jedem Tag, unabhängig davon, ob eine Zeile vorliegt. Ein EINZELNER
 *   fehlender Tag übernimmt den letzten bekannten Wert (kein Sprung auf 0).
 *   Fehlen dagegen MEHRERE Tage in Folge, ist das keine Rundung mehr,
 *   sondern eine echte Datenlücke (Sync-Ausfall, fehlende Historie) — ab
 *   zwei aufeinanderfolgenden fehlenden Tagen wird der gesamte Lauf zur
 *   sichtbaren Lücke (`null`), nicht künstlich fortgeschrieben.
 * - `"gap"` — Messmetriken: jeder fehlende Tag ist `null`, nie interpoliert.
 *
 * @param {Array<{dateISO: string, index: number}>} skeleton Tagesgerüst aus densifyDays()
 * @param {Array<Record<string, any>>} rows Zeilen mit `.dateISO` und `[key]`
 * @param {{key: string, absence: "zero"|"carry"|"gap"}} opts
 * @returns {Array<number|null>} Werte in Skelettlänge
 */
export function joinSeries(skeleton, rows, { key, absence }) {
  const byDate = new Map();
  for (const r of rows || []) {
    if (r?.dateISO != null && r[key] != null) byDate.set(r.dateISO, r[key]);
  }

  const n = skeleton.length;
  const out = new Array(n).fill(null);
  let i = 0;
  while (i < n) {
    const dateISO = skeleton[i].dateISO;
    if (byDate.has(dateISO)) {
      out[i] = byDate.get(dateISO);
      i++;
      continue;
    }

    // Lauf zusammenhängender fehlender Tage ab i bestimmen.
    let j = i;
    while (j < n && !byDate.has(skeleton[j].dateISO)) j++;
    const runLength = j - i;

    if (absence === "zero") {
      for (let k = i; k < j; k++) out[k] = 0;
    } else if (absence === "carry") {
      const prevVal = i > 0 ? out[i - 1] : null;
      if (runLength === 1 && prevVal != null) out[i] = prevVal;
      // Lauf ≥ 2 oder kein Vorgänger: bleibt null (echte Lücke).
    }
    // "gap": bleibt null (Array-Default).
    i = j;
  }
  return out;
}
