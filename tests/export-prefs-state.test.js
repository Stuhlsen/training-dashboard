/* Tests: state/export-prefs.js — Persistenz pro Profil (Gesamtzusammenspiel,
   Export-Richtungsvorgabe-Konzept R5/R6).

   tests/export-prefs.test.js (Schritt 1) deckt bereits die data-access-Schicht
   direkt ab (Query-Aufbau, Row-Mapping). Hier geht es um die STATE-Schicht
   selbst: Laden, Speichern, Wechsel des Presets, Verhalten ohne gespeicherten
   Eintrag/ohne Session — genau das Zusammenspiel aus state/export-prefs.js +
   state/session.js, das erst im Ganzen prüfbar ist. Analog zu
   tests/plan-cards-move.test.js wird dafür die data-access-Grenze per
   mock.module() gestubbt (--experimental-test-module-mocks), state/session.js
   ebenso (kein echter Supabase-Client nötig). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

let currentUser = { id: "profile-uuid-1" };
/** Simuliert die einzige Zeile in `export_prefs` für `currentUser` — `null`
 *  bedeutet "noch nie gespeichert" (R6-Fall). */
let storedRow = null;
const getCalls = [];
const setCalls = [];

mock.module(u("data-access/supabase/export-prefs.js"), {
  exports: {
    getExportPrefs: async (profileId) => {
      getCalls.push(profileId);
      return { ok: true, preset: storedRow?.preset ?? null, eventId: storedRow?.eventId ?? null };
    },
    setExportPrefs: async (profileId, { preset, eventId }) => {
      setCalls.push({ profileId, preset, eventId });
      storedRow = { preset, eventId };
      return { ok: true };
    },
  },
});
mock.module(u("state/session.js"), {
  exports: { getSession: () => currentUser },
});

const { loadExportPrefs, saveExportPrefs, getState, DEFAULT_PRESET } = await import(u("state/export-prefs.js"));

test("loadExportPrefs: kein gespeicherter Eintrag -> Default 'general', kein Zielevent (R6)", async () => {
  storedRow = null;
  const result = await loadExportPrefs();
  assert.equal(result.ok, true);
  assert.equal(result.preset, DEFAULT_PRESET);
  assert.equal(result.eventId, null);
  assert.deepEqual(getState(), { preset: DEFAULT_PRESET, eventId: null, loading: false, error: null });
});

test("loadExportPrefs: gespeicherter Eintrag wird geladen und in getState() gespiegelt", async () => {
  storedRow = { preset: "reduce", eventId: "ev-1" };
  const result = await loadExportPrefs();
  assert.equal(result.ok, true);
  assert.equal(result.preset, "reduce");
  assert.equal(result.eventId, "ev-1");
  assert.equal(getState().preset, "reduce");
  assert.equal(getState().eventId, "ev-1");
});

test("loadExportPrefs: ohne Session -> Default 'general', kein data-access-Aufruf", async () => {
  currentUser = null;
  getCalls.length = 0;
  const result = await loadExportPrefs();
  assert.equal(result.ok, true);
  assert.equal(result.preset, DEFAULT_PRESET);
  assert.equal(result.eventId, null);
  assert.equal(getCalls.length, 0, "ohne Session darf kein Request an die data-access-Schicht gehen");
  currentUser = { id: "profile-uuid-1" };
});

test("saveExportPrefs: speichert Preset+Event via data-access (Upsert auf profile_id) und aktualisiert getState()", async () => {
  storedRow = null;
  setCalls.length = 0;
  const result = await saveExportPrefs("build", null);
  assert.equal(result.ok, true);
  assert.deepEqual(setCalls[0], { profileId: "profile-uuid-1", preset: "build", eventId: null });
  assert.equal(getState().preset, "build");
  assert.equal(getState().eventId, null);
});

test("saveExportPrefs: Wechsel des Presets überschreibt die eine gespeicherte Zeile (kein Verlauf)", async () => {
  await saveExportPrefs("event", "ev-2");
  assert.equal(getState().preset, "event");
  assert.equal(getState().eventId, "ev-2");

  await saveExportPrefs("check", null);
  assert.equal(getState().preset, "check");
  assert.equal(getState().eventId, null);
  assert.deepEqual(storedRow, { preset: "check", eventId: null }, "data-access hält nur die letzte Zeile, keine Historie");
});

test("saveExportPrefs: ein erneutes loadExportPrefs() liest exakt das zuletzt gespeicherte Preset", async () => {
  await saveExportPrefs("reduce", null);
  const result = await loadExportPrefs();
  assert.equal(result.ok, true);
  assert.equal(result.preset, "reduce");
});

test("saveExportPrefs: ohne Session -> Fehler-Result, kein data-access-Aufruf", async () => {
  currentUser = null;
  setCalls.length = 0;
  const result = await saveExportPrefs("build", null);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN");
  assert.equal(setCalls.length, 0, "ohne Session darf kein Schreib-Request an die data-access-Schicht gehen");
  currentUser = { id: "profile-uuid-1" };
});
