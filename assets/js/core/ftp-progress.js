/* ============================================================
   CORE/FTP-PROGRESS.JS — Berechnungen für die Hero-Signaturen
   (Zonen-Band, FTP-Fortschrittsring, nächste geplante Einheit)
   Rein und testbar — Rendering liegt in ui/overview.js.
   ============================================================ */

/**
 * Segmentgrenzen des FTP-Zonen-Bands, relativ zur Watt-Skala.
 * Zonen (an Coggan angelehnt, vereinfacht auf 5 Bänder):
 * Z1 ≤55% · Z2 ≤85% · Sweet Spot ≤97% · Schwelle ≤105% · VO2max ≤120%,
 * darüber Rest-Segment bis zum Skalenende.
 * @param {number} ftp
 * @param {number} scaleMax Skalenende in Watt (z.B. 300)
 * @returns {Array<{cls: string, pct: number}>} Segmente mit Breite in % (Summe 100)
 */
export function zoneSegments(ftp, scaleMax) {
  if (!ftp || !scaleMax || scaleMax <= 0) return [];
  const bounds = [
    ["z1", 0.55],
    ["z2", 0.85],
    ["ss", 0.97],
    ["thr", 1.05],
    ["vo2", 1.2],
  ];
  const segments = [];
  let prev = 0;
  for (const [cls, factor] of bounds) {
    const upper = Math.min(ftp * factor, scaleMax);
    if (upper <= prev) continue;
    segments.push({ cls, pct: ((upper - prev) / scaleMax) * 100 });
    prev = upper;
    if (prev >= scaleMax) break;
  }
  if (prev < scaleMax) {
    segments.push({ cls: "rest", pct: ((scaleMax - prev) / scaleMax) * 100 });
  }
  return segments;
}

/**
 * Position eines Watt-Werts auf der Skala in Prozent (0–100, geklemmt).
 * @param {number|null|undefined} watts
 * @param {number} scaleMax
 * @returns {number|null}
 */
export function pinPercent(watts, scaleMax) {
  if (watts == null || !scaleMax) return null;
  return Math.min(100, Math.max(0, (watts / scaleMax) * 100));
}

/**
 * Fortschritt zum Saisonziel als Anteil 0–1.
 * Basis = Start-FTP der Saison, Ziel = Saisonziel.
 * @param {number|null|undefined} current z.B. aktuelle eFTP
 * @param {number} base
 * @param {number} goal
 * @returns {number} 0–1 (geklemmt); 1 wenn goal <= base
 */
export function ringProgress(current, base, goal) {
  if (current == null) return 0;
  const span = goal - base;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (current - base) / span));
}

/**
 * Nächste anstehende geplante Einheit bestimmen — heute fällige zuerst.
 * Wendet adjustments an (ausgefallen → übersprungen, verschoben → neues
 * Datum) und überspringt bereits absolvierte Termine.
 * @param {Array<{date: string, name?: string, typ?: string, km?: number}>} sessions
 * @param {Record<string, {cancelled?: boolean, movedTo?: string}>} adjustments
 * @param {Set<string>|string[]} doneDates Daten mit erfasster Fahrt
 * @param {string} todayISO YYYY-MM-DD
 * @returns {(Object & {date: string, isToday: boolean})|null}
 */
export function nextPlannedSession(sessions, adjustments, doneDates, todayISO) {
  const done = doneDates instanceof Set ? doneDates : new Set(doneDates || []);
  const adj = adjustments || {};

  const effective = (sessions || [])
    .map((s) => {
      const a = adj[s.date];
      if (a?.cancelled) return null;
      if (a?.movedTo) return { ...s, date: a.movedTo };
      return s;
    })
    .filter((s) => s && s.date >= todayISO && !done.has(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!effective.length) return null;
  const next = effective[0];
  return { ...next, isToday: next.date === todayISO };
}
