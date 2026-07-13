/* ============================================================
   CORE/ZONES.JS — Intensitätsverteilung / Time-in-Zone (kein DOM)
   Grundlage: Intensitätsverteilungs-Forschung (Seiler) — für
   Ausdauersportler haben sich pyramidale/polarisierte Verteilungen
   mit ≥ ~80% Zeit im niedrigintensiven Bereich bewährt.
   ============================================================ */

/** Ziel-Anteil niedrigintensiver Zeit (Z1+Z2) als Richtwert */
export const LOW_INTENSITY_TARGET = 0.8;

/**
 * intervals.icu liefert Zone-Times je nach API-Version als Array von
 * Sekunden ODER als Array von {id, secs}-Objekten — hier normalisiert
 * auf ein reines Sekunden-Array (Index = Zone).
 * @param {unknown} zt
 * @returns {number[]|null}
 */
export function normalizeZoneTimes(zt) {
  if (!Array.isArray(zt) || !zt.length) return null;
  if (typeof zt[0] === "number") return zt.map((v) => v || 0);
  if (typeof zt[0] === "object" && zt[0] !== null) {
    return zt.map((z) => z.secs || z.seconds || 0);
  }
  return null;
}

/**
 * Zonen-Sekunden auf drei Intensitätsbänder verdichten (Coggan-Zonen):
 * low = Z1+Z2 (Grundlage) · mid = Z3+Z4 (Tempo/Schwelle) · high = Z5+ (VO2max+)
 * @param {number[]} secs
 * @returns {{low: number, mid: number, high: number, total: number}}
 */
export function bandZoneTimes(secs) {
  const at = (i) => secs[i] || 0;
  const low = at(0) + at(1);
  const mid = at(2) + at(3);
  const high = secs.slice(4).reduce((s, v) => s + (v || 0), 0);
  return { low, mid, high, total: low + mid + high };
}

/**
 * Wöchentliche Intensitätsverteilung aus Fahrten mit zoneTimes.
 * Wochen ohne Zonendaten entfallen.
 * @param {import("../types.js").Ride[]} rides
 * @param {(r: import("../types.js").Ride) => string} weekKeyFn
 * @param {(a: string, b: string) => number} weekSortFn
 * @returns {Array<{week: string, low: number, mid: number, high: number, lowShare: number, hours: number, onTarget: boolean}>}
 */
export function weeklyZoneShares(rides, weekKeyFn, weekSortFn) {
  const byWeek = {};
  for (const r of rides) {
    const secs = normalizeZoneTimes(r.zoneTimes);
    if (!secs) continue;
    const key = weekKeyFn(r);
    if (!key) continue;
    const band = bandZoneTimes(secs);
    if (!byWeek[key]) byWeek[key] = { low: 0, mid: 0, high: 0 };
    byWeek[key].low += band.low;
    byWeek[key].mid += band.mid;
    byWeek[key].high += band.high;
  }

  return Object.keys(byWeek)
    .sort(weekSortFn)
    .map((week) => {
      const b = byWeek[week];
      const total = b.low + b.mid + b.high;
      if (!total) return null;
      const lowShare = b.low / total;
      return {
        week,
        low: b.low,
        mid: b.mid,
        high: b.high,
        lowShare: Math.round(lowShare * 1000) / 1000,
        hours: Math.round((total / 3600) * 10) / 10,
        onTarget: lowShare >= LOW_INTENSITY_TARGET,
      };
    })
    .filter(Boolean);
}

/**
 * Gesamt-Intensitätsverteilung über alle Fahrten mit zoneTimes.
 * @param {import("../types.js").Ride[]} rides
 * @returns {null | {low: number, mid: number, high: number, total: number, shares: {low: number, mid: number, high: number}, hours: number, nRides: number, source: "zoneTimes"}}
 */
export function overallZoneShares(rides) {
  let low = 0,
    mid = 0,
    high = 0,
    n = 0;
  for (const r of rides || []) {
    const secs = normalizeZoneTimes(r.zoneTimes);
    if (!secs) continue;
    const b = bandZoneTimes(secs);
    low += b.low;
    mid += b.mid;
    high += b.high;
    n++;
  }
  const total = low + mid + high;
  if (!total || !n) return null;
  const share = (v) => Math.round((v / total) * 1000) / 1000;
  return {
    low,
    mid,
    high,
    total,
    shares: { low: share(low), mid: share(mid), high: share(high) },
    hours: Math.round((total / 3600) * 10) / 10,
    nRides: n,
    source: "zoneTimes",
  };
}

/** IF-Grenzen für die Fallback-Bänderung (Ganzfahrt-IF, grob):
 *  low < 0.75 · mid 0.75–1.05 · high > 1.05 */
export const IF_BANDS = { lowMax: 0.75, midMax: 1.05 };

/**
 * Ganzfahrt-Intensitätsfaktor einer Fahrt. Bevorzugt das gelieferte
 * r.if, leitet es sonst aus NP/FTP ab (IF = NP ÷ FTP) — im aktuellen
 * Datenbestand trägt nur ein Bruchteil der Fahrten r.if, aber fast alle
 * np + ftpWatt, sodass die Ableitung die Bänderung erst repräsentativ macht.
 * @param {import("../types.js").Ride} r @returns {number|null}
 */
export function rideIF(r) {
  if (r.if != null) return r.if;
  if (r.np && r.ftpWatt) return r.np / r.ftpWatt;
  return null;
}

/**
 * Fallback ohne zoneTimes: Fahrten per Ganzfahrt-IF in Bänder einordnen,
 * gewichtet mit der Dauer. Bewusst grob (Intervalle verwässern den
 * Ganzfahrt-IF) — in der UI IMMER als "Näherung über IF" labeln.
 * @param {import("../types.js").Ride[]} rides
 * @returns {null | {low: number, mid: number, high: number, total: number, shares: {low: number, mid: number, high: number}, hours: number, nRides: number, source: "if"}}
 */
export function overallBandsFromIF(rides) {
  let low = 0,
    mid = 0,
    high = 0,
    n = 0;
  for (const r of rides || []) {
    const factor = rideIF(r);
    if (factor == null || !r.min) continue;
    const secs = r.min * 60;
    if (factor < IF_BANDS.lowMax) low += secs;
    else if (factor <= IF_BANDS.midMax) mid += secs;
    else high += secs;
    n++;
  }
  const total = low + mid + high;
  if (!total || !n) return null;
  const share = (v) => Math.round((v / total) * 1000) / 1000;
  return {
    low,
    mid,
    high,
    total,
    shares: { low: share(low), mid: share(mid), high: share(high) },
    hours: Math.round((total / 3600) * 10) / 10,
    nRides: n,
    source: "if",
  };
}

/**
 * Klassifikation der Verteilungsform (3-Zonen-Modell):
 * - polarisiert: low dominiert, high > mid
 * - pyramidal:   low > mid > high
 * - schwellenlastig: mid ≥ low (Mittelbereich dominiert)
 * @param {{low: number, mid: number, high: number}} shares Anteile (0–1)
 * @returns {{shape: "polarisiert"|"pyramidal"|"schwellenlastig", onTarget: boolean, note: string}}
 */
export function distributionShape(shares) {
  const { low, mid, high } = shares;
  let shape;
  if (mid >= low) shape = "schwellenlastig";
  else if (high > mid) shape = "polarisiert";
  else shape = "pyramidal";

  const onTarget = low >= LOW_INTENSITY_TARGET;
  const note =
    shape === "schwellenlastig"
      ? "Viel Zeit im mittleren Bereich — typisches Muster, wenn Grundlagenfahrten zu hart geraten."
      : onTarget
        ? `${shape === "polarisiert" ? "Polarisiert" : "Pyramidal"} mit ≥80% niedriger Intensität — bewährtes Ausdauermuster.`
        : `${shape === "polarisiert" ? "Polarisierte" : "Pyramidale"} Form, aber der Grundlagenanteil liegt unter dem 80%-Richtwert.`;
  return { shape, onTarget, note };
}

/* ============================================================
   COGGAN-LEISTUNGSZONEN (FTP-basiert, für den Hero-Header)
   Getrennt vom Ride-Historie-Bänderungscode oben — hier geht es um
   FTP-Prozent-Grenzen für die interaktive Leistungsskala, nicht um
   die Auswertung geloggter zoneTimes.
   ============================================================ */

/** Obergrenzen der Coggan-Zonen in % FTP (Z1 <55% · Z2 55–75% ·
 *  Z3 76–90% · Z4 91–105% · Z5 106–120%). Die Zonen werden lückenlos
 *  verkettet (Zone n.bisW === Zone n+1.vonW) — die minimalen
 *  1%-Textlücken der Spec ("75%" vs. "76%") verschwinden ohnehin bei
 *  gerundeten Wattgrenzen und würden sonst eine Lücke in der Skala
 *  reißen. Z6+ (>120%) ist bewusst NICHT Teil des Arrays — auf der
 *  Skala nur als offener Rand angedeutet, kein volles Segment. */
export const COGGAN_ZONE_UPPER_PCT = [0.55, 0.75, 0.9, 1.05, 1.2];

const COGGAN_ZONE_META = [
  { id: "z1", label: "Z1 Recovery", farbe: "var(--z1)" },
  { id: "z2", label: "Z2 Endurance", farbe: "var(--z2)" },
  { id: "z3", label: "Z3 Tempo", farbe: "var(--z3)" },
  { id: "z4", label: "Z4 Threshold", farbe: "var(--thr)" },
  { id: "z5", label: "Z5 VO2max", farbe: "var(--vo2)" },
];

/** Sweet-Spot-Overlay-Band in % FTP (88–94%) — KEINE eigene Zone,
 *  sondern ein Band, das über der Z3/Z4-Grenze liegt. */
export const SWEET_SPOT_PCT = [0.88, 0.94];

/**
 * Coggan-Trainingszonen für einen FTP-Wert, als lückenlose Kette.
 * @param {number} ftp FTP in Watt (> 0)
 * @returns {Array<{id: string, label: string, vonW: number, bisW: number, farbe: string}>}
 *   Genau 5 Einträge z1..z5, alle Watt-Werte Math.round.
 */
export function computeZones(ftp) {
  if (!ftp || ftp <= 0) return [];
  let prev = 0;
  return COGGAN_ZONE_UPPER_PCT.map((pct, i) => {
    const bisW = Math.round(ftp * pct);
    const zone = { ...COGGAN_ZONE_META[i], vonW: prev, bisW };
    prev = bisW;
    return zone;
  });
}

/**
 * Sweet-Spot-Overlay-Band (88–94% FTP) — kein Segment, sondern eine
 * zusätzliche Watt-Range für ein Overlay-Element über Z3/Z4.
 * @param {number} ftp
 * @returns {{vonW: number, bisW: number}}
 */
export function sweetSpotBand(ftp) {
  if (!ftp || ftp <= 0) return { vonW: 0, bisW: 0 };
  return {
    vonW: Math.round(ftp * SWEET_SPOT_PCT[0]),
    bisW: Math.round(ftp * SWEET_SPOT_PCT[1]),
  };
}

/**
 * Skalenmaximum der Leistungsskala = Ende von Zone 5 (120% FTP),
 * gerundet. Wächst dynamisch mit ftp (auch für den What-if-Slider).
 * @param {number} ftp
 * @returns {number}
 */
export function scaleMaxWatts(ftp) {
  const zones = computeZones(ftp);
  return zones.length ? zones[zones.length - 1].bisW : 0;
}

/** Fester Watt-Puffer für whatIfScaleMax() — siehe dort. */
export const WHATIF_SCALE_HEADROOM_W = 80;

/**
 * Referenzskala für die INTERAKTIVE Leistungsskala im Hero-Header (What-if-
 * Slider). NICHT dasselbe wie scaleMaxWatts(ftp): eine reine Multiplikation
 * (scaleMax = 1.2×ftp) würde bedeuten, dass Zonengrenzen UND Skalenmaximum
 * exakt proportional zum selben ftp wachsen — der Skalierungsfaktor kürzt
 * sich dann für JEDEN Watt-Wert (Zonenbreiten-Anteile, aber auch der
 * Ziel-Marker selbst, da Ziel === ftp) exakt heraus, wodurch sie bei jedem
 * Ziel-FTP identisch aussehen, obwohl sich der Slider bewegt (Regression:
 * siehe tests/zones-coggan.test.js). Ein fester additiver Watt-Puffer
 * (WHATIF_SCALE_HEADROOM_W) durchbricht diese exakte Selbstkürzung, sodass
 * Zonenbreiten UND alle Watt-Marker (FTP/eFTP/Ziel) sich beim Verschieben
 * des Sliders sichtbar verändern. Der äußere Skala-CONTAINER ist davon
 * unabhängig — dessen Pixelbreite kommt ausschließlich aus dem Layout
 * (ui/overview.js setzt nie eine Container-Breite, nur %-Breiten der
 * Kind-Elemente relativ zu diesem Rückgabewert).
 * @param {number} ftp
 * @param {number} [headroomWatts]
 * @returns {number}
 */
export function whatIfScaleMax(ftp, headroomWatts = WHATIF_SCALE_HEADROOM_W) {
  const base = scaleMaxWatts(ftp);
  return base ? base + headroomWatts : 0;
}

/**
 * Zeit-in-Zone (Sekunden) über alle Rides der letzten 7 Tage
 * (inkl. todayISO), für die Hover-Tooltips der Leistungsskala. Nutzt
 * die bestehende normalizeZoneTimes()-Normalisierung — Ride-Zonen
 * kommen bereits vorklassifiziert von intervals.icu, hier wird nur
 * nach Datum gefiltert und aufsummiert (Index 0=Z1..4=Z5, Index≥4
 * wird wie bandZoneTimes() zu Z5+ zusammengefasst).
 * @param {Array<{dateISO?: string, date?: string, zoneTimes?: unknown}>} rides
 * @param {string} todayISO "YYYY-MM-DD" — Ende des 7-Tage-Fensters (inklusiv)
 * @returns {number[]} Sekunden, Länge 5 (Index 0=Z1..4=Z5+)
 */
export function last7DayZoneTimes(rides, todayISO) {
  const result = [0, 0, 0, 0, 0];
  if (!todayISO) return result;
  const end = new Date(todayISO + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const startISO = start.toISOString().slice(0, 10);

  for (const r of rides || []) {
    const d = r.dateISO || r.date;
    if (!d || d < startISO || d > todayISO) continue;
    const secs = normalizeZoneTimes(r.zoneTimes);
    if (!secs) continue;
    for (let i = 0; i < secs.length; i++) {
      const idx = Math.min(i, 4);
      result[idx] += secs[i] || 0;
    }
  }
  return result;
}
