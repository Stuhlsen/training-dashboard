/* Tests: api/athlete-config-db.ts — Stammdaten eines Eintrags ohne Platz:
 * Extras zuerst, meta füllt auf, Rest bleibt null. */

import { describe, expect, it } from "vitest";
import { buildDbAthleteConfig } from "./athlete-config-db";
import type { AthleteProfileExtras } from "./supabase/athlete-profile-extras";

const profile = { displayName: "demo.person", sports: ["ride", "run"] as const };

const extras: AthleteProfileExtras = {
  ftpMeasured: 230,
  ftpMeasuredDate: "2026-09-01",
  eFTP: 228,
  ftpGoal: 245,
  seasonStartFtp: 210,
  dataSources: ["Wahoo"],
  bmr: { heightCm: 175, age: 30, sex: "f", weightKg: 62 },
  generatedPlan: false,
};

describe("buildDbAthleteConfig", () => {
  it("Extras gelten zuerst, auch wenn meta andere Werte trägt", () => {
    const cfg = buildDbAthleteConfig("self", {
      profile,
      extras,
      meta: { ftp: 200, ftpGoal: 210, dataSources: ["Garmin"] },
    });
    expect(cfg.ftpMeasured).toBe(230);
    expect(cfg.ftpGoal).toBe(245);
    expect(cfg.dataSources).toEqual(["Wahoo"]);
    expect(cfg.seasonStartFtp).toBe(210);
    expect(cfg.bmr).toEqual(extras.bmr);
  });

  it("ohne Extras-Zeile füllt meta: ftp, ftpGoal, dataSources, hrMax, hrRest", () => {
    const cfg = buildDbAthleteConfig("self", {
      profile,
      extras: null,
      meta: { ftp: 200, ftpGoal: 210, dataSources: ["Garmin", "Wahoo"], hrMax: 185, hrRest: 49 },
    });
    expect(cfg).toMatchObject({
      id: "self",
      name: "demo.person",
      ftpMeasured: 200,
      ftpGoal: 210,
      dataSources: ["Garmin", "Wahoo"],
      hrMax: 185,
      hrRest: 49,
      sports: ["ride", "run"],
    });
    expect(cfg.eFTP).toBeNull();
    expect(cfg.seasonStartFtp).toBeNull();
    expect(cfg.bmr).toBeUndefined();
  });

  it("weder Extras noch meta: alles null, Standardwerte aus dem Profil", () => {
    const cfg = buildDbAthleteConfig("self", { profile: null, extras: null, meta: null });
    expect(cfg.name).toBe("Ich");
    expect(cfg.sports).toEqual(["ride"]);
    expect(cfg.ftpMeasured).toBeNull();
    expect(cfg.ftpGoal).toBeNull();
    expect(cfg.hrMax).toBeNull();
    expect(cfg.dataSources).toEqual([]);
  });

  it("ignoriert falsch typisierte meta-Werte statt sie durchzureichen", () => {
    const cfg = buildDbAthleteConfig("self", {
      profile,
      extras: null,
      meta: { ftp: "220", ftpGoal: null, dataSources: "Wahoo", hrMax: Number.NaN },
    });
    expect(cfg.ftpMeasured).toBeNull();
    expect(cfg.ftpGoal).toBeNull();
    expect(cfg.dataSources).toEqual([]);
    expect(cfg.hrMax).toBeNull();
  });
});
