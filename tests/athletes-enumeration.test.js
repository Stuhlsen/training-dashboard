/* Tests: Athleten aus athlete_sync_config aufzählen (Fahrplan 26 E2)
   - loadSyncConfig(): Sonderprofile über slugForName (sync-profiles.js), alle anderen unter
     `profile:<id>`; profiles.sports wird mitgeliefert
   - listGenericAccounts()/genericAthleteEntry()/activityTypesForSports() */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "http://localhost:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";

const { loadSyncConfig, profileKey } = await import("../scripts/lib/sync-config-fetch.js");
const { listGenericAccounts, genericAthleteEntry, activityTypesForSports, GENERIC_WINDOW_DAYS } =
  await import("../scripts/lib/athletes.js");
const { RIDE_TYPES } = await import("../scripts/lib/intervals.js");

const TODAY = "2026-10-21";

function stubFetch(tables) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const table = new URL(url).pathname.split("/").pop();
    return { ok: true, status: 200, json: async () => tables[table] ?? [], text: async () => "" };
  };
  return () => {
    globalThis.fetch = real;
  };
}

const syncRows = [
  { profile_id: "p1", intervals_api_key: "k1", intervals_athlete_id: "i1" },
  { profile_id: "p4", intervals_api_key: null, intervals_athlete_id: null },
  {
    profile_id: "p9",
    intervals_api_key: "k9",
    intervals_athlete_id: "i9",
    weather_lat: "1.00",
    weather_lon: "2.00",
  },
  { profile_id: "p8", intervals_api_key: null, intervals_athlete_id: null },
  { profile_id: "ghost", intervals_api_key: "kg", intervals_athlete_id: "ig" },
  { athlete_key: "athlete2", intervals_api_key: "k2", intervals_athlete_id: "i2" },
];
const profileRows = [
  { id: "p1", display_name: "Stuhlsen" },
  { id: "p4", display_name: "  BENTASTIIC " },
  { id: "p9", display_name: "irgendwer", sports: ["ride", "run"] },
  { id: "p8", display_name: "ohne_key", sports: null },
];

test("loadSyncConfig: Bestandsathleten unter Slug, neue Accounts unter profile:<id>", async () => {
  const restore = stubFetch({ athlete_sync_config: syncRows, profiles: profileRows });
  try {
    const cfg = await loadSyncConfig();
    assert.deepEqual(
      [...cfg.keys()].sort(),
      ["athlete1", "athlete2", "athlete4", profileKey("p8"), profileKey("p9")].sort()
    );
    assert.equal(cfg.get("athlete1").profileId, "p1");
    assert.equal(cfg.get("athlete4").profileId, "p4");
    assert.equal(cfg.get(profileKey("p9")).apiKey, "k9");
    assert.deepEqual(cfg.get(profileKey("p9")).sports, ["ride", "run"]);
    assert.equal(cfg.get(profileKey("p8")).sports, null);
  } finally {
    restore();
  }
});

test("loadSyncConfig: Zeile ohne profiles-Zeile wird übersprungen", async () => {
  const restore = stubFetch({ athlete_sync_config: syncRows, profiles: profileRows });
  try {
    const cfg = await loadSyncConfig();
    assert.equal(cfg.has(profileKey("ghost")), false);
  } finally {
    restore();
  }
});

test("listGenericAccounts: nur Accounts ohne festen Platz und mit Profil", async () => {
  const restore = stubFetch({ athlete_sync_config: syncRows, profiles: profileRows });
  try {
    const cfg = await loadSyncConfig();
    const generic = listGenericAccounts(cfg, TODAY);
    assert.deepEqual(
      generic.map((g) => g.entry.slug).sort(),
      [profileKey("p8"), profileKey("p9")].sort()
    );
    for (const key of ["athlete1", "athlete2", "athlete3", "athlete4"])
      assert.equal(
        generic.some((g) => g.entry.slug === key),
        false
      );
  } finally {
    restore();
  }
});

test("listGenericAccounts: athlete_key-Zeile ohne Profil bekommt keinen Tabellen-Eintrag", () => {
  const cfg = new Map([["fremd-key", { profileId: null, apiKey: "k" }]]);
  assert.deepEqual(listGenericAccounts(cfg, TODAY), []);
});

test("genericAthleteEntry: keine Ausgabedatei, nur Rad ohne Sportangabe, 12-Monats-Fenster, Label ohne Namen", () => {
  const e = genericAthleteEntry(
    "profile:abcdef123456",
    { profileId: "abcdef123456", sports: null },
    TODAY
  );
  assert.equal("outfile" in e, false);
  assert.equal(e.requireCreds, true);
  assert.equal(e.activityTypes, undefined);
  assert.equal(e.oldest, "2025-10-21");
  assert.equal(GENERIC_WINDOW_DAYS, 365);
  assert.equal(e.shortLabel, "Profil abcdef12");
  assert.deepEqual(e.buildTemplate({}, TODAY), {});
});

test("activityTypesForSports: Sportarten des Profils bestimmen die Aktivitätstypen", () => {
  assert.equal(activityTypesForSports(null), undefined);
  assert.equal(activityTypesForSports([]), undefined);
  assert.equal(activityTypesForSports(["ride"]), undefined);
  assert.equal(activityTypesForSports(["unbekannt"]), undefined);
  const multi = activityTypesForSports(["ride", "run", "swim"]);
  assert.ok(RIDE_TYPES.every((t) => multi.includes(t)));
  assert.ok(multi.includes("Run") && multi.includes("Swim"));
  const runOnly = activityTypesForSports(["run"]);
  assert.equal(runOnly.includes("Ride"), false);
  assert.ok(runOnly.includes("TrailRun"));
});
