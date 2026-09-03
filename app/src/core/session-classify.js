/* ============================================================
   CORE/SESSION-CLASSIFY.JS — Datenbasierte Ist-Typerkennung (kein DOM)

   v1: deterministischer Entscheidungsbaum aus IF (NP/FTP), Dauer und —
   wenn vorhanden — Zonenverteilung. Keine Statistik über die eigene
   Historie, kein Modell. Die IF-Grenzen sind unverändert aus
   scripts/lib/map-activity.js::inferTypFromIF() übernommen (projekteigene
   Setzungen); alle Schwellen liegen als benannte Konstanten in
   core/plan-config.js (SESSION_CLASSIFY), nicht hier vergraben.

   `ftp` MUSS die FTP sein, die am Fahrttag galt — NICHT die aktuelle FTP.
   Dieses Modul trifft dazu keine Annahme und holt sich auch keine; die
   Wahl der richtigen FTP ist Sache der aufrufenden Stelle (s. Kommentar
   in scripts/lib/map-activity.js, wo das für die Pipeline entschieden ist).

   Rückgabe je Fahrt ist kein Debug-Beiwerk: `signals` ist das, was der
   Mensch später auf der Karte sieht (Export-Richtungsvorgabe-Konzept,
   Schritt 6 der Ist-Typerkennung) — nur was die Einstufung tatsächlich
   beeinflusst hat, keine Zierdaten.
   ============================================================ */

import { SESSION_CLASSIFY, TYPE_EXPECTED_BAND } from "./plan-config.js";

const BAND_LABEL = { low: "Z1/Z2", mid: "Z3/Z4+", high: "Z5+" };

/** IF-Band-Note für die erkannte Regel, mit den echten Konstanten aus
 *  SESSION_CLASSIFY (nie hartkodierte Zahlen im Text). */
function ifBandNote(rule, C) {
  switch (rule) {
    case "ftp-test":
      return `über ${C.ftpTestMinIF} IF bei unter ${C.ftpTestMaxMin} min — FTP-Test-Muster`;
    case "if-niedrig-lang":
    case "if-niedrig-dauer":
    case "if-niedrig-kurz":
      return `unter der Z2-Schwelle ${C.ifLowMax}`;
    case "if-z2dauer":
    case "if-z2dauer-lang-override":
      return `im Z2-Dauer-Band (${C.ifLowMax}–${C.ifZ2DauerMax})`;
    case "if-tempo":
      return `im Tempo-Band (${C.ifZ2DauerMax}–${C.ifTempoMax})`;
    case "if-sweet-spot":
      return `im Sweet-Spot-Band (${C.ifTempoMax}–${C.ifSweetSpotMax})`;
    case "if-schwelle":
      return `im Schwellenbereich (${C.ifSweetSpotMax}–${C.ifSchwelleMax})`;
    case "if-vo2max":
      return `über der Schwelle ${C.ifSchwelleMax} — VO2max-Bereich`;
    default:
      return "";
  }
}

/**
 * Zonenzeiten (beide bekannten intervals.icu-Formate, s.
 * core/zones.js::normalizeZoneTimes) zu Low/Mid/High-Anteilen verdichten.
 * Bewusst NICHT core/zones.js::bandZoneTimes() wiederverwendet: dieses
 * Projekt trägt in zoneTimes zusätzlich zu Z1..Z7 einen "SS"-Eintrag
 * (Sweet-Spot-Overlay, 88–94% FTP), der sich mit Z3/Z4 überschneidet und
 * bereits erfasste Zeit doppelt zählt (an mehreren Ist-Fahrten verifiziert:
 * Summe aller Segmente inkl. SS liegt spürbar über der gemeldeten
 * Fahrtdauer, ohne SS stimmt sie fast exakt). bandZoneTimes() zählt SS
 * aktuell mit in den "high"-Bucket — für die Konfidenz-Prüfung hier wäre
 * das eine falsche Grundlage, deshalb eigene, id-basierte Filterung statt
 * der gemeinsamen Funktion. (Beobachtung, kein Fix hier — bandZoneTimes()
 * selbst bleibt unangetastet, andere Charts sind darauf kalibriert.)
 * @param {unknown} zoneTimes
 * @returns {{low:number, mid:number, high:number}|null} Anteile 0–1
 */
function zoneBandShares(zoneTimes) {
  if (!Array.isArray(zoneTimes) || !zoneTimes.length) return null;
  let low = 0,
    mid = 0,
    high = 0;
  if (typeof zoneTimes[0] === "number") {
    const at = (i) => zoneTimes[i] || 0;
    low = at(0) + at(1);
    mid = at(2) + at(3);
    high = zoneTimes.slice(4).reduce((s, v) => s + (v || 0), 0);
  } else {
    const byId = {};
    for (const z of zoneTimes) {
      if (z && typeof z === "object" && z.id != null && z.id !== "SS") {
        byId[z.id] = z.secs || z.seconds || 0;
      }
    }
    low = (byId.Z1 || 0) + (byId.Z2 || 0);
    mid = (byId.Z3 || 0) + (byId.Z4 || 0);
    high = (byId.Z5 || 0) + (byId.Z6 || 0) + (byId.Z7 || 0);
  }
  const total = low + mid + high;
  if (!total) return null;
  return { low: low / total, mid: mid / total, high: high / total };
}

const pct = (v) => `${Math.round(v * 100)}%`;

/** Intensitäts-Rang je Typ, nur für den Blockerkennung-Vergleich unten:
 *  ein gefundener Block darf die Einstufung nur ANHEBEN, nie absenken.
 *  FTP-Test bewusst nicht enthalten — dieses Muster (kurz + sehr hoher IF)
 *  wird vom Block nie überschrieben, s. dort. */
const INTENSITY_RANK = {
  "Z1 Recovery": 0,
  "Z2 Dauer": 0,
  "Z2 Lang": 0,
  Ausrollen: 0,
  Einrollen: 0,
  Tempo: 1,
  "Sweet Spot": 2,
  Schwelle: 3,
  VO2max: 4,
};

/**
 * Trainingstyp einer Ist-Fahrt aus den erhobenen Daten ableiten (nicht aus
 * dem Plan). Reine Funktion, deterministisch.
 * @param {{np?:number|null, ftp?:number|null, min?:number|null,
 *   tss?:number|null, trimp?:number|null, km?:number|null,
 *   zoneTimes?: unknown,
 *   longestBlock?: {startSec:number, endSec:number, totalDurationSec:number,
 *     workDurationSec:number, avgWatts:number}|null}} ride
 * @returns {{
 *   type: string|null,
 *   confidence: "hoch"|"mittel"|"niedrig",
 *   signals: Array<{label:string, value: string|number|null, note?:string}>,
 *   rule: string,
 * }}
 */
export function classifySession({ np, ftp, min, zoneTimes, longestBlock } = {}) {
  const C = SESSION_CLASSIFY;

  if (!np || !ftp) {
    return {
      type: null,
      confidence: "niedrig",
      signals: [
        {
          label: "Leistungsdaten",
          value: null,
          note: "keine Normalized Power/FTP für diese Fahrt verfügbar — Typ nicht ableitbar",
        },
      ],
      rule: "keine-leistungsdaten",
    };
  }

  const ifVal = Math.round((np / ftp) * 1000) / 1000;
  const durMin = min ?? null;

  let type, rule;
  if (durMin != null && durMin < C.ftpTestMaxMin && ifVal > C.ftpTestMinIF) {
    type = "FTP-Test";
    rule = "ftp-test";
  } else if (ifVal < C.ifLowMax) {
    if (durMin != null && durMin >= C.longRideMin) {
      type = "Z2 Lang";
      rule = "if-niedrig-lang";
    } else if (durMin != null && durMin >= C.dauerMin) {
      type = "Z2 Dauer";
      rule = "if-niedrig-dauer";
    } else {
      type = "Z1 Recovery";
      rule = "if-niedrig-kurz";
    }
  } else if (ifVal < C.ifZ2DauerMax) {
    if (durMin != null && durMin >= C.langOverrideMin) {
      type = "Z2 Lang";
      rule = "if-z2dauer-lang-override";
    } else {
      type = "Z2 Dauer";
      rule = "if-z2dauer";
    }
  } else if (ifVal < C.ifTempoMax) {
    type = "Tempo";
    rule = "if-tempo";
  } else if (ifVal < C.ifSweetSpotMax) {
    type = "Sweet Spot";
    rule = "if-sweet-spot";
  } else if (ifVal < C.ifSchwelleMax) {
    type = "Schwelle";
    rule = "if-schwelle";
  } else {
    type = "VO2max";
    rule = "if-vo2max";
  }

  const signals = [
    { label: "IF", value: ifVal, note: `NP ${np}W ÷ FTP ${ftp}W — ${ifBandNote(rule, C)}` },
  ];
  if (durMin != null) {
    let durNote;
    if (rule === "if-niedrig-lang") durNote = `≥ ${C.longRideMin} min → Einstufung als Z2 Lang`;
    else if (rule === "if-z2dauer-lang-override")
      durNote = `≥ ${C.langOverrideMin} min → trotz Z2-Dauer-Band als Z2 Lang eingestuft`;
    signals.push({ label: "Dauer", value: `${durMin} min`, note: durNote });
  }

  // Blockerkennung (v2, 30.07.2026): ein langer zusammenhängender Block
  // ≥ Sweet-Spot-Schwelle hebt die IF-Durchschnitts-Einstufung an, wenn
  // Warmup/Cooldown/Pausen sie sonst unterschätzt hätten — nie eine
  // Abwertung (INTENSITY_RANK-Vergleich), nie bei FTP-Test (eigenes,
  // bereits konfidentes Muster).
  //
  // Zielwert bewusst IMMER "Sweet Spot", nie feiner nach Schwelle/VO2max
  // differenziert: ein erster Entwurf hat blockIF über dieselbe IF-Leiter
  // wie oben gemappt (analog zum Fahrt-Durchschnitt) — das kippte die
  // 21.07.-Kalibrierungsfahrt (bereits verifiziert korrekt "Sweet Spot")
  // auf "VO2max", weil ihr Block bei 204 W / IF 1,057 lag, hauchdünn über
  // ifSchwelleMax. Ein sustained Block bei ~105 % FTP über zehn Minuten
  // ist aber eher Schwelle als VO2max (VO2max-Intervalle sind kürzer und
  // deutlich härter) — die Fahrt-Durchschnitt-Leiter passt nicht 1:1 auf
  // Block-Durchschnitte, und mit nur zwei Kalibrierungsfahrten lässt sich
  // keine eigene, verlässliche Block-Leiter aufstellen. longestBlockAbove-
  // Threshold() garantiert ohnehin nur "mindestens Sweet-Spot-Niveau"
  // (Schwelle dort = ftp·ifTempoMax) — das ist der einzige Wert, der sich
  // aus den Blockdaten tatsächlich sicher ableiten lässt.
  // Zusätzlich zur absoluten Mindestdauer (blockMinDurationSec) muss der
  // Block auch einen relevanten ANTEIL der Fahrzeit ausmachen
  // (blockMinSharePct) — sonst zählt eine 5-Minuten-Anstrengung in einer
  // 90-Minuten- genauso wie in einer 4-Stunden-Fahrt. Beide Bedingungen
  // müssen gelten (kalibriert an allen 53 Ist-Fahrten 01.05.–30.07.2026,
  // s. Kommentar in plan-config.js — ohne die Anteils-Schwelle hätte eine
  // 244-min-Fahrt mit einem 5-min-Block fälschlich "Sweet Spot" bekommen).
  const blockShare = longestBlock && durMin ? longestBlock.workDurationSec / (durMin * 60) : 0;
  let blockUpgraded = false;
  if (
    longestBlock &&
    rule !== "ftp-test" &&
    longestBlock.workDurationSec >= C.blockMinDurationSec &&
    blockShare >= C.blockMinSharePct
  ) {
    const blockType = "Sweet Spot";
    const blockMin = Math.round(longestBlock.workDurationSec / 60);
    const blockSharePct = Math.round(blockShare * 1000) / 10;
    const blockNote = `${blockMin} min zusammenhängend über Schwelle (${longestBlock.avgWatts} W, ${blockSharePct}% der Fahrzeit)`;
    if (INTENSITY_RANK[blockType] > (INTENSITY_RANK[type] ?? 0)) {
      signals.push({
        label: "Zusammenhängender Block",
        value: blockNote,
        note: `hebt Einstufung von ${type} auf ${blockType} an`,
      });
      type = blockType;
      rule = `block-upgrade-${blockType.toLowerCase().replace(/\s+/g, "-")}`;
      blockUpgraded = true;
    } else {
      signals.push({ label: "Zusammenhängender Block", value: blockNote, note: `bestätigt ${type}` });
    }
  }

  let confidence = blockUpgraded ? "hoch" : "mittel";
  const bands = zoneBandShares(zoneTimes);
  if (bands) {
    const expected = TYPE_EXPECTED_BAND[type];
    const share = expected === "mid" ? bands.mid + bands.high : bands[expected] ?? null;
    const passes = share != null && share >= C.bandMinShare[expected];
    signals.push({
      label: "Zonenverteilung",
      value: `${BAND_LABEL.low} ${pct(bands.low)} · ${BAND_LABEL.mid} ${pct(bands.mid)} · ${BAND_LABEL.high} ${pct(bands.high)}`,
      note:
        expected == null
          ? undefined
          : passes
            ? `bestätigt ${type} (${BAND_LABEL[expected]}-Anteil ausreichend)`
            : `weicht von der IF-Einstufung ab — ${BAND_LABEL[expected]}-Anteil geringer als erwartet`,
    });
    // Bewusst UNEINGESCHRÄNKT, auch nach einem Block-Upgrade (Korrektur
    // 30.07.2026 — ein erster Entwurf hat die Zonenverteilung nach einem
    // Block-Upgrade übergangen und die Konfidenz fest auf "hoch" belassen;
    // das hätte einen echten Signal-Widerspruch — Block sagt X, Zonenzeit
    // widerspricht X — unsichtbar gemacht. Wenn Block UND Zonenverteilung
    // übereinstimmen, bleibt es "hoch"; widersprechen sie sich, ist "mittel"
    // die ehrlichere Aussage als eine erzwungene hohe Konfidenz.
    if (expected != null) confidence = passes ? "hoch" : "mittel";
  }

  if (durMin != null && durMin < C.shortRideConfidenceMin && rule !== "ftp-test") {
    confidence = "niedrig";
    const durSignal = signals.find((s) => s.label === "Dauer");
    durSignal.note = [durSignal.note, `unter ${C.shortRideConfidenceMin} min — Einstufung unsicher`]
      .filter(Boolean)
      .join(" · ");
  }

  return { type, confidence, signals, rule };
}
