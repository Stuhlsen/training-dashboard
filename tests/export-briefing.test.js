/* Tests: core/export-briefing.js — Briefing-Markdown + Prompt-Vorlage
   (Phase 4, Export/Import-Workflow-Konzept §2, Vorschlags-Schema-Konzept §6).
   Reine Funktionen, keine Mocks nötig.

   Die letzten beiden Tests sind die in der Prompt-Vorlage selbst geforderte
   Fixture-Idee (docs/phase-4-prompt-vorlage-claude-trainer.md, Anmerkungen):
   ein Beispiel-Briefing + ein erwartetes gültiges Antwort-JSON als
   Regressionsbasis, hier durch den echten Validator geprüft statt nur
   auf String-Enthalten-Sein. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBriefingMarkdown,
  buildExportText,
  exportFileName,
  PROMPT_TEMPLATE,
  SCHEMA_VERSION,
} from "../assets/js/core/export-briefing.js";
import { validateImport } from "../assets/js/core/proposal-validator.js";

const CTX = {
  athleteId: "athlete-A-uuid",
  displayName: "Stuhlsen",
  ftp: 193,
  ftpGoal: 210,
  dataSources: ["intervals.icu", "Apple Health"],
  events: [{ eventDate: "2026-08-30", title: "GFNY Bremen", type: "race", priority: "A" }],
  planCards: [
    { id: "card-1", date: "2026-07-28", name: "Sweet-Spot 2×15", typ: "Sweet Spot", tssPlanned: 65, updatedAt: "2026-07-20T00:00:00Z" },
  ],
  actuals: [{ dateISO: "2026-07-20", typ: "Z2 Dauer", tss: 60, rpe: 4, feelIcu: 3 }],
  wellbeing: [{ date: "2026-07-23", energy: 4, muscleFeel: 3, mood: 4, note: "Kopf dicht" }],
  projection: {
    asOf: "2026-07-24",
    startCtl: 55.2,
    startAtl: 48.1,
    days: [
      { date: "2026-07-24", ctl: 55.2, atl: 48.1, tsb: 7.1 },
      { date: "2026-08-30", ctl: 60, atl: 40, tsb: 20 },
    ],
  },
  conflicts: [{ rule: "K-TSB", severity: "warning", message: "TSB fällt am 25.07. auf -32" }],
  today: "2026-07-24",
};

test("buildBriefingMarkdown: enthält Profil, Events, Plan (mit Karten-ID), Form, Konflikte", () => {
  const md = buildBriefingMarkdown(CTX);
  assert.match(md, /# Trainings-Briefing — Stuhlsen/);
  assert.match(md, /FTP: 193 W \(Ziel: 210 W\)/);
  assert.match(md, /GFNY Bremen/);
  assert.match(md, /card-1/);
  assert.match(md, /Sweet-Spot 2×15/);
  assert.match(md, /K-TSB/);
});

test("buildBriefingMarkdown: JSON-Anhang trägt schema_version, athlete und Karten-IDs", () => {
  const md = buildBriefingMarkdown(CTX);
  const jsonBlock = md.match(/```json\n([\s\S]*?)\n```/)[1];
  const parsed = JSON.parse(jsonBlock);
  assert.equal(parsed.schema_version, SCHEMA_VERSION);
  assert.equal(parsed.athlete, "athlete-A-uuid");
  assert.equal(parsed.cards[0].id, "card-1");
  assert.equal(parsed.cards[0].updated_at, "2026-07-20T00:00:00Z");
});

test("buildBriefingMarkdown: leere Eingaben crashen nicht, zeigen Leer-Hinweise", () => {
  const md = buildBriefingMarkdown({ athleteId: "x" });
  assert.match(md, /Keine Events erfasst/);
  assert.match(md, /Keine geplanten Karten im Horizont/);
  assert.match(md, /Keine Fahrten im Zeitraum/);
  assert.match(md, /Keine Check-ins im Zeitraum/);
  assert.match(md, /Keine\./); // Konflikte
});

test("buildExportText: setzt das Briefing an der {{BRIEFING}}-Stelle der festen Vorlage ein", () => {
  const text = buildExportText(CTX);
  assert.ok(text.startsWith("Du bist mein Radsport-Trainer."));
  assert.match(text, /# Trainings-Briefing — Stuhlsen/);
  assert.doesNotMatch(text, /\{\{BRIEFING\}\}/);
  assert.ok(!PROMPT_TEMPLATE.includes(text)); // Platzhalter wurde tatsächlich ersetzt
});

test("exportFileName: fester Name aus AthletenId + Datum", () => {
  assert.equal(exportFileName("athlete1", "2026-07-24"), "claude-briefing-athlete1-2026-07-24.md");
});

test("Fixture: Beispiel-Briefing + erwartetes gültiges Antwort-JSON besteht den echten Validator", () => {
  const md = buildBriefingMarkdown(CTX);
  assert.match(md, /card-1/); // Karten-ID muss im Briefing stehen, damit Claude sie übernehmen kann

  // Simuliert Claudes Antwort: übernimmt target_card_id/target_updated_at
  // unverändert aus dem Briefing (Prompt-Vorlage-Regel).
  const claudeResponse = {
    schema_version: SCHEMA_VERSION,
    athlete: CTX.athleteId,
    source: "claude",
    proposals: [
      {
        op: "replace",
        target_card_id: "card-1",
        target_updated_at: "2026-07-20T00:00:00Z",
        reason: "TSB fällt vor GFNY unter -30 — Einheit entschärfen",
        payload: { title: "Sweet-Spot 2×10", type: "Sweet Spot", plan_date: "2026-07-28", target_tss: 45 },
      },
    ],
  };
  const result = validateImport(claudeResponse, {
    ownAthleteId: CTX.athleteId,
    knownCardIds: new Set(["card-1"]),
    today: CTX.today,
  });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].errors, []);
  assert.equal(result.results[0].valid, true);
});

test("Fixture: 'keine Änderung' — leere proposals-Liste ist ein gültiger Import", () => {
  const claudeResponse = { schema_version: SCHEMA_VERSION, athlete: CTX.athleteId, source: "claude", proposals: [] };
  const result = validateImport(claudeResponse, { ownAthleteId: CTX.athleteId, today: CTX.today });
  assert.equal(result.ok, true);
  assert.deepEqual(result.results, []);
});
