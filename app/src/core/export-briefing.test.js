/* Tests: core/export-briefing.js — Briefing-Markdown + Prompt-Vorlage
   (Phase 4, Export/Import-Workflow-Konzept §2, Vorschlags-Schema-Konzept §6).
   Reine Funktionen, keine Mocks nötig.

   Die letzten beiden Tests sind die in der Prompt-Vorlage selbst geforderte
   Fixture-Idee (docs/phase-4-prompt-vorlage-claude-trainer.md, Anmerkungen):
   ein Beispiel-Briefing + ein erwartetes gültiges Antwort-JSON als
   Regressionsbasis, hier durch den echten Validator geprüft statt nur
   auf String-Enthalten-Sein. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  buildBriefingMarkdown,
  buildExportText,
  exportFileName,
  PROMPT_RUMPF,
  SCHEMA_VERSION,
  EXTRA_CONTEXT_MAX_LENGTH,
} from "./export-briefing.js";
import { validateImport } from "./proposal-validator.js";

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

test("buildBriefingMarkdown: 'Heute' zeigt immer todayIso, auch wenn die Projektion einen älteren Anker (asOf) hat", () => {
  // Regressionstest für einen per Nachtest gefundenen Bug: projection.asOf ist
  // der Anker (letzte Fahrt mit TSB-Signal, core/pmc.js::currentPmc), NICHT
  // "heute" — startCtl/startAtl sind aber bereits bis todayIso fortgeschrieben.
  // Eine frühere Fassung zeigte "Heute (${projection.asOf})" und widersprach
  // damit dem "today"-Feld im selben JSON-Anhang (zehn Tage Differenz im
  // Live-Test). s. docs/offene-punkte.md.
  const staleCtx = {
    ...CTX,
    projection: { ...CTX.projection, asOf: "2026-07-14" },
  };
  const md = buildBriefingMarkdown(staleCtx);
  assert.match(md, /Heute \(2026-07-24\): CTL/);
  assert.doesNotMatch(md, /Heute \(2026-07-14\)/, "der alte Anker darf nie als 'Heute' beschriftet werden");
  assert.match(md, /Datenstand 2026-07-14, seither ohne neue Fahrt fortgeschrieben/);
});

test("buildBriefingMarkdown: kein Fortschreibungs-Hinweis, wenn der Anker mit heute übereinstimmt", () => {
  const md = buildBriefingMarkdown(CTX); // CTX.projection.asOf === CTX.today
  assert.match(md, /Heute \(2026-07-24\): CTL 55.2 · ATL 48.1$/m);
  assert.doesNotMatch(md, /fortgeschrieben/);
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
  assert.doesNotMatch(text, /\{\{AUFTRAG\}\}/);
  assert.ok(!PROMPT_RUMPF.includes(text)); // Platzhalter wurden tatsächlich ersetzt
});

test("buildExportText: general (Default, kein Options-Objekt) — bisheriges Verhalten unverändert", () => {
  const text = buildExportText(CTX);
  assert.match(text, /1\. Analysiere Form, Plan und Events\. Prüfe insbesondere:/);
});

test("buildExportText: preset 'check' entfernt die Vorschlagsaufforderung, verlangt aber weiterhin proposals: \\[\\]", () => {
  const text = buildExportText(CTX, { preset: "check" });
  assert.match(text, /Schlage in dieser Runde \*\*keine Änderungen\*\* vor/);
  assert.match(text, /"proposals": \[\]/);
  assert.doesNotMatch(text, /1\. Analysiere Form, Plan und Events\. Prüfe insbesondere:/);
});

test("buildExportText: preset 'reduce' und 'build' setzen jeweils ihre eigene Auftragsvariante ein", () => {
  const reduceText = buildExportText(CTX, { preset: "reduce" });
  assert.match(reduceText, /Fokus auf Entlastung/);
  const buildText = buildExportText(CTX, { preset: "build" });
  assert.match(buildText, /Fokus auf Belastungssteigerung/);
  assert.notEqual(reduceText, buildText);
});

test("buildExportText: preset 'event' setzt Titel/Datum des gewählten Events in den Auftragsblock ein", () => {
  const text = buildExportText(CTX, {
    preset: "event",
    event: { title: "GFNY Bremen", eventDate: "2026-08-30" },
  });
  assert.match(text, /mein Event \*\*GFNY Bremen\*\* am\s*\n\s*\*\*2026-08-30\*\*/);
  assert.doesNotMatch(text, /\{\{EVENT_TITLE\}\}/);
  assert.doesNotMatch(text, /\{\{EVENT_DATE\}\}/);
});

test("buildExportText: preset 'event' mit isTest zeigt den Testtermin-Hinweis (D5)", () => {
  const text = buildExportText(CTX, {
    preset: "event",
    event: { title: "FTP Ramp Test", eventDate: "2026-09-19", isTest: true },
  });
  assert.match(
    text,
    /Testtermin \(kein Wettkampf\) — der Plan wird nicht auf die Testform hin umgebaut/
  );
});

test("buildExportText: preset 'event' ohne isTest (bzw. isTest:false) zeigt KEINEN Testtermin-Hinweis", () => {
  const text = buildExportText(CTX, {
    preset: "event",
    event: { title: "GFNY Bremen", eventDate: "2026-08-30" },
  });
  assert.doesNotMatch(text, /Testtermin \(kein Wettkampf\)/);
});

test("buildExportText: preset 'event' OHNE gewähltes Event fällt sichtbar auf general zurück (kein stiller Fallback)", () => {
  const text = buildExportText(CTX, { preset: "event", event: null });
  assert.match(text, /Preset "Auf Event hin" gewählt, aber kein Zielevent hinterlegt/);
  assert.match(text, /1\. Analysiere Form, Plan und Events\. Prüfe insbesondere:/); // general-Auftrag folgt danach
});

test("buildExportText: unbekanntes/fehlendes Preset fällt auf general zurück", () => {
  const text = buildExportText(CTX, { preset: "unbekannt" });
  assert.match(text, /1\. Analysiere Form, Plan und Events\. Prüfe insbesondere:/);
});

test("buildExportText: extraContext erscheint als eigener Absatz unter dem Auftragsblock", () => {
  const text = buildExportText(CTX, { extraContext: "diese Woche wenig Zeit" });
  assert.match(text, /\*\*Zusatzkontext von mir:\*\* diese Woche wenig Zeit/);
});

test("buildExportText: ohne extraContext erscheint kein Zusatzkontext-Absatz", () => {
  const text = buildExportText(CTX);
  assert.doesNotMatch(text, /Zusatzkontext von mir/);
});

test("buildExportText: extraContext wird auf EXTRA_CONTEXT_MAX_LENGTH gekappt (Längenbegrenzung R2 greift auch auf Datenebene)", () => {
  const tooLong = "x".repeat(EXTRA_CONTEXT_MAX_LENGTH + 50);
  const text = buildExportText(CTX, { extraContext: tooLong });
  const match = text.match(/\*\*Zusatzkontext von mir:\*\* (x+)/);
  assert.ok(match, "Zusatzkontext-Absatz muss vorhanden sein");
  assert.equal(match[1].length, EXTRA_CONTEXT_MAX_LENGTH);
});

test("buildExportText: extraContext wird getrimmt, bloßer Leerraum zählt als 'kein Zusatzkontext'", () => {
  const text = buildExportText(CTX, { extraContext: "   \n  " });
  assert.doesNotMatch(text, /Zusatzkontext von mir/);
});

test("buildBriefingMarkdown: Ruhetag-Karte (D6) erscheint mit TSS 0, ohne '~'-Schätz-Markierung", () => {
  // Ruhetag-Karten tragen in der Praxis immer ein explizites tssPlanned:0
  // (Prioritätsstufe 1 in estimateTss) — kein geschätzter Wert, deshalb
  // keine "~"-Markierung wie bei Typ-Default-Karten.
  const ctxWithRest = {
    ...CTX,
    planCards: [
      ...CTX.planCards,
      { id: "card-rest", date: "2026-07-29", name: "Ruhetag", typ: "Ruhetag", tssPlanned: 0, updatedAt: "2026-07-20T00:00:00Z" },
    ],
  };
  const md = buildBriefingMarkdown(ctxWithRest);
  assert.match(md, /\| 2026-07-29 \| Ruhetag \| Ruhetag \| 0 \| card-rest \|/);
});

test("buildBriefingMarkdown: Entscheidungsgedächtnis zeigt Datum/Operation/Status/Begründung je Vorschlag", () => {
  const md = buildBriefingMarkdown({
    ...CTX,
    recentProposals: [
      { date: "2026-07-21", op: "move", status: "rejected", reason: "Terminkonflikt" },
      { date: "2026-07-02", op: "replace", status: "accepted", reason: "TSB-Reduktion" },
    ],
  });
  assert.match(md, /## Entscheidungsgedächtnis \(letzte Vorschläge\)/);
  assert.match(md, /- 2026-07-21 move → abgelehnt: "Terminkonflikt"/);
  assert.match(md, /- 2026-07-02 replace → angenommen: "TSB-Reduktion"/);
});

test("buildBriefingMarkdown: Entscheidungsgedächtnis zeigt Leer-Hinweis ohne recentProposals", () => {
  const md = buildBriefingMarkdown(CTX); // CTX trägt kein recentProposals
  assert.match(md, /## Entscheidungsgedächtnis \(letzte Vorschläge\)\nKeine bisherigen Vorschläge\./);
});

test("buildBriefingMarkdown: Entscheidungsgedächtnis kappt auf 10 Einträge", () => {
  const recentProposals = Array.from({ length: 15 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    op: "move",
    status: "accepted",
    reason: `Eintrag ${i + 1}`,
  }));
  const md = buildBriefingMarkdown({ ...CTX, recentProposals });
  const matches = md.match(/- 2026-07-\d{2} move/g);
  assert.equal(matches.length, 10);
});

test("buildBriefingMarkdown: Leiterstand (D3/E1) erscheint mit Nachbarstufen, wenn ladderState gesetzt ist", () => {
  const md = buildBriefingMarkdown({
    ...CTX,
    ladderState: [
      {
        summary: "Sweet Spot lang · Stufe S3 (3×15)",
        evidenceGrade: "coaching-konsens",
        neighbors: { prev: { id: "S2" }, next: { id: "S4" } },
      },
    ],
  });
  assert.match(md, /Leiterstand:/);
  assert.match(md, /- Sweet Spot lang · Stufe S3 \(3×15\) \(coaching-konsens\) · Nachbarstufen: S2 \/ S4/);
});

test("buildBriefingMarkdown: kein Leiterstand-Block ohne ladderState (Rückwärtskompatibilität)", () => {
  const md = buildBriefingMarkdown(CTX); // CTX trägt kein ladderState
  assert.doesNotMatch(md, /Leiterstand:/);
});

test("buildBriefingMarkdown: Leiterstand an den Rändern der Leiter zeigt '–' statt Nachbar-ID", () => {
  const md = buildBriefingMarkdown({
    ...CTX,
    ladderState: [
      { summary: "VO2max kurz · Stufe V-K1", evidenceGrade: "studienlage", neighbors: { prev: null, next: { id: "V-K2" } } },
    ],
  });
  assert.match(md, /- VO2max kurz · Stufe V-K1 \(studienlage\) · Nachbarstufen: – \/ V-K2/);
});

/* ── Fortschritt-Sektion (F1, Fenster E1a) ───────────────────── */

test("buildBriefingMarkdown: Fortschritt-Sektion zeigt Leer-Hinweis ohne progress", () => {
  const md = buildBriefingMarkdown(CTX);
  assert.match(md, /## Fortschritt \(letzte Wochen\)\nNoch keine Fortschrittsdaten\./);
});

test("buildBriefingMarkdown: Fortschritt-Sektion zeigt Leer-Hinweis, wenn progress.ef ein leeres efficiencyTrend()-Objekt ist (Regression)", () => {
  // core/efficiency.js::efficiencyTrend() liefert IMMER ein Objekt (nie
  // null), auch ohne vergleichbare Fahrten — first/last sind dann null.
  // Ein reiner Truthy-Check auf progress.ef hätte das übersehen und eine
  // Überschrift ohne jede Zeile darunter gerendert statt des Leer-Hinweises.
  const md = buildBriefingMarkdown({
    ...CTX,
    progress: { eftp: null, ef: { first: null, last: null, slopePer30d: null, comparable: [] }, decoupling: null, bestEfforts: [] },
  });
  assert.match(md, /## Fortschritt \(letzte Wochen\)\nNoch keine Fortschrittsdaten\./);
});

test("buildBriefingMarkdown: Fortschritt-Sektion zeigt eFTP/EF/Decoupling/Bestwerte", () => {
  const md = buildBriefingMarkdown({
    ...CTX,
    progress: {
      eftp: { first: 185, last: 193, slopePerWeek: 1.2, nPoints: 6, lastRampTest: { date: "2026-05-01", ftpWatt: 193 } },
      ef: { first: 1.4, last: 1.48, slopePer30d: 0.02, comparable: [1, 2, 3] },
      decoupling: { median: 4.2, stableShare: 80, slopePer30d: -0.1, n: 6 },
      bestEfforts: [{ label: "5min", secs: 300, recentW: 230, previousW: 220, deltaW: 10 }],
    },
  });
  assert.match(md, /eFTP: 185 W → 193 W, Trend \+1\.2 W\/Woche, letzter Ramp-Test 2026-05-01 \(193 W\)/);
  assert.match(md, /Effizienzfaktor.*1\.4 → 1\.48.*n=3/);
  assert.match(md, /Decoupling.*Median 4\.2%.*80% der Fahrten unter 5%.*n=6/);
  assert.match(md, /Bestwert 5min.*220 W → 230 W \(\+10 W\)/);
});

/* ── Leitplanken-Sektion (P1, Fenster E1c) ───────────────────── */

test("buildBriefingMarkdown: Leitplanken-Sektion zeigt Leer-Hinweis ohne guardrails", () => {
  const md = buildBriefingMarkdown(CTX);
  assert.match(md, /## Leitplanken\nNoch keine Leitplanken-Daten\./);
});

test("buildBriefingMarkdown: Leitplanken-Sektion zeigt Rampe, harte Tage, TID, Wochen-TSS", () => {
  const md = buildBriefingMarkdown({
    ...CTX,
    guardrails: {
      rampActual4w: 4.2,
      rampProjectedHorizon: 6.5,
      rampHistoricalHitRate: 0.04,
      hardDaysPerWeek: [{ week: "2026-KW31", count: 2 }],
      shortestHardGap: 1,
      tidVsCorridor: { phase: "Sweet Spot", shareAboveCorridor: 0.15 },
      weeklyTssVsCeiling: [{ week: "2026-KW31", tss: 420, ceiling: 440, overCeiling: false }],
    },
  });
  assert.match(md, /CTL-Rampe: Ist \(letzte 4 Wochen\) 4\.2 CTL\/Woche · Projiziert \(Planungshorizont\) 6\.5 CTL\/Woche — Schwelle \(8\) wurde in 4% der bisherigen Wochen real erreicht/);
  assert.match(md, /Harte Tage\/Woche.*2026-KW31: 2/);
  assert.match(md, /Kürzester Abstand zwischen zwei harten Tagen im Plan: 1 Tag\(e\)/);
  assert.match(md, /Intensitätsverteilung.*Sweet Spot.*15% oberhalb des Korridors/);
  assert.match(md, /Wochen-TSS vs\. Obergrenze \(CTL×8\): 2026-KW31: 420\/440/);
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
