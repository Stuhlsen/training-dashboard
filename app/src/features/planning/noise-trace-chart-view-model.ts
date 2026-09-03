/* ============================================================
   FEATURES/PLANNING/NOISE-TRACE-CHART-VIEW-MODEL.TS — reine Ableitung für
   den Rausch-Chart (echter Sekunden-Verlauf Watt/Puls) im Planungstab-
   Detail-Chart (docs/offene-punkte.md, Planungstab-Abschnitt). Bei
   Intervall-Workouts trägt dieser Chart auch das Ziel-Watt-Band
   (targetBandFromCompliance()); der frühere separate Stufenchart ist damit
   entfallen. Ohne Intervallstruktur ergänzt er den Zonen-Mix.

   Eine Fahrt kann mehrere tausend Sekunden-Samples haben (verifiziert:
   ~8000 bei einer ~2,3h-Fahrt) — für eine kompakte Inline-SVG-Linie werden
   sie auf `BUCKET_COUNT` Buckets gemittelt (Mittelwert, `null`-Lücken
   übersprungen statt als 0 gezählt — ein Sensor-Dropout soll nicht wie ein
   Leistungseinbruch aussehen). Puls wird auf seine eigene Min/Max-Spanne
   normiert (0–100%). Die Watt-Kurve ebenso — AUSSER mit `opts.targetBand`:
   dann teilen sich Watt-Kurve und Zielband eine absolute Watt-Skala, damit
   sie maßstabsgetreu übereinanderliegen. ============================== */

type ActivityStreams = import("../../api/intervals/streams").ActivityStreams;

export const BUCKET_COUNT = 300;

export interface NoiseTracePoint {
  xPct: number;
  yPct: number;
}

/** Ein Treppen-Segment der Ziel-Linie: waagerechte Strecke auf Ziel-Watt-
 *  Höhe (`yPct`, gleiche absolute Watt-Skala wie `watts`, 0 = unten) von
 *  `xStartPct` bis `xEndPct`. */
export interface NoiseTraceStep {
  xStartPct: number;
  xEndPct: number;
  yPct: number;
}

export interface NoiseTrace {
  watts: NoiseTracePoint[];
  heartrate: NoiseTracePoint[];
  avgWatts: number | null;
  maxWatts: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** Nur gesetzt, wenn `buildNoiseTrace` mit `opts.targetBand` aufgerufen
   *  wurde: Ziel-Watt-Spanne auf DERSELBEN absoluten Watt-Skala wie die
   *  Watt-Kurve (0–100 %, 0 = unten), damit sie im selben Maßstab
   *  übereinanderliegen. */
  band?: { yLowPct: number; yHighPct: number };
  /** Nur mit `opts.targetProfile`: die zeit-ausgerichtete Ziel-Treppe als
   *  Folge zusammenhängender Läufe (jeder Lauf eine ununterbrochene
   *  Segmentkette; ein neuer Lauf beginnt nach einer Phase ohne Ziel-Watt,
   *  z.B. all-out Sprint). Watt-Kurve UND Treppe teilen sich hier dieselbe
   *  absolute Watt-Skala; x ist an die ECHTE Fahrtlänge gelegt — endet der
   *  Plan früher, endet die Treppe vor dem rechten Rand. */
  stepRuns?: NoiseTraceStep[][];
}

export interface BuildNoiseTraceOpts {
  /** Wenn gesetzt: Watt-Kurve auf absoluter Skala (Min/Max inkl. Bandkanten)
   *  statt eigen-normiert — nur so teilen sich Kurve und Zielband einen
   *  Maßstab. Ohne diese Option bleibt das bisherige Verhalten (Watt-Kurve
   *  auf ihre eigene Min/Max-Spanne normiert, kein `band` im Ergebnis). */
  targetBand?: { lowW: number; highW: number };
  /** Wenn gesetzt (hat Vorrang vor `targetBand`): die volle geplante
   *  Phasenfolge (Warmup → Work → Pause → … → Cooldown) in Watt. Ergibt
   *  `stepRuns` — die zeit-ausgerichtete Ziel-Treppe — und legt die Watt-
   *  Kurve auf die gemeinsame absolute Skala (Min/Max inkl. aller Ziel-Watt).
   *  Phasen mit `watts: null` (ohne relative Intensität) lassen eine Lücke
   *  in der Treppe, verschieben die Zeitachse aber korrekt weiter. */
  targetProfile?: { phases: Array<{ watts: number | null; durationS: number }>; totalS: number };
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

/** Zeichnet `buckets` auf eine vorgegebene Skala [lo, hi] (0–100%) — Lücken
 *  (`null`) erzeugen keinen Punkt, statt eine erfundene Linie zu zeichnen. */
function toPointsOnScale(buckets: Array<number | null>, lo: number, hi: number): NoiseTracePoint[] {
  const range = hi - lo || 1;
  const denom = Math.max(buckets.length - 1, 1);
  const points: NoiseTracePoint[] = [];
  buckets.forEach((v, i) => {
    if (v == null) return;
    points.push({ xPct: (i / denom) * 100, yPct: ((v - lo) / range) * 100 });
  });
  return points;
}

/** Normiert Buckets auf ihre eigene Min/Max-Spanne (0–100%). */
function toPoints(buckets: Array<number | null>): NoiseTracePoint[] {
  const present = buckets.filter((v): v is number => v != null);
  if (!present.length) return [];
  return toPointsOnScale(buckets, Math.min(...present), Math.max(...present));
}

/** `null` ohne Streams oder ohne Zeit-Achse (kein Chart statt leerer
 *  Zeichnung — gleiches Slot-Muster wie zoneMixFromRide()).
 *
 *  Mit `opts.targetBand` wird die Watt-Kurve auf einer absoluten Skala
 *  (Min/Max der Kurve UND der Bandkanten) gezeichnet und `band` mit den
 *  y-Positionen der Bandkanten auf derselben Skala zurückgegeben — so kann
 *  die Komponente das Zielband maßstabsgetreu hinter die Kurve legen.
 *
 *  Mit `opts.targetProfile` (Vorrang vor `targetBand`) entsteht statt des
 *  flachen Bands die zeit-ausgerichtete Ziel-Treppe (`stepRuns`): jede
 *  geplante Phase eine waagerechte Strecke auf ihrer Ziel-Watt-Höhe, x an
 *  die echte Fahrtlänge gelegt (Plan kürzer → Treppe endet vor dem Rand,
 *  Plan länger → am rechten Rand abgeschnitten). Die Watt-Kurve liegt auf
 *  derselben absoluten Skala (Min/Max inkl. aller Ziel-Watt). */
export function buildNoiseTrace(
  streams: ActivityStreams | null | undefined,
  opts: BuildNoiseTraceOpts = {},
): NoiseTrace | null {
  if (!streams?.time.length) return null;
  const sampleCount = streams.time.length;
  const bucketCount = Math.min(BUCKET_COUNT, sampleCount);

  const wattsBuckets = bucketAverages(streams.watts, sampleCount, bucketCount);
  const hrBuckets = bucketAverages(streams.heartrate, sampleCount, bucketCount);

  const trace: NoiseTrace = {
    watts: toPoints(wattsBuckets),
    heartrate: toPoints(hrBuckets),
    avgWatts: average(streams.watts),
    maxWatts: max(streams.watts),
    avgHr: average(streams.heartrate),
    maxHr: max(streams.heartrate),
  };

  const present = wattsBuckets.filter((v): v is number => v != null);
  const profile = opts.targetProfile;
  const profileWatts = profile
    ? profile.phases.map((p) => p.watts).filter((w): w is number => w != null)
    : [];
  const band = opts.targetBand;

  if (profile && profile.totalS > 0 && profileWatts.length) {
    const lo = Math.min(...profileWatts, ...(present.length ? present : profileWatts));
    const hi = Math.max(...profileWatts, ...(present.length ? present : profileWatts));
    const range = hi - lo || 1;
    trace.watts = toPointsOnScale(wattsBuckets, lo, hi);

    const rideSpanS = (streams.time[streams.time.length - 1] - streams.time[0]) || 1;
    const yOf = (w: number) => ((w - lo) / range) * 100;
    const xOf = (sec: number) => Math.max(0, Math.min(100, (sec / rideSpanS) * 100));

    const runs: NoiseTraceStep[][] = [];
    let currentRun: NoiseTraceStep[] = [];
    let cursorS = 0;
    for (const phase of profile.phases) {
      const startS = cursorS;
      cursorS += phase.durationS;
      if (phase.watts == null) {
        // Phase ohne Ziel-Watt (all-out): Uhr läuft weiter, Lauf bricht ab.
        if (currentRun.length) runs.push(currentRun);
        currentRun = [];
        continue;
      }
      if (startS >= rideSpanS) break; // liegt ganz rechts außerhalb der Fahrt
      currentRun.push({ xStartPct: xOf(startS), xEndPct: xOf(cursorS), yPct: yOf(phase.watts) });
    }
    if (currentRun.length) runs.push(currentRun);
    if (runs.length) trace.stepRuns = runs;
  } else if (band) {
    const lo = Math.min(band.lowW, ...(present.length ? present : [band.lowW]));
    const hi = Math.max(band.highW, ...(present.length ? present : [band.highW]));
    const range = hi - lo || 1;
    trace.watts = toPointsOnScale(wattsBuckets, lo, hi);
    trace.band = {
      yLowPct: ((band.lowW - lo) / range) * 100,
      yHighPct: ((band.highW - lo) / range) * 100,
    };
  }

  return trace;
}
