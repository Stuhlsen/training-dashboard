/* ============================================================
   SCRIPTS/PRESET-SUGGESTION-CHECK.JS — Lese-Verifikation (D4b, Schritt 3)
   Referenz: docs/konzept-progressionssteuerung.md C3/C4, Auftrag
   "D4b — Preset-Umstellung, scharf geschaltet nur für Athlet 1".

   REINER LESE-/DIAGNOSE-LAUF. Schreibt NICHTS — weder nach Supabase noch
   in eine lokale Datei, kein .env/Supabase-Zugriff nötig (bewusst
   unabhängig von der aktuell noch nicht committeten Baustelle in
   scripts/backtest-ladder.js, die live gegen plan_cards/ftp_history läuft
   — hier reicht das bereits committete data/rides.json).

   Simuliert core/ladder-progression.js::evaluateLocks/nextStep über die
   Ist-Fahrten mit `ride.compliance` aus data/rides.json (dieselbe
   Typ-Heuristik wie backtest-ladder.js — Backtest-spezifisch, s. dortiger
   Kopfkommentar), ermittelt daraus die aktuell simulierte Leiterstufe für
   `sweetspot-long`/`threshold-long` und wendet presetAction() (C4) für
   jedes der fünf Export-Presets auf die nächste anstehende Sweet-Spot-
   bzw. Schwelle-Karte an. Zeigt zusätzlich, dass ohne Freigabe (Migration
   0016 NICHT angewendet — aktueller Ist-Zustand für BEIDE Athleten) der
   Gate-Wrapper state/ladder.js::getPresetSuggestion() auf reinen
   Beobachtungsmodus fällt (Negativtest, s. tests/ladder-preset-suggestion.test.js
   für die vollständige, per mock.module() abgesicherte Variante).

   Nur lokal, manuell: `node scripts/preset-suggestion-check.js`.
   ============================================================ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { evaluateLocks, nextStep, presetAction } from "./lib/core/ladder-progression.js";
import { localISODate } from "./lib/core/format.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = localISODate();

// Dieselbe Backtest-Heuristik wie scripts/backtest-ladder.js (Kopfkommentar
// dort: "Karten hatten zum Zeitpunkt der Fahrt noch kein format_id" — hier
// lokal dupliziert statt importiert, weil diese Quelle nicht committet ist).
const TYP_TO_FORMAT = { "Sweet Spot": "sweetspot-long", Schwelle: "threshold-long" };

function currentStepFromHistory(rides, formatId) {
  const matching = rides
    .filter((r) => r.compliance && TYP_TO_FORMAT[r.typ] === formatId)
    .sort((a, b) => (a.dateISO || a.date).localeCompare(b.dateISO || b.date));
  let step = 1;
  for (const r of matching) {
    const locks = evaluateLocks(); // Governor/Rampe/Erholungswoche hier bewusst nicht
    // nachgebaut (das ist backtest-ladder.js' Aufgabe) — reicht für die
    // Stufen-Demonstration, da keine der drei Sperren am einzigen Datenpunkt hängt.
    const action = nextStep({ rating: r.compliance.rating, rpe: r.rpe ?? null, locked: locks.locked });
    step = action === "up" ? step + 1 : action === "down" ? Math.max(1, step - 1) : step;
  }
  return { step, lastRating: matching.length ? matching[matching.length - 1].compliance.rating : null, n: matching.length };
}

function nextUpcomingCard(plannedSessions, typ) {
  return (plannedSessions || [])
    .filter((s) => s.date >= today && s.typ === typ)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

const PRESETS = ["general", "event", "check", "reduce", "build"];

function printFormat(rides, plannedSessions, formatId, typ) {
  const { step, lastRating, n } = currentStepFromHistory(rides, formatId);
  const card = nextUpcomingCard(plannedSessions, typ);
  console.log(`\n--- ${formatId} (aus ${n} gematchten Ist-Fahrt(en), letzte Ampel: ${lastRating ?? "keine"}) ---`);
  console.log(`Aktuelle simulierte Stufe: ${step}`);
  console.log(`Nächste anstehende ${typ}-Karte: ${card ? `${card.date} „${card.name}"` : "keine im Plan gefunden"}`);
  for (const preset of PRESETS) {
    // "general"/"event" ohne jede Ist-Fahrt (n===0) würden sonst auf den
    // irreführenden nextStep()-Default ("up" bei rating=null) laufen —
    // hier bewusst als "keine Ist-Daten" ausgewiesen statt eine Stufe
    // vorzutäuschen, die aus null Beobachtungen stammt.
    if ((preset === "general" || preset === "event") && n === 0) {
      console.log(`  Preset ${preset.padEnd(8)}: keine Ist-Daten für dieses Format -> kein Vorschlag ableitbar`);
      continue;
    }
    const suggestion = presetAction(preset, { currentStep: step, rating: lastRating, rpe: null, locked: false });
    console.log(
      `  Preset ${preset.padEnd(8)}: Stufe ${step} -> ${suggestion.step} (${suggestion.action}${suggestion.lockWeeks ? `, Sperre ${suggestion.lockWeeks} Wochen` : ""})`,
    );
  }
}

const raw = JSON.parse(readFileSync(path.join(ROOT, "data/rides.json"), "utf8"));
const rides = (raw.rides || []).map((r) => ({ ...r, dateISO: r.dateISO || r.date }));

console.log(`=== D4b Preset-Vorschlag (nur lesend) — Athlet 1, Stand ${today} ===`);
printFormat(rides, raw.plannedSessions, "sweetspot-long", "Sweet Spot");
printFormat(rides, raw.plannedSessions, "threshold-long", "Schwelle");

console.log(`\n=== Negativtest Athlet 2 ===`);
console.log(
  "Migration 0016 ist NICHT gegen dashboard-dev/prod angewendet — profiles.ladder_progression_enabled",
);
console.log(
  "existiert dort noch nicht, ist also fuer BEIDE Athleten faktisch 'aus'. state/ladder.js::getPresetSuggestion()",
);
console.log(
  "prueft dieses Feld VOR jedem Vorschlag (s. Quelltext) und liefert bei fehlender/false Freigabe immer",
);
console.log(
  "{ enabled: false, suggestion: null } -- der vollstaendige, per mock.module() abgesicherte Nachweis dafuer",
);
console.log("steht in tests/ladder-preset-suggestion.test.js (Faelle 'Freigabe false' und 'nicht eingeloggt').");
