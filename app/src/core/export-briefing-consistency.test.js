/* Tests: core/export-briefing.js — Drift-Schutz gegen echten Validator/Code

   Bis 2026-09-19 prüfte dieser Test zusätzlich PROMPT_RUMPF/AUFTRAG_VARIANTEN
   wörtlich gegen eine von Hand gepflegte Markdown-Kopie
   (docs/phase-4-prompt-vorlage-claude-trainer.md). Diese Kopie wurde von der
   App nie gelesen — CoachPanel.tsx baut den Prompt-Text ausschließlich aus
   PROMPT_RUMPF/AUFTRAG_VARIANTEN (buildExportText()) — und ist mit der Doku
   entfallen (reine Drift-Fehlerquelle ohne Laufzeit-Nutzen). Die verbleibenden
   Tests unten prüfen echten Code gegen echten Validator, unabhängig von jeder
   Doku-Datei, und bleiben unverändert wichtig. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  PROMPT_RUMPF,
  AUFTRAG_VARIANTEN,
  AUFTRAG_VARIANTEN_RUNNING,
  buildBriefingMarkdown,
} from "./export-briefing.js";
import { validateWorkoutStructure, WORKOUT_STEP_KINDS } from "./workout-validator.js";
import { validateProposal } from "./proposal-validator.js";
import { presetAction } from "./ladder-progression.js";

test("Alle fünf Presets aus AUFTRAG_VARIANTEN sind vertreten — kein fehlender/zusätzlicher Schlüssel", () => {
  assert.deepEqual(Object.keys(AUFTRAG_VARIANTEN).sort(), ["build", "check", "event", "general", "reduce"]);
});

test("Rumpf enthält den R7-Hinweis (Zusatzkontext darf nie in reason auftauchen)", () => {
  assert.match(
    PROMPT_RUMPF,
    /Zusatzkontext des Athleten darf deine Entscheidung beeinflussen, aber niemals\s+in `reason` auftauchen/,
  );
});

test("Alle fünf Presets aus AUFTRAG_VARIANTEN_RUNNING sind vertreten — kein fehlender/zusätzlicher Schlüssel", () => {
  assert.deepEqual(Object.keys(AUFTRAG_VARIANTEN_RUNNING).sort(), ["build", "check", "event", "general", "reduce"]);
});

/* ── E2 Schritt 2: workout_structure — Schema-Drift-Schutz ──────────────
   Die bisherigen Tests oben stellen nur sicher, dass Vorlage und Doku
   UNTEREINANDER konsistent sind (reiner Textvergleich). Das schützt nicht
   vor der Drift, die Schritt 12 im Konzept eigentlich verhindern soll:
   Vorlage beschreibt ein Feld/Schema, aber core/workout-validator.js bzw.
   core/proposal-validator.js akzeptieren/verlangen inzwischen etwas
   anderes. Die folgenden Tests extrahieren die ```json-Beispiele direkt
   aus PROMPT_RUMPF und lassen sie vom ECHTEN Validator laufen — driftet
   der Validator, ohne dass die Vorlage nachzieht, schlägt das hier fehl,
   nicht erst beim nächsten Trainer-Chat-Fehlversuch. */

const promptJsonExamples = [...PROMPT_RUMPF.matchAll(/```json\n([\s\S]*?)\n\s*```/g)].map((m) => JSON.parse(m[1]));

test("workout_structure: alle drei dokumentierten Schrittarten (set/alternating/accessory) bestehen den echten Validator", () => {
  const stepExamples = promptJsonExamples.filter((b) => typeof b.kind === "string");
  assert.deepEqual(
    stepExamples.map((s) => s.kind).sort(),
    ["accessory", "alternating", "set"],
    "die Vorlage muss genau ein eigenständiges Beispiel je komplexer Schrittart zeigen",
  );
  for (const step of stepExamples) {
    const result = validateWorkoutStructure({ version: 1, steps: [step] });
    assert.deepEqual(result.errors, [], `Schrittart '${step.kind}' aus der Vorlage ist laut Validator ungültig`);
    assert.equal(result.valid, true);
  }
});

test("workout_structure: das eingebettete replace-Beispiel (workout + workout_structure gemeinsam) besteht den echten Validator", () => {
  const replaceExample = promptJsonExamples.find((b) => b.op === "replace");
  assert.ok(replaceExample?.payload?.workout_structure, "Vorlage muss ein replace-Beispiel mit workout_structure zeigen");
  const result = validateWorkoutStructure(replaceExample.payload.workout_structure);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("workout_structure: jede in core/workout-validator.js bekannte Schrittart taucht in der Vorlage als Feldname (`kind`) auf", () => {
  // Drift-Fall: eine neue Schrittart wird im Validator ergänzt, aber die
  // Vorlage nie nachgezogen — Claude kann sie dann nie benutzen.
  for (const kind of WORKOUT_STEP_KINDS) {
    assert.match(PROMPT_RUMPF, new RegExp("`" + kind + "`"), `Schrittart '${kind}' fehlt in der Vorlage`);
  }
});

test("workout_structure: payload.workout_structure ist laut echtem Validator nur bei add/replace erlaubt, wie die Vorlage behauptet", () => {
  const baseStructure = { version: 1, steps: [{ kind: "steady", duration_s: 600, target_pct_ftp: 60 }] };
  for (const op of ["add", "replace"]) {
    const proposal = {
      op,
      target_card_id: op === "add" ? null : "card-1",
      target_updated_at: op === "add" ? null : "2026-01-01T00:00:00Z",
      reason: "Test",
      payload: op === "add" ? { title: "x", plan_date: "2099-01-01", workout_structure: baseStructure } : { workout_structure: baseStructure },
    };
    const { errors } = validateProposal(proposal, { knownCardIds: new Set(["card-1"]), today: "2026-01-01" });
    assert.ok(
      !errors.some((e) => e.includes("workout_structure")),
      `'${op}' sollte workout_structure ohne Feldfehler akzeptieren, bekam: ${errors.join("; ")}`,
    );
  }
  for (const op of ["move", "cancel"]) {
    const proposal = {
      op,
      target_card_id: "card-1",
      target_updated_at: "2026-01-01T00:00:00Z",
      reason: "Test",
      payload: op === "move" ? { plan_date: "2099-01-01", workout_structure: baseStructure } : { reason: "x", workout_structure: baseStructure },
    };
    const { errors } = validateProposal(proposal, { knownCardIds: new Set(["card-1"]), today: "2026-01-01" });
    assert.ok(
      errors.some((e) => e.includes("workout_structure")),
      `'${op}' sollte workout_structure als unbekanntes Feld ablehnen (Vorlage: "move/cancel kennen keins von beiden")`,
    );
  }
});

/* ── E2 Schritt 2: Leiterstand/Stufenvorschlag — Briefing-Output-Drift ── */

test("Leiterstand: evidence_grade-Beispielwerte aus der Vorlage rendern tatsächlich wie im Briefing beschrieben", () => {
  const md = buildBriefingMarkdown({
    athleteId: "x",
    ladderState: [
      { summary: "Sweet Spot lang · Stufe S3 (3×15)", evidenceGrade: "studienlage", neighbors: { prev: null, next: null } },
      { summary: "Over-Under · Stufe OU2", evidenceGrade: "coaching-konsens", neighbors: { prev: null, next: null } },
    ],
  });
  assert.match(md, /\(studienlage\)/);
  assert.match(md, /\(coaching-konsens\)/);
  // dieselben zwei Werte muss die Vorlage selbst nennen (Rumpf-Absatz "Leiterstand und Stufenvorschlag")
  assert.match(PROMPT_RUMPF, /`studienlage`/);
  assert.match(PROMPT_RUMPF, /`coaching-konsens`/);
});

test("Stufenvorschlag: alle vier Aktionslabels aus der Vorlage (hochstufen/zurückstufen/halten/eingefroren) stehen exakt so im Briefing-Output", () => {
  const md = buildBriefingMarkdown({
    athleteId: "x",
    presetSuggestions: [
      { formatId: "f-up", label: "Format hoch", step: 4, action: "up", inTaper: false },
      { formatId: "f-down", label: "Format runter", step: 2, action: "down", inTaper: false },
      { formatId: "f-hold", label: "Format halten", step: 3, action: "hold", inTaper: false },
      { formatId: "f-taper", label: "Format Taper", step: 3, action: "hold", inTaper: true },
    ],
  });
  assert.match(md, /## Stufenvorschlag/);
  assert.match(md, /- Format hoch: Stufe 4 → hochstufen/);
  assert.match(md, /- Format runter: Stufe 2 → zurückstufen/);
  assert.match(md, /- Format halten: Stufe 3 → halten/);
  assert.match(md, /- Format Taper: Stufe 3 → eingefroren \(Taper\)/);
  // dieselben Labels muss die Vorlage (Rumpf-Absatz) nennen, sonst kennt
  // Claude die Bedeutung der Zeilen im Briefing nicht.
  for (const label of ["`hochstufen`", "`zurückstufen`", "`halten`"]) {
    assert.ok(PROMPT_RUMPF.includes(label), `Vorlage muss ${label} erwähnen`);
  }
  assert.match(PROMPT_RUMPF, /eingefroren/);
});

test("Ohne presetSuggestions erscheint kein '## Stufenvorschlag'-Abschnitt (deckt sich mit dem Freigabe-Hinweis in der Vorlage)", () => {
  const md = buildBriefingMarkdown({ athleteId: "x" });
  assert.doesNotMatch(md, /## Stufenvorschlag/);
});

/* ── E2 Schritt 2: Preset-Aktionsergebnisse (C4) — Drift-Schutz ─────────
   Prüft core/ladder-progression.js::presetAction() gegen genau die
   Zeilen der C4-Tabelle (docs/konzept-progressionssteuerung.md), auf die
   sich die neuen Sätze in den fünf AUFTRAG_VARIANTEN stützen. */

test("presetAction: 'build' → Stufe+1/up ohne Sperre, 'hold' bei Sperre (Vorlage general/build-Text)", () => {
  assert.deepEqual(presetAction("build", { currentStep: 3, locked: false }), { step: 4, action: "up" });
  assert.deepEqual(presetAction("build", { currentStep: 3, locked: true }), { step: 3, action: "hold" });
});

test("presetAction: 'reduce' → immer Stufe-1/down MIT lockWeeks:2 (Vorlage reduce-Text)", () => {
  const result = presetAction("reduce", { currentStep: 3 });
  assert.equal(result.action, "down");
  assert.equal(result.step, 2);
  assert.equal(result.lockWeeks, 2);
});

test("presetAction: 'check' → immer hold, unabhängig von rating (Vorlage check-Text: 'Stufenvorschlag steht ohnehin auf halten')", () => {
  assert.deepEqual(presetAction("check", { currentStep: 5, rating: "green" }), { step: 5, action: "hold" });
  assert.deepEqual(presetAction("check", { currentStep: 5, rating: "red" }), { step: 5, action: "hold" });
});

test("presetAction: 'event' → hold im Taper (unabhängig vom rating), sonst wie 'general' aus der Ampel (Vorlage event-Text)", () => {
  assert.deepEqual(presetAction("event", { currentStep: 3, rating: "green", inTaper: true }), { step: 3, action: "hold" });
  assert.deepEqual(presetAction("event", { currentStep: 3, rating: "green", inTaper: false }), { step: 4, action: "up" });
  assert.deepEqual(presetAction("event", { currentStep: 3, rating: "red", inTaper: false }), { step: 2, action: "down" });
});

test("presetAction: 'general' folgt der Ampel (grün→up/gelb→hold/rot→down), Trainer darf laut Vorlage abweichen (Vorlage general-Text)", () => {
  assert.deepEqual(presetAction("general", { currentStep: 3, rating: "green" }), { step: 4, action: "up" });
  assert.deepEqual(presetAction("general", { currentStep: 3, rating: "yellow" }), { step: 3, action: "hold" });
  assert.deepEqual(presetAction("general", { currentStep: 3, rating: "red" }), { step: 2, action: "down" });
});
