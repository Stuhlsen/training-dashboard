/* ============================================================
   SCRIPTS/BACKTEST-LADDER.JS — Fortschreibungsregel als Trockenlauf (D4a)
   Referenz: docs/konzept-progressionssteuerung.md C3, Fenster-D-Auftrag
   Schritt D4a ("STOPP vor Commit: Trockenlauf vorlegen").

   REINER LESE-/DIAGNOSE-LAUF. Schreibt NICHTS — weder nach Supabase noch
   in eine lokale Datei. Simuliert core/ladder-progression.js über die
   Ist-Fahrten der letzten LOOKBACK_WEEKS Wochen aus data/rides.json/
   rides-2.json (bereits von Fenster C mit `ride.compliance` versehen —
   keine Neuberechnung, kein Supabase-Zugriff nötig, läuft ohne .env).

   NICHT Teil von sync-data.yml/generate-data.js/npm run sync — nur lokal,
   manuell: `node scripts/backtest-ladder.js` (optional `--weeks=12`).

   Vereinfachungen (Backtest-spezifisch, nicht Teil der späteren scharfen
   Logik — im Bericht als "selbst entschieden" gekennzeichnet):
   - Format-Zuordnung je Karte ist eine Heuristik aus `ride.typ`/`ride.if`
     gegen die sechs Startformate (D1) — Karten hatten zum Zeitpunkt der
     Fahrt noch kein `format_id` (das gibt es erst ab diesem Fenster).
     `VO2max` wird mangels Unterscheidungsmerkmal auf `vo2-long` gemappt
     (V-K/V-L-Struktur ist aus reinen Ist-Fahrt-Kennzahlen nicht
     rekonstruierbar) — `over-under`/`sprint-accessory` werden aus
     Ist-Fahrt-Daten nicht erkannt (kein eigener `typ`-Wert dafür).
   - Governor-Level nutzt NUR den objektiven Readiness-Anteil
     (core/readiness.js::assessReadiness → briefing.js::readinessSignal),
     nicht die volle Governor-Mischung aus core/briefing.js::buildBriefing
     (die braucht subjektive Check-ins, die nicht in data/rides.json
     stehen, sondern nur live in Supabase — für den Trockenlauf degradiert
     das geräuschlos auf "kein Governor-Signal", genau wie der Rest des
     Dashboards bei fehlender HRV-Baseline).
   - "Projizierte CTL-Rampe der Folgewoche" wird rückblickend aus der
     TATSÄCHLICHEN CTL-Trajektorie (`ride.ctl`, von intervals.icu geliefert)
     bestimmt, nicht aus core/projection.js::projectLoad() (das braucht
     `plan_cards`, für einen historischen Rückblick nicht sinnvoll — die
     Projektion IST im Rückblick bereits die reale Entwicklung).
   - Erholungswochen kommen aus `plannedSessions` + `adjustments` (beide
     bereits in data/rides*.json enthalten), nachgebaut analog zum
     Merge-Muster in ui/planned.js — nicht 1:1 derselbe Code (der ist
     UI-Schicht), aber dieselbe Grundlogik (movedTo/cancelled anwenden).

   Erweiterung (Auftrag "Rückwirkende Strukturableitung für den Altbestand",
   Schritt 4): vor der bisherigen `evaluable`-Filterung wird `ride.compliance`
   jetzt in-memory NEU berechnet — `plan_cards`/`ftp_history` live laden
   (read-only, wie scripts/report-derived-workout-structure.js) und
   attachCompliance() auf der frisch aus der Datei gelesenen `rides`-Kopie
   aufrufen. Das deckt reale UND aus dem Freitext-Titel abgeleitete
   Strukturen ab (core/workout-structure-derive.js) — die bisherige
   Simulationslogik bleibt unverändert, nur ihre Eingabe wird reichhaltiger.
   Ohne gesetzte SUPABASE_*-Credentials bleibt das Verhalten wie zuvor:
   loadPlanCards()/loadFtpHistory() liefern `[]`, attachCompliance() findet
   dann keine Karte und überschreibt nichts — ein eventuell bereits aus einem
   früheren Sync-Lauf vorhandenes `ride.compliance` bleibt die einzige
   Quelle, genau wie vor dieser Erweiterung. Schreibt weiterhin NICHTS.
   ============================================================ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isoWeekKey } from "../assets/js/core/aggregate.js";
import { plannedRecoveryWeeks } from "../assets/js/core/plan-feedback.js";
import { assessReadiness } from "../assets/js/core/readiness.js";
import { readinessSignal } from "../assets/js/core/briefing.js";
import { evaluateLocks, nextStep } from "../assets/js/core/ladder-progression.js";
import { addDaysISO } from "../assets/js/core/format.js";
import { ENV } from "./lib/env.js";
import { loadPlanCards } from "./lib/plan-cards-fetch.js";
import { loadFtpHistory } from "./lib/ftp-history.js";
import { attachCompliance } from "./lib/compliance.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const weeksArg = process.argv.find((a) => a.startsWith("--weeks="));
const LOOKBACK_WEEKS = weeksArg ? Number(weeksArg.split("=")[1]) : 12;

const ATHLETES = [
  {
    id: "athlete1",
    file: "data/rides.json",
    email: ENV.SUPABASE_ATHLETE1_EMAIL,
    password: ENV.SUPABASE_ATHLETE1_PASSWORD,
    fallbackFtp: 193, // CONFIG.ftp, s. AGENTS.md "Athleten"
  },
  {
    id: "athlete2",
    file: "data/rides-2.json",
    email: ENV.SUPABASE_ATHLETE2_EMAIL,
    password: ENV.SUPABASE_ATHLETE2_PASSWORD,
    fallbackFtp: 265, // ATHLETE_2_FTP, s. AGENTS.md "Athleten"
  },
];

const intervalBlockCache = JSON.parse(readFileSync(path.join(ROOT, "data/interval-blocks.json"), "utf8"));

// Heuristische Zuordnung Ist-Typ → Startformat (D1). Nur die vier über
// ride.typ unterscheidbaren Zielsysteme — over-under/sprint-accessory
// haben keinen eigenen typ-Wert und werden hier nicht erkannt (s.
// Kopfkommentar).
const TYP_TO_FORMAT = {
  "Sweet Spot": "sweetspot-long",
  Schwelle: "threshold-long",
  VO2max: "vo2-long", // Vereinfachung, s. Kopfkommentar — vo2-short nicht unterscheidbar
};

function classifyFormat(ride) {
  return TYP_TO_FORMAT[ride.typ] ?? null;
}

/** plannedSessions + adjustments → {date, typ, cancelled}[] (vereinfachter
 *  Nachbau des ui/planned.js-Merges, s. Kopfkommentar). */
function mergePlannedCards(plannedSessions, adjustments) {
  return (plannedSessions || []).map((s) => {
    const adj = adjustments?.[s.date];
    if (!adj) return { date: s.date, typ: s.typ, cancelled: false };
    if (adj.cancelled) return { date: s.date, typ: s.typ, cancelled: true };
    if (adj.movedTo) return { date: adj.movedTo, typ: s.typ, cancelled: false };
    return { date: s.date, typ: s.typ, cancelled: false };
  });
}

/** Tatsächliche CTL-Rampe der auf `dateIso` folgenden 7 Tage, aus den
 *  ride.ctl-Werten (letzter Ist-Wert je Grenze) — Rückblick-Ersatz für
 *  core/projection.js::projectLoad() (s. Kopfkommentar).
 *  @returns {number|null} */
function actualNextWeekRamp(rides, dateIso) {
  const ctlAt = (targetIso) => {
    const before = rides.filter((r) => r.dateISO <= targetIso).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return before.length ? before[before.length - 1].ctl : null;
  };
  const start = ctlAt(dateIso);
  const end = ctlAt(addDaysISO(dateIso, 7));
  if (start == null || end == null) return null;
  return Math.round((end - start) * 10) / 10;
}

async function runAthlete({ id: athleteId, file, email, password, fallbackFtp }) {
  const raw = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
  // dateISO fehlt bei Athlet 2 im Rohformat (nur athlete1s Ausgabepfad
  // schreibt es bereits mit) — derselbe Fallback wie
  // core/normalize.js::normalizeRide ("const dateISO = r.dateISO || r.date").
  const rides = (raw.rides || []).map((r) => ({ ...r, dateISO: r.dateISO || r.date }));
  const wellness = raw.wellness || [];

  // Schritt 4 (Auftrag "Rückwirkende Strukturableitung"): ride.compliance
  // in-memory neu berechnen, inkl. Ableitungs-Fallback — s. Kopfkommentar.
  const planCards = await loadPlanCards({ email, password }, { fromDate: "2026-01-01" });
  const ftpHistory = await loadFtpHistory({ email, password });
  const activities = rides.map((r) => ({ id: r.activityId }));
  attachCompliance(rides, activities, planCards, intervalBlockCache, ftpHistory, fallbackFtp);
  const cards = mergePlannedCards(raw.plannedSessions, raw.adjustments);
  const recoveryWeeks = plannedRecoveryWeeks(cards);

  const anchor = rides.reduce((max, r) => (r.dateISO > max ? r.dateISO : max), "0000-00-00");
  const windowStart = addDaysISO(anchor, -7 * LOOKBACK_WEEKS);

  const evaluable = rides
    .filter((r) => r.compliance && r.dateISO >= windowStart && r.dateISO <= anchor)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const rows = [];
  const stepByFormat = new Map(); // formatId -> aktuelle simulierte Stufe
  const upgradedWeekByFormat = new Map(); // formatId -> Set<isoWeek>

  for (const ride of evaluable) {
    const formatId = classifyFormat(ride);
    if (!formatId) {
      rows.push({
        date: ride.dateISO,
        format: `(nicht zuordenbar: typ="${ride.typ}")`,
        rating: ride.compliance.rating,
        rule: ride.compliance.rule,
        stepBefore: "–",
        stepAfter: "–",
        locked: "–",
        lockReasons: "",
        derived: ride.compliance.derived === true,
      });
      continue;
    }

    const week = isoWeekKey(ride.dateISO);
    const isRecoveryWeek = recoveryWeeks.has(week);
    const readiness = assessReadiness(wellness, ride.dateISO);
    const rSignal = readinessSignal(readiness);
    // Nur "alert" (objektiv rot) zählt als Governor-Sperre — "caution"/
    // "nodata" bleiben ungesperrt (dieselbe Asymmetrie wie im Live-Governor:
    // nur ein klares Rot bremst, s. core/briefing.js::governLevel).
    const governorLevel = rSignal.status === "alert" ? "red" : rSignal.status === "ok" ? "green" : null;
    const projectedRampCtl = actualNextWeekRamp(rides, ride.dateISO);

    const alreadyUpgradedThisWeek = upgradedWeekByFormat.get(formatId)?.has(week) ?? false;
    const locks = evaluateLocks({ isRecoveryWeek, governorLevel, projectedRampCtl, alreadyUpgradedThisWeek });
    const action = nextStep({ rating: ride.compliance.rating, rpe: ride.rpe ?? null, locked: locks.locked });

    const stepBefore = stepByFormat.get(formatId) ?? 1;
    const stepAfter = action === "up" ? stepBefore + 1 : action === "down" ? Math.max(1, stepBefore - 1) : stepBefore;
    stepByFormat.set(formatId, stepAfter);
    if (action === "up") {
      if (!upgradedWeekByFormat.has(formatId)) upgradedWeekByFormat.set(formatId, new Set());
      upgradedWeekByFormat.get(formatId).add(week);
    }

    rows.push({
      date: ride.dateISO,
      format: formatId,
      rating: ride.compliance.rating,
      rule: ride.compliance.rule,
      stepBefore,
      stepAfter,
      locked: locks.locked ? "ja" : "nein",
      lockReasons: locks.reasons.join(", "),
      derived: ride.compliance.derived === true,
    });
  }

  // Rampenschwelle 8 über ALLE Wochengrenzen im Fenster (nicht nur an
  // Compliance-Ereignissen) — Häufigkeitsangabe fürs Bericht.
  let rampChecks = 0;
  let rampOverThreshold = 0;
  for (let d = windowStart; d <= anchor; d = addDaysISO(d, 7)) {
    const ramp = actualNextWeekRamp(rides, d);
    if (ramp == null) continue;
    rampChecks++;
    if (ramp > 8) rampOverThreshold++;
  }

  return { athleteId, windowStart, anchor, rows, rampChecks, rampOverThreshold, recoveryWeeks: [...recoveryWeeks] };
}

function printReport(result) {
  console.log(`\n=== ${result.athleteId} — Trockenlauf ${result.windowStart} bis ${result.anchor} ===`);
  console.log(`Geplante Erholungswochen im Fenster: ${result.recoveryWeeks.join(", ") || "keine"}`);
  console.log(
    `Rampenschwelle (>8 Punkte) über ${result.rampChecks} Wochengrenzen im Fenster: ${result.rampOverThreshold}× überschritten`,
  );
  if (!result.rows.length) {
    console.log("Keine Fahrt mit ride.compliance im Betrachtungsfenster — nichts zu simulieren.");
    return;
  }
  console.log("\nDatum       | Format           | Ampel  | Regel                     | Stufe      | Sperre | Herkunft   | Gründe");
  console.log("-".repeat(125));
  for (const r of result.rows) {
    const stepCol = r.stepBefore === r.stepAfter ? `${r.stepBefore} → ${r.stepAfter} (halten)` : `${r.stepBefore} → ${r.stepAfter}`;
    const herkunft = r.derived ? "abgeleitet" : "echt";
    console.log(
      `${r.date}  | ${r.format.padEnd(16)} | ${r.rating.padEnd(6)} | ${(r.rule ?? "–").padEnd(25)} | ${stepCol.padEnd(10)} | ${r.locked.padEnd(6)} | ${herkunft.padEnd(10)} | ${r.lockReasons}`,
    );
  }
  const up = result.rows.filter((r) => r.stepAfter > r.stepBefore).length;
  const down = result.rows.filter((r) => r.stepAfter < r.stepBefore).length;
  const hold = result.rows.length - up - down;
  console.log(`\nHochgestuft: ${up} · gehalten: ${hold} · zurückgestuft: ${down}`);
  // Schritt 4: echte vs. abgeleitete Zeilen getrennt ausweisen.
  const derivedRows = result.rows.filter((r) => r.derived);
  const realRows = result.rows.length - derivedRows.length;
  console.log(`Echte Zeilen: ${realRows} · abgeleitete Zeilen: ${derivedRows.length}`);
}

for (const athlete of ATHLETES) {
  printReport(await runAthlete(athlete));
}
