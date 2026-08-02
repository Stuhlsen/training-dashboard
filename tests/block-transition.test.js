/* Tests: state/block-transition.js — Blockstart-Dialog-Erkennung (D3/E2)
   state/-Abhängigkeiten per mock.module() gestubbt (--experimental-test-
   module-mocks), analog tests/export.test.js. localISODate() liefert das
   ECHTE heutige Datum — die Fixture-Karten liegen deshalb relativ zu
   `today`, nicht auf festen Kalendertagen. */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { localISODate, addDaysISO } from "../assets/js/core/format.js";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const today = localISODate();

const SWEETSPOT = { id: "sweetspot-long", label: "Sweet Spot lang", evidenceGrade: "coaching-konsens", blockTargets: ["Sweet Spot"], axes: {} };
const THRESHOLD = { id: "threshold-long", label: "Schwelle lang", evidenceGrade: "coaching-konsens", blockTargets: ["Schwelle"], axes: {} };
const VO2_SHORT = { id: "vo2-short", label: "VO2max kurz", evidenceGrade: "studienlage", blockTargets: ["VO2max"], axes: {} };
const VO2_LONG = { id: "vo2-long", label: "VO2max lang", evidenceGrade: "studienlage", blockTargets: ["VO2max"], axes: {} };
const catalogSeed = [SWEETSPOT, THRESHOLD, VO2_SHORT, VO2_LONG];

let cardsSeed = [];
let athleteFormatsSeed = [];
let ladderHistorySeed = [];

mock.module(u("state/plan-cards.js"), {
  exports: { getState: () => ({ cards: cardsSeed }) },
});
mock.module(u("state/formats.js"), {
  exports: {
    getSessionFormats: async () => ({ ok: true, formats: catalogSeed }),
    getAthleteFormats: async () => ({ ok: true, athleteFormats: athleteFormatsSeed }),
    setAthleteFormatActive: async () => ({ ok: true }),
  },
});
mock.module(u("state/ladder.js"), {
  exports: {
    getLadderHistory: async () => ({ ok: true, history: ladderHistorySeed }),
    recordLadderStep: async () => ({ ok: true, id: "ladder-1" }),
    getLadderState: async () => ({ ok: true, formats: [] }),
  },
});

const { detectBlockTransition } = await import(u("state/block-transition.js"));

test.beforeEach(() => {
  cardsSeed = [];
  athleteFormatsSeed = [];
  ladderHistorySeed = [];
});

test("detectBlockTransition: keine Karte mit Blockziel -> kein Prompt", async () => {
  const result = await detectBlockTransition();
  assert.deepEqual(result, { shouldPrompt: false });
});

test("detectBlockTransition: Blockziel unverändert ggü. vor 7 Tagen -> kein Prompt", async () => {
  // Durchgehend "VO2max" seit weit vor dem Betrachtungsfenster.
  cardsSeed = [{ date: addDaysISO(today, -30), phase: "VO2max" }, { date: addDaysISO(today, 5), phase: "VO2max" }];
  athleteFormatsSeed = [{ formatId: "vo2-short", active: true }, { formatId: "vo2-long", active: true }];
  const result = await detectBlockTransition();
  assert.equal(result.shouldPrompt, false);
});

test("detectBlockTransition: Blockziel gewechselt, aber nur eine aktive Familie zulässig -> kein Prompt", async () => {
  // Vor 7 Tagen lief noch Sweet Spot, jetzt Schwelle — aber nur threshold-long aktiv.
  cardsSeed = [{ date: addDaysISO(today, -3), phase: "Sweet Spot" }, { date: addDaysISO(today, 2), phase: "Schwelle" }];
  athleteFormatsSeed = [{ formatId: "threshold-long", active: true }];
  const result = await detectBlockTransition();
  assert.equal(result.shouldPrompt, false);
});

test("detectBlockTransition: Blockziel gewechselt, zwei aktive Familien, noch keine Entscheidung -> Prompt mit Kandidaten", async () => {
  // Vor 7 Tagen (today-7) war die letzte Sweet-Spot-Karte (today-3) noch die
  // nächstliegende künftige Karte -> Blockziel damals "Sweet Spot". Heute
  // liegt sie in der Vergangenheit, die nächste Karte ist VO2max.
  cardsSeed = [{ date: addDaysISO(today, -3), phase: "Sweet Spot" }, { date: addDaysISO(today, 2), phase: "VO2max" }];
  athleteFormatsSeed = [{ formatId: "vo2-short", active: true }, { formatId: "vo2-long", active: true }];
  const result = await detectBlockTransition();
  assert.equal(result.shouldPrompt, true);
  assert.equal(result.blockTarget, "VO2max");
  assert.deepEqual(
    result.candidates.map((c) => c.id).sort(),
    ["vo2-long", "vo2-short"],
  );
});

test("detectBlockTransition: bereits ein block-start-Eintrag seit Blockbeginn -> kein erneuter Prompt", async () => {
  cardsSeed = [{ date: addDaysISO(today, -3), phase: "Sweet Spot" }, { date: addDaysISO(today, 2), phase: "VO2max" }];
  athleteFormatsSeed = [{ formatId: "vo2-short", active: true }, { formatId: "vo2-long", active: true }];
  ladderHistorySeed = [{ formatId: "vo2-short", step: 1, validFrom: today, reason: "block-start" }];
  const result = await detectBlockTransition();
  assert.equal(result.shouldPrompt, false);
});

test("detectBlockTransition: nur inaktive Formate für das Blockziel -> kein Prompt (0 Kandidaten)", async () => {
  cardsSeed = [{ date: addDaysISO(today, -3), phase: "Sweet Spot" }, { date: addDaysISO(today, 2), phase: "VO2max" }];
  athleteFormatsSeed = [{ formatId: "vo2-short", active: false }, { formatId: "vo2-long", active: false }];
  const result = await detectBlockTransition();
  assert.equal(result.shouldPrompt, false);
});
