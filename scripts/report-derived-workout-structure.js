/* ============================================================
   SCRIPTS/REPORT-DERIVED-WORKOUT-STRUCTURE.JS — Schritt-3-Report
   (Auftrag "Rückwirkende Strukturableitung für den Altbestand")

   REINER LESE-/DIAGNOSE-LAUF. Schreibt NICHTS — weder nach Supabase noch in
   eine lokale Datei. Lädt `plan_cards` (beide Athleten, read-only über
   scripts/lib/plan-cards-fetch.js) + `ftp_history` (read-only über
   scripts/lib/ftp-history.js), liest data/rides*.json/interval-blocks.json
   von der Platte, und ruft scripts/lib/compliance.js::attachCompliance() auf
   einer FRISCH aus der Datei gelesenen Kopie von `rides` auf — die Mutation
   bleibt in-memory, es wird nichts zurückgeschrieben.

   Zwei Fragen (Schritt 3 des Auftrags):
   (a) reine Parser-Trefferquote — core/workout-structure-derive.js gegen
       den Freitext-Titel JEDER intensitätstragenden Karte OHNE echte
       workout_structure, unabhängig davon, ob schon eine Ist-Fahrt existiert
   (b) wie viele dieser Karten bekommen DADURCH zusätzlich eine echte
       Compliance-Auswertung (gematchte Ist-Fahrt + Segmente im Cache)?
       — das ist rides.filter(r => r.compliance?.derived === true).length

   "Intensitätstragend" = core/plan-config.js::INTENSITY_CLASS-Kategorie
   "hart" auf Basis von Wiederholungsstruktur (Sweet Spot/Schwelle/VO2max) —
   NICHT "FTP-Test"/"Rennen"/"Etappe" (keine N×M-Intervallstruktur im
   Freitext) und NICHT "NLS" (in INTENSITY_CLASS explizit "locker" —
   Nachtlangstrecke, kein Intervalltyp, s. dortiger Kommentar).

   Manuell: `node scripts/report-derived-workout-structure.js`.
   ============================================================ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ENV } from "./lib/env.js";
import { loadPlanCards } from "./lib/plan-cards-fetch.js";
import { loadFtpHistory } from "./lib/ftp-history.js";
import { attachCompliance } from "./lib/compliance.js";
import { deriveWorkoutStructure } from "../assets/js/core/workout-structure-derive.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INTENSITY_TYPES = ["Sweet Spot", "Schwelle", "VO2max"];

const ATHLETES = [
  {
    id: "athlete1",
    ridesFile: "data/rides.json",
    email: ENV.SUPABASE_ATHLETE1_EMAIL,
    password: ENV.SUPABASE_ATHLETE1_PASSWORD,
    fallbackFtp: 193, // CONFIG.ftp, s. AGENTS.md "Athleten"
  },
  {
    id: "athlete2",
    ridesFile: "data/rides-2.json",
    email: ENV.SUPABASE_ATHLETE2_EMAIL,
    password: ENV.SUPABASE_ATHLETE2_PASSWORD,
    fallbackFtp: 265, // ATHLETE_2_FTP, s. AGENTS.md "Athleten"
  },
];

const blocksPath = path.join(ROOT, "data/interval-blocks.json");
const intervalBlockCache = JSON.parse(readFileSync(blocksPath, "utf8"));

async function runAthlete(athlete) {
  const cards = await loadPlanCards({ email: athlete.email, password: athlete.password }, { fromDate: "2026-01-01" });
  if (!cards.length) {
    console.log(`\n=== ${athlete.id} — keine plan_cards geladen (Credentials/Netzwerk?) — übersprungen ===`);
    return null;
  }
  const ftpHistory = await loadFtpHistory({ email: athlete.email, password: athlete.password });

  const raw = JSON.parse(readFileSync(path.join(ROOT, athlete.ridesFile), "utf8"));
  const rides = raw.rides || [];

  const intensityCards = cards.filter((c) => INTENSITY_TYPES.includes(c.typ) && c.status !== "ausgefallen");
  const withRealStructure = intensityCards.filter((c) => c.workoutStructure);
  const withoutStructure = intensityCards.filter((c) => !c.workoutStructure);
  const derivedAttempts = withoutStructure.map((c) => ({ card: c, result: deriveWorkoutStructure(c.name) }));
  const parsable = derivedAttempts.filter((a) => a.result);
  const unparsable = derivedAttempts.filter((a) => !a.result);

  // (b) — attachCompliance() mutiert `rides` in-memory (Karten/Segmente/FTP
  // wie beim echten Sync), nichts wird auf Platte zurückgeschrieben.
  const activities = rides.map((r) => ({ id: r.activityId }));
  attachCompliance(rides, activities, cards, intervalBlockCache, ftpHistory, athlete.fallbackFtp);
  const derivedMatches = rides.filter((r) => r.compliance?.derived === true);

  return {
    athleteId: athlete.id,
    totalIntensity: intensityCards.length,
    withRealStructure: withRealStructure.length,
    withoutStructure: withoutStructure.length,
    parsable: parsable.length,
    unparsable,
    examples: parsable,
    derivedMatches,
  };
}

function printReport(result) {
  if (!result) return;
  console.log(`\n=== ${result.athleteId} ===`);
  console.log(`Intensitätstragende Karten (Sweet Spot/Schwelle/VO2max, nicht ausgefallen): ${result.totalIntensity}`);
  console.log(`  davon bereits mit echter workout_structure: ${result.withRealStructure}`);
  console.log(`  davon ohne Struktur: ${result.withoutStructure}`);
  console.log(`    → per Freitext-Titel parsebar: ${result.parsable} / ${result.withoutStructure}`);
  if (result.unparsable.length) {
    console.log(`    → NICHT parsebar (${result.unparsable.length}): ${result.unparsable.map((a) => `"${a.card.name}"`).join(", ")}`);
  }
  console.log(`  Trefferquote gesamt (echte + abgeleitete Struktur / alle intensitätstragenden Karten): ${result.withRealStructure + result.parsable} / ${result.totalIntensity}`);
  console.log(`  Karten, die DADURCH zusätzlich eine echte Compliance-Auswertung (Ist-Fahrt + Segmente) bekommen: ${result.derivedMatches.length}`);
}

function printExamples(results) {
  const allExamples = results.filter(Boolean).flatMap((r) => r.examples.map((e) => ({ athleteId: r.athleteId, ...e })));
  const sample = allExamples.slice(0, 10);
  console.log(`\n=== 10 Beispiele: Freitext → abgeleitete Struktur (von ${allExamples.length} parsebaren) ===`);
  for (const ex of sample) {
    console.log(`\n[${ex.athleteId}] "${ex.card.name}" (${ex.card.date})`);
    console.log(JSON.stringify(ex.result.structure));
  }
}

const results = [];
for (const athlete of ATHLETES) {
  results.push(await runAthlete(athlete));
}
for (const r of results) printReport(r);
printExamples(results);

const totalIntensity = results.filter(Boolean).reduce((s, r) => s + r.totalIntensity, 0);
const totalCovered = results.filter(Boolean).reduce((s, r) => s + r.withRealStructure + r.parsable, 0);
const totalNewMatches = results.filter(Boolean).reduce((s, r) => s + r.derivedMatches.length, 0);
console.log(`\n=== Gesamt ===`);
console.log(`Trefferquote: ${totalCovered} / ${totalIntensity} (${totalIntensity ? Math.round((totalCovered / totalIntensity) * 1000) / 10 : 0}%)`);
console.log(`Zusätzlich bewertbare Karten (neue Compliance dank Ableitung): ${totalNewMatches}`);
