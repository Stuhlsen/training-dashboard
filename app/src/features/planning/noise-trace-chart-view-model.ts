/* ============================================================
   FEATURES/PLANNING/NOISE-TRACE-CHART-VIEW-MODEL.TS — reine Ableitung für
   den Rausch-Chart (echter Sekunden-Verlauf Watt/Puls) im Planungstab-
   Detail-Chart (docs/offene-punkte.md, Planungstab-Abschnitt). Ergänzt den
   bestehenden Stufenchart/Zonen-Mix, ersetzt ihn nicht.

   Eine Fahrt kann mehrere tausend Sekunden-Samples haben (verifiziert:
   ~8000 bei einer ~2,3h-Fahrt) — für eine kompakte Inline-SVG-Linie werden
   sie auf `BUCKET_COUNT` Buckets gemittelt (Mittelwert, `null`-Lücken
   übersprungen statt als 0 gezählt — ein Sensor-Dropout soll nicht wie ein
   Leistungseinbruch aussehen). Watt und Puls werden UNABHÄNGIG voneinander
   auf ihre jeweilige Min/Max-Spanne normiert (0–100%, keine gemeinsame
   Achse) — die Komponente zeigt zwei Trace-Linien zum Vergleich der
   Verlaufsform, keine absolute Watt-/Puls-Skala. ============================== */

type ActivityStreams = import("../../api/intervals/streams").ActivityStreams;

export const BUCKET_COUNT = 300;

export interface NoiseTracePoint {
  xPct: number;
  yPct: number;
}

export interface NoiseTrace {
  watts: NoiseTracePoint[];
  heartrate: NoiseTracePoint[];
  avgWatts: number | null;
  maxWatts: number | null;
  avgHr: number | null;
  maxHr: number | null;
}

function average(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => v != null);
  if (!present.length) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

function max(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? Math.max(...present) : null;
}

/** Mittelt `values` auf `bucketCount` gleich große Zeitfenster — `null` in
 *  einem Fenster, wenn dort KEIN gültiger Wert lag (nicht 0). */
function bucketAverages(values: Array<number | null> | undefined, sampleCount: number, bucketCount: number): Array<number | null> {
  if (!values?.length) return [];
  const bucketSize = sampleCount / bucketCount;
  const out: Array<number | null> = [];
  for (let b = 0; b < bucketCount; b++) {
    const from = Math.floor(b * bucketSize);
    const to = Math.floor((b + 1) * bucketSize);
    let sum = 0;
    let count = 0;
    for (let i = from; i < to && i < values.length; i++) {
      const v = values[i];
      if (v != null) {
        sum += v;
        count++;
      }
    }
    out.push(count ? sum / count : null);
  }
  return out;
}

/** Normiert Buckets auf ihre eigene Min/Max-Spanne (0–100%) — Lücken
 *  (`null`) erzeugen keinen Punkt, statt eine erfundene Linie zu zeichnen. */
function toPoints(buckets: Array<number | null>): NoiseTracePoint[] {
  const present = buckets.filter((v): v is number => v != null);
  if (!present.length) return [];
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const range = hi - lo || 1;
  const denom = Math.max(buckets.length - 1, 1);
  const points: NoiseTracePoint[] = [];
  buckets.forEach((v, i) => {
    if (v == null) return;
    points.push({ xPct: (i / denom) * 100, yPct: ((v - lo) / range) * 100 });
  });
  return points;
}

/** `null` ohne Streams oder ohne Zeit-Achse (kein Chart statt leerer
 *  Zeichnung — gleiches Slot-Muster wie buildStepChart()/zoneMixFromRide()). */
export function buildNoiseTrace(streams: ActivityStreams | null | undefined): NoiseTrace | null {
  if (!streams?.time.length) return null;
  const sampleCount = streams.time.length;
  const bucketCount = Math.min(BUCKET_COUNT, sampleCount);

  const wattsBuckets = bucketAverages(streams.watts, sampleCount, bucketCount);
  const hrBuckets = bucketAverages(streams.heartrate, sampleCount, bucketCount);

  return {
    watts: toPoints(wattsBuckets),
    heartrate: toPoints(hrBuckets),
    avgWatts: average(streams.watts),
    maxWatts: max(streams.watts),
    avgHr: average(streams.heartrate),
    maxHr: max(streams.heartrate),
  };
}
