/* Tests: state/ladder.js::getPresetSuggestion() (D4b — Preset-Umstellung,
   scharf geschaltet nur für Athlet 1). data-access-Abhängigkeiten per
   mock.module() gestubbt (--experimental-test-module-mocks), analog
   tests/block-transition.test.js. */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { localISODate } from "../assets/js/core/format.js";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const today = localISODate();

let sessionSeed = { id: "user-1", displayName: "Stuhlsen" };
let profileSeed = { id: "user-1", ladderProgressionEnabled: false };
let historySeed = [];

mock.module(u("state/session.js"), {
  exports: { getSession: () => sessionSeed },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: {
    getProfile: async () => ({ ok: true, profile: profileSeed }),
  },
});
mock.module(u("data-access/supabase/ladder.js"), {
  exports: {
    getLadderHistory: async () => ({ ok: true, history: historySeed }),
    recordLadderStep: async () => ({ ok: true, id: "ladder-1" }),
  },
});
mock.module(u("data-access/supabase/formats.js"), {
  exports: {
    getSessionFormats: async () => ({ ok: true, formats: [] }),
    getAthleteFormats: async () => ({ ok: true, athleteFormats: [] }),
  },
});

const { getPresetSuggestion } = await import(u("state/ladder.js"));

test.beforeEach(() => {
  sessionSeed = { id: "user-1", displayName: "Stuhlsen" };
  profileSeed = { id: "user-1", ladderProgressionEnabled: false };
  historySeed = [];
});

test("getPresetSuggestion: nicht eingeloggt -> Beobachtungsmodus, kein Fehler", async () => {
  sessionSeed = null;
  const result = await getPresetSuggestion("build", "sweetspot-long");
  assert.deepEqual(result, { ok: true, enabled: false, suggestion: null });
});

test("getPresetSuggestion: Freigabe false (Default, aktueller Ist-Zustand BEIDER Athleten) -> kein Vorschlag (Negativtest)", async () => {
  profileSeed = { id: "user-1", ladderProgressionEnabled: false };
  const result = await getPresetSuggestion("build", "sweetspot-long");
  assert.deepEqual(result, { ok: true, enabled: false, suggestion: null });
});

test("getPresetSuggestion: Freigabe true + 'build' -> Stufe+1 aus der Historie", async () => {
  profileSeed = { id: "user-1", ladderProgressionEnabled: true };
  historySeed = [{ formatId: "sweetspot-long", step: 3, validFrom: today, reason: "compliance-green" }];
  const result = await getPresetSuggestion("build", "sweetspot-long");
  assert.deepEqual(result, { ok: true, enabled: true, suggestion: { step: 4, action: "up" } });
});

test("getPresetSuggestion: Freigabe true + 'general' -> folgt der übergebenen Ampel (C3)", async () => {
  profileSeed = { id: "user-1", ladderProgressionEnabled: true };
  historySeed = [{ formatId: "threshold-long", step: 2, validFrom: today, reason: "compliance-green" }];
  const result = await getPresetSuggestion("general", "threshold-long", { rating: "red" });
  assert.deepEqual(result, { ok: true, enabled: true, suggestion: { step: 1, action: "down" } });
});

test("getPresetSuggestion: Freigabe true, keine Historie -> Stufe 1 als Startwert", async () => {
  profileSeed = { id: "user-1", ladderProgressionEnabled: true };
  const result = await getPresetSuggestion("check", "vo2-long");
  assert.deepEqual(result, { ok: true, enabled: true, suggestion: { step: 1, action: "hold" } });
});

test("getPresetSuggestion: isTestEvent friert unabhängig von der Freigabe ein", async () => {
  profileSeed = { id: "user-1", ladderProgressionEnabled: true };
  historySeed = [{ formatId: "sweetspot-long", step: 3, validFrom: today, reason: "compliance-green" }];
  const result = await getPresetSuggestion("build", "sweetspot-long", { isTestEvent: true });
  assert.deepEqual(result, { ok: true, enabled: true, suggestion: { step: 3, action: "hold" } });
});
