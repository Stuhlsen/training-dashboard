/* ============================================================
   SCRIPTS/LIB/WAHOO-COMPARE.JS — Wahoo-Fahrten neben rides.json legen
   (Fahrplan 19 B5, Entscheidung 7: erst „daneben legen", dann bewerten).

   Rein und ohne Netzwerk: bekommt die geparsten Inhalte von data/wahoo-1.json
   und data/rides.json, paart Fahrten und rechnet Abweichungen aus. Die dünne
   CLI (scripts/compare-wahoo.js) liest die Dateien und gibt den Bericht aus.

   PAARUNG: eine Wahoo-Fahrt gehört zu einer intervals.icu-Fahrt, wenn
   - die Startzeiten höchstens MAX_START_DIFF_MIN auseinanderliegen. Beide
     Seiten stammen vom selben Gerät; Unterschiede entstehen nur durch
     Sekunden-Rundung, Auto-Start und Upload-Verzögerung — 10 Minuten ist
     großzügig, trennt aber noch zwei Fahrten am selben Tag (Ein-/Ausrollen
     liegen meist mehr als eine Stunde auseinander).
   - die Dauer (Wahoo: Bewegungszeit, intervals.icu: moving_time) um höchstens
     max(MIN_DURATION_TOL_MIN, MAX_DURATION_DIFF_FRAC · Dauer) abweicht. Das
     fängt zwei verschiedene Fahrten mit zufällig ähnlicher Startzeit ab.
     Fehlt die Dauer auf einer Seite, entscheidet allein die Startzeit.
   Jede Fahrt gehört zu höchstens einem Paar: Kandidaten werden nach
   Startabstand sortiert und der Reihe nach vergeben (nächste zuerst).

   ZEITZONE: rides.json trägt Ortszeit ohne Zone (start_date_local), Wahoo
   liefert UTC. Die Wahoo-Zeit wird darum in DEFAULT_TIME_ZONE (per --tz
   überschreibbar) in Ortszeit umgerechnet. Zeiten ohne Zone gelten schon als
   Ortszeit.

   NUR GLEICHES MIT GLEICHEM (Feldbedeutung geprüft in map-activity.js):
   - Dauer:    Wahoo duration_active_accum  ↔ rides.min  (moving_time, ganze Min.)
   - Distanz:  Wahoo distance_accum         ↔ rides.km   (0,1 km gerundet)
   - Power:    Wahoo power_avg              ↔ rides.watt (icu_average_watts = Ø;
               NICHT rides.np, das ist die normalisierte Leistung)
   - Puls:     Wahoo heart_rate_avg         ↔ rides.hf   (average_heartrate)
   - Kadenz:   Wahoo cadence_avg            ↔ rides.kad  (ganze Zahl gerundet)
   Wahoo-Dauer, -Distanz und -Kadenz werden genauso gerundet wie in rides.json,
   damit Rundungsrauschen nicht als Abweichung erscheint. NICHT verglichen:
   NP, TSS, IF, Zonen, Höhenmeter, Max-Werte (kommen erst mit der FIT-Auswertung
   oder bedeuten nicht dasselbe).

   DATENSCHUTZ: der Bericht zeigt nur Datum, Uhrzeit und die fünf Messwerte —
   keine IDs, Namen, Positionen.
   ============================================================ */

import fs from "node:fs";

export const MAX_START_DIFF_MIN = 10;
export const MAX_DURATION_DIFF_FRAC = 0.1;
export const MIN_DURATION_TOL_MIN = 2;
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

/** Endliche Zahl oder null. */
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Wahoo-Wert wie rides.json auf `step` runden (1 = ganze Zahl, 0.1 = Zehntel). */
const roundedTo = (v, step) => {
  const n = finite(v);
  return n === null ? null : Math.round(n / step) * step;
};

/** Verglichene Größen — Beschriftung und je Seite der Wert. */
export const METRICS = [
  {
    key: "duration",
    label: "Dauer (min)",
    wahoo: (w) => {
      const n = finite(w.movingTimeSec);
      return n === null ? null : Math.round(n / 60);
    },
    icu: (r) => finite(r.min),
  },
  {
    key: "distance",
    label: "Distanz (km)",
    wahoo: (w) => {
      const n = finite(w.distanceKm);
      return n === null ? null : Math.round(n * 10) / 10;
    },
    icu: (r) => finite(r.km),
  },
  {
    key: "power",
    label: "Ø Power (W)",
    wahoo: (w) => finite(w.avgPower),
    icu: (r) => finite(r.watt),
  },
  {
    key: "heartRate",
    label: "Ø Puls (bpm)",
    wahoo: (w) => finite(w.avgHeartRate),
    icu: (r) => finite(r.hf),
  },
  {
    key: "cadence",
    label: "Ø Kadenz (rpm)",
    wahoo: (w) => roundedTo(w.avgCadence, 1),
    icu: (r) => finite(r.kad),
  },
];

/**
 * Abweichung in Prozent: (Wahoo − intervals.icu) / intervals.icu · 100, auf
 * 2 Stellen gerundet. Fehlt ein Wert oder ist er 0 → null („n/a"), nie 0 %.
 * @returns {number|null}
 */
export function percentDiff(wahooValue, icuValue) {
  const w = finite(wahooValue);
  const i = finite(icuValue);
  if (w === null || i === null || w === 0 || i === 0) return null;
  return Math.round(((w - i) / i) * 10000) / 100;
}

const formatters = new Map();
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  }
  return formatters.get(timeZone);
}

/**
 * Wanduhr-Zeit einer ISO-Zeit in `timeZone`, als Millisekunden „so als wäre
 * die Ortszeit UTC". Zeiten ohne Zone gelten schon als Ortszeit.
 * @returns {number|null}
 */
export function wallClockMs(iso, timeZone = DEFAULT_TIME_ZONE) {
  if (typeof iso !== "string" || !iso) return null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) {
    const ms = Date.parse(`${iso}Z`);
    return Number.isNaN(ms) ? null : ms;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const p = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** Dauer-Plausibilität eines Kandidatenpaars (Minuten). */
function durationsCompatible(wahooMin, icuMin) {
  if (!(wahooMin > 0) || !(icuMin > 0)) return true;
  return (
    Math.abs(wahooMin - icuMin) <= Math.max(MIN_DURATION_TOL_MIN, MAX_DURATION_DIFF_FRAC * icuMin)
  );
}

/**
 * Fahrten paaren (eins-zu-eins). Nichts wird verworfen: Fahrten ohne
 * Gegenstück landen in `onlyWahoo` bzw. `onlyIcu`.
 * @param {Array<object>} wahooRides Einträge aus wahoo-1.json
 * @param {Array<object>} icuRides Einträge aus rides.json
 * @param {{timeZone?: string}} [opts]
 */
export function pairRides(wahooRides, icuRides, { timeZone = DEFAULT_TIME_ZONE } = {}) {
  const wStart = wahooRides.map((w) => wallClockMs(w.startTime, timeZone));
  const iStart = icuRides.map((r) => wallClockMs(r.startTime, timeZone));

  const candidates = [];
  wahooRides.forEach((w, wi) => {
    if (wStart[wi] === null) return;
    icuRides.forEach((r, ii) => {
      if (iStart[ii] === null) return;
      const diffMin = Math.abs(wStart[wi] - iStart[ii]) / MIN_MS;
      if (diffMin > MAX_START_DIFF_MIN) return;
      if (!durationsCompatible((finite(w.movingTimeSec) ?? 0) / 60, finite(r.min) ?? 0)) return;
      candidates.push({ wi, ii, diffMin });
    });
  });
  candidates.sort((a, b) => a.diffMin - b.diffMin || a.wi - b.wi || a.ii - b.ii);

  const usedW = new Set();
  const usedI = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (usedW.has(c.wi) || usedI.has(c.ii)) continue;
    usedW.add(c.wi);
    usedI.add(c.ii);
    pairs.push({
      wahoo: wahooRides[c.wi],
      icu: icuRides[c.ii],
      startDiffMin: c.diffMin,
      at: wStart[c.wi],
    });
  }
  pairs.sort((a, b) => a.at - b.at);

  const rest = (rides, used, starts) =>
    rides
      .map((ride, idx) => ({ ride, idx }))
      .filter(({ idx }) => !used.has(idx))
      .sort((a, b) => (starts[a.idx] ?? Infinity) - (starts[b.idx] ?? Infinity))
      .map(({ ride }) => ride);

  return {
    pairs: pairs.map(({ wahoo, icu, startDiffMin }) => ({ wahoo, icu, startDiffMin })),
    onlyWahoo: rest(wahooRides, usedW, wStart),
    onlyIcu: rest(icuRides, usedI, iStart),
  };
}

/** Datum (JJJJ-MM-TT) und Uhrzeit (HH:MM) einer Wanduhr-Zeit. */
function dateAndTime(ms) {
  if (ms === null) return { date: null, start: null };
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), start: iso.slice(11, 16) };
}

/** Pro Paar die fünf Werte beider Seiten samt Abweichung. */
export function compareRides(pairs, timeZone = DEFAULT_TIME_ZONE) {
  return pairs.map((p) => {
    const metrics = {};
    for (const m of METRICS) {
      const w = m.wahoo(p.wahoo);
      const i = m.icu(p.icu);
      metrics[m.key] = { wahoo: w, icu: i, pct: percentDiff(w, i) };
    }
    return { ...dateAndTime(wallClockMs(p.wahoo.startTime, timeZone)), metrics };
  });
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Je Metrik: Anzahl Paare mit Wert, mittlere Abweichung, mittlere absolute
 * Abweichung, größte Abweichung (mit Vorzeichen). n/a-Zellen zählen nicht mit.
 */
export function summarize(rows, metrics = METRICS) {
  const out = {};
  for (const { key } of metrics) {
    const values = rows
      .map((r) => r.metrics[key]?.pct)
      .filter((v) => v !== null && v !== undefined);
    if (values.length === 0) {
      out[key] = { n: 0, mean: null, meanAbs: null, max: null };
      continue;
    }
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    out[key] = {
      n: values.length,
      mean: round2(sum(values) / values.length),
      meanAbs: round2(sum(values.map(Math.abs)) / values.length),
      max: values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)),
    };
  }
  return out;
}

/**
 * Nur die intervals.icu-Fahrten im Zeitraum, den die Wahoo-Datei abdeckt —
 * rides.json reicht Monate weiter zurück, sonst stünden Dutzende alter
 * Fahrten unter „nur intervals.icu".
 */
export function selectIcuWindow(icuRides, wahooData) {
  const generated = Date.parse(wahooData?.generatedAt);
  const days = Number(wahooData?.windowDays);
  let from;
  if (Number.isFinite(generated) && Number.isFinite(days) && days > 0) {
    from = new Date(generated - days * DAY_MS).toISOString().slice(0, 10);
  } else {
    const starts = (wahooData?.rides ?? [])
      .map((w) => Date.parse(w.startTime))
      .filter(Number.isFinite);
    if (starts.length === 0) return [];
    // ein Tag Puffer wegen UTC ↔ Ortszeit
    from = new Date(Math.min(...starts) - DAY_MS).toISOString().slice(0, 10);
  }
  return icuRides.filter((r) => typeof r.date === "string" && r.date >= from);
}

/**
 * Eine Eingabedatei lesen. Nur lesen, nie schreiben.
 * @returns {{state: "ok", data: {rides: Array<object>}} | {state: "missing"} |
 *   {state: "invalid", error: string}}
 */
export function readInput(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (e) {
    if (e?.code === "ENOENT") return { state: "missing" };
    return { state: "invalid", error: "Datei nicht lesbar" };
  }
  if (!text.trim()) return { state: "missing" };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { state: "invalid", error: "Kein gültiges JSON" };
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.rides)) {
    return { state: "invalid", error: 'Feld "rides" (Liste) fehlt' };
  }
  return { state: "ok", data };
}

/** Beide Dateiinhalte → fertiges Ergebnis (auch für die JSON-Ausgabe). */
export function buildComparison(wahooData, ridesData, timeZone = DEFAULT_TIME_ZONE) {
  const icuRides = selectIcuWindow(ridesData.rides, wahooData);
  const { pairs, onlyWahoo, onlyIcu } = pairRides(wahooData.rides, icuRides, { timeZone });
  const rows = compareRides(pairs, timeZone);
  return { timeZone, rows, onlyWahoo, onlyIcu, summary: summarize(rows) };
}

const numberFormat = (digits) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
const PCT_FORMAT = numberFormat(1);
const VALUE_FORMAT = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
  useGrouping: false,
});

const fmtValue = (v) => (v === null || v === undefined ? "–" : VALUE_FORMAT.format(v));
const fmtPct = (p, { signed = true } = {}) => {
  if (p === null || p === undefined) return "n/a";
  return `${signed && p > 0 ? "+" : ""}${PCT_FORMAT.format(p)} %`;
};

function renderTable(header, body) {
  const widths = header.map((h, c) => Math.max(h.length, ...body.map((row) => row[c].length)));
  const line = (cells) =>
    cells
      .map((cell, c) => cell.padEnd(widths[c]))
      .join("  ")
      .trimEnd();
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)];
}

/** Kurzbeschreibung einer unzugeordneten Fahrt (Datum, Uhrzeit, Dauer, Distanz). */
function describeLoose(side, ride, timeZone) {
  const { date, start } = dateAndTime(wallClockMs(ride.startTime, timeZone));
  const dur = METRICS[0][side](ride);
  const km = METRICS[1][side](ride);
  return `  ${date ?? ride.date ?? "?"} ${start ?? "     "}  ${fmtValue(dur)} min  ${fmtValue(km)} km`;
}

/** Lesbarer Konsolenbericht: Tabelle je Paar, Einzellisten, Zusammenfassung. */
export function formatReport({ rows, onlyWahoo, onlyIcu, summary, timeZone }) {
  const lines = [
    `Wahoo-Vergleich — Zellen: Wahoo/intervals.icu und Abweichung (Zeitzone ${timeZone})`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("Keine Paare gefunden.");
  } else {
    const header = ["Datum", "Start", ...METRICS.map((m) => m.label)];
    const body = rows.map((r) => [
      r.date ?? "?",
      r.start ?? "?",
      ...METRICS.map((m) => {
        const c = r.metrics[m.key];
        return `${fmtValue(c.wahoo)}/${fmtValue(c.icu)} ${fmtPct(c.pct)}`;
      }),
    ]);
    lines.push(...renderTable(header, body));
  }

  lines.push("", `nur Wahoo (${onlyWahoo.length}):`);
  lines.push(
    ...(onlyWahoo.length ? onlyWahoo.map((r) => describeLoose("wahoo", r, timeZone)) : ["  –"])
  );
  lines.push("", `nur intervals.icu (${onlyIcu.length}):`);
  lines.push(...(onlyIcu.length ? onlyIcu.map((r) => describeLoose("icu", r, timeZone)) : ["  –"]));

  lines.push("", `Zusammenfassung (${rows.length} Paare, Abweichung relativ zu intervals.icu):`);
  lines.push(
    ...renderTable(
      ["Metrik", "Paare", "Ø Abw.", "Ø |Abw.|", "größte Abw."],
      METRICS.map((m) => {
        const s = summary[m.key];
        return [
          m.label,
          String(s.n),
          fmtPct(s.mean),
          fmtPct(s.meanAbs, { signed: false }),
          fmtPct(s.max),
        ];
      })
    )
  );
  return lines.join("\n");
}
