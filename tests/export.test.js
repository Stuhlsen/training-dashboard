/* Tests: state/export.js — Claude-Export-Text zusammenziehen
   (Phase 4, Export/Import-Workflow-Konzept §2). data-access wird analog zu
   tests/proposals.test.js/tests/plan-cards-move.test.js per mock.module()
   gestubbt (--experimental-test-module-mocks, s. package.json). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const PLAN_CARDS_SEED = [
  { id: "card-past", date: "2020-01-01", sortOrder: 0, name: "Alt", typ: "Z2 Dauer", updatedAt: "2020-01-01T00:00:00Z" },
  { id: "card-future", date: "2099-01-01", sortOrder: 0, name: "Zukunft", typ: "Sweet Spot", tssPlanned: 65, updatedAt: "2026-07-20T00:00:00Z" },
];
const EVENTS_SEED = [{ id: "ev-1", title: "GFNY Bremen", eventDate: "2099-02-01", type: "race", priority: "A" }];
const WELLBEING_SEED = [{ id: "w-1", date: "2026-07-23", energy: 4, muscleFeel: 3, mood: 4, note: "Kopf dicht" }];

mock.module(u("data-access/supabase/plan-cards.js"), {
  exports: {
    listPlanCards: async () => ({ ok: true, cards: PLAN_CARDS_SEED.map((c) => ({ ...c })) }),
    updatePlanCard: async () => ({ ok: true, card: {} }),
    createPlanCard: async () => ({ ok: true, card: {} }),
    removePlanCard: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: { findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }) },
});
mock.module(u("data-access/intervals/push.js"), {
  exports: { pushCardWorkout: async () => ({ ok: true }) },
});
mock.module(u("data-access/supabase/events.js"), {
  exports: {
    listEvents: async () => ({ ok: true, events: EVENTS_SEED.map((e) => ({ ...e })) }),
    createEvent: async () => ({ ok: true, event: {} }),
    updateEvent: async () => ({ ok: true, event: {} }),
    removeEvent: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/wellbeing.js"), {
  exports: {
    getRange: async () => ({ ok: true, checkins: WELLBEING_SEED.map((w) => ({ ...w })) }),
    getSharedRange: async () => ({ ok: true, checkins: [] }),
    upsertToday: async () => ({ ok: true, checkin: {} }),
  },
});
// Standardmäßig leer (Normalfall aktuell: ftp_history hat noch keine echten
// Einträge) — Tests, die den ftp_history-Pfad prüfen wollen, setzen
// ftpHistoryEntries vor dem Aufruf um (s. "FTP: aus ftp_history..."-Test).
let ftpHistoryEntries = [];
mock.module(u("data-access/supabase/ftp-history.js"), {
  exports: {
    getFtpHistory: async () => ({ ok: true, entries: ftpHistoryEntries }),
    saveFtpEntry: async () => ({ ok: true, id: "ftp-1" }),
  },
});
mock.module(u("state/session.js"), {
  exports: {
    getSession: () => ({ id: "athlete-1-uuid", displayName: "Stuhlsen" }),
    onSessionChange: () => () => {},
    isCoach: () => false,
    isAthlete: () => true,
  },
});

const { buildClaudeExport } = await import(u("state/export.js"));
const { loadPlanCards } = await import(u("state/plan-cards.js"));
const { loadEvents } = await import(u("state/events.js"));

test("buildClaudeExport: zieht Plan (nur ab heute), Events, Wellbeing zusammen und baut den Export-Text", async () => {
  await loadPlanCards("athlete1");
  await loadEvents("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.equal(result.ok, true);
  assert.ok(result.text.startsWith("Du bist mein Radsport-Trainer."));
  assert.match(result.text, /card-future/);
  assert.doesNotMatch(result.text, /card-past/, "vergangene Karten dürfen nicht im Plan-Fenster stehen");
  assert.match(result.text, /GFNY Bremen/);
  assert.match(result.text, /Kopf dicht/);
});

test("buildClaudeExport: FTP-Dreiklang aus CONFIG.athleteConfig, nicht Data.ftpValue()", async () => {
  ftpHistoryEntries = []; // ftp_history leer → Fallback-Kette greift
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.match(result.text, /FTP: 193 W \(Ziel: 210 W\)/);
});

test("buildClaudeExport: FTP aus ftp_history (aktueller Ramp-Test-Eintrag) schlägt CONFIG.athleteConfig", async () => {
  ftpHistoryEntries = [
    { id: "ftp-old", ftpWatt: 190, validFrom: "2020-01-01", source: "ramp-test" },
    { id: "ftp-new", ftpWatt: 205, validFrom: "2020-06-01", source: "ramp-test" },
  ];
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.match(result.text, /FTP: 205 W \(Ziel: 210 W\)/);
  ftpHistoryEntries = []; // Zustand für nachfolgende Tests zurücksetzen
});

test("buildClaudeExport: 'schaetzung'-Einträge in ftp_history zählen nicht als aktuelle FTP", async () => {
  ftpHistoryEntries = [{ id: "ftp-est", ftpWatt: 220, validFrom: "2020-01-01", source: "schaetzung" }];
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.match(result.text, /FTP: 193 W \(Ziel: 210 W\)/);
  ftpHistoryEntries = [];
});

test("buildClaudeExport: 'athlete' im JSON-Anhang ist die Session-UUID, nicht die interne Kennung", async () => {
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  // Nicht /```json\n([\s\S]*?)\n```/ ohne Anker: PROMPT_RUMPF enthält seit
  // "Vier vollständige Beispiele" (Commit 78db5eb) vier EINGERÜCKTE
  // ```json-Blöcke vor dem echten JSON-Anhang; deren Schlussmarkierung
  // "\n  ```" matcht \n``` nie (Einrückung), wohl aber die öffnende
  // Markierung "\n```json" des unveränderten Anhangs — das nicht-gierige
  // [\s\S]*? läuft dadurch bis dorthin durch und reißt Beispiele + halbes
  // Briefing mit rein (SyntaxError beim Parsen). ^-Anker (mit /m) verlangt
  // Öffnen UND Schließen am Zeilenanfang — nur der echte, uneingerückte
  // Anhang (core/export-briefing.js::buildBriefingMarkdown) erfüllt das.
  const jsonBlock = result.text.match(/^```json\n([\s\S]*?)\n^```/m)[1];
  const parsed = JSON.parse(jsonBlock);
  assert.equal(parsed.athlete, "athlete-1-uuid");
});

test("buildClaudeExport: liefert einen fileName im erwarteten Format", async () => {
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.match(result.fileName, /^claude-briefing-athlete1-\d{4}-\d{2}-\d{2}\.md$/);
});

test("buildClaudeExport: preset 'reduce' setzt den passenden Auftragsblock ein (Default 'general' ohne Options-Objekt)", async () => {
  await loadPlanCards("athlete1");
  const defaultResult = await buildClaudeExport("athlete1");
  assert.match(defaultResult.text, /1\. Analysiere Form, Plan und Events\. Prüfe insbesondere:/);
  const reduceResult = await buildClaudeExport("athlete1", { preset: "reduce" });
  assert.match(reduceResult.text, /Fokus auf Entlastung/);
});

test("buildClaudeExport: eventId löst gegen die geladenen Events auf und setzt Titel/Datum in den Auftragsblock", async () => {
  await loadPlanCards("athlete1");
  await loadEvents("athlete1");
  const result = await buildClaudeExport("athlete1", { preset: "event", eventId: "ev-1" });
  assert.match(result.text, /mein Event \*\*GFNY Bremen\*\* am\s*\n\s*\*\*2099-02-01\*\*/);
});

test("buildClaudeExport: preset 'event' mit unbekannter/fehlender eventId fällt sichtbar auf general zurück", async () => {
  await loadPlanCards("athlete1");
  await loadEvents("athlete1");
  const result = await buildClaudeExport("athlete1", { preset: "event", eventId: "unbekannte-id" });
  assert.match(result.text, /Preset "Auf Event hin" gewählt, aber kein Zielevent hinterlegt/);
});

test("buildClaudeExport: extraContext landet als eigener Absatz im Text, nie im JSON-Anhang", async () => {
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1", { extraContext: "  bin diese Woche viel unterwegs  " });
  assert.match(result.text, /\*\*Zusatzkontext von mir:\*\* bin diese Woche viel unterwegs/);
  const jsonBlock = result.text.match(/```json\n([\s\S]*?)\n```/)[1];
  assert.doesNotMatch(jsonBlock, /unterwegs/);
});
