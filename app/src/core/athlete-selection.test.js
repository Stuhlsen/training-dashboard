import { describe, expect, it } from "vitest";
import {
  SELF_ATHLETE_ID,
  SELF_FALLBACK_NAME,
  athleteOptions,
  findSlotId,
  resolveActiveAthleteId,
} from "./athlete-selection.js";

const ATHLETES = [
  { id: "a1", name: "alpha" },
  { id: "a2", name: "beta" },
];
const VALID = ["a1", "a2"];

describe("findSlotId", () => {
  it("findet den Platz über den Anzeigenamen", () => {
    expect(findSlotId(ATHLETES, "beta")).toBe("a2");
  });
  it("null ohne Treffer, ohne Namen", () => {
    expect(findSlotId(ATHLETES, "gamma")).toBeNull();
    expect(findSlotId(ATHLETES, "")).toBeNull();
    expect(findSlotId(ATHLETES, null)).toBeNull();
  });
});

describe("athleteOptions", () => {
  it("ohne Profil (ausgeloggt/lädt): nur die Plätze", () => {
    expect(athleteOptions({ athletes: ATHLETES, selfProfile: null, slotId: null })).toEqual(ATHLETES);
  });
  it("Account mit Platz: nur die Plätze, kein eigener Eintrag", () => {
    const options = athleteOptions({ athletes: ATHLETES, selfProfile: { displayName: "alpha" }, slotId: "a1" });
    expect(options).toEqual(ATHLETES);
  });
  it("Account ohne Platz: eigener Eintrag mit Anzeigename am Ende", () => {
    const options = athleteOptions({ athletes: ATHLETES, selfProfile: { displayName: " gamma " }, slotId: null });
    expect(options).toEqual([...ATHLETES, { id: SELF_ATHLETE_ID, name: "gamma" }]);
  });
  it("ohne Anzeigename: Beschriftung 'Ich'", () => {
    const options = athleteOptions({ athletes: ATHLETES, selfProfile: { displayName: "  " }, slotId: null });
    expect(options.at(-1)).toEqual({ id: SELF_ATHLETE_ID, name: SELF_FALLBACK_NAME });
  });
});

describe("resolveActiveAthleteId", () => {
  const base = { validIds: VALID, primaryId: "a1", userKnown: true };
  const noSlot = { selfProfile: { displayName: "gamma" }, slotId: null };
  const withSlot = { selfProfile: { displayName: "beta" }, slotId: "a2" };

  it("Account ohne Platz, nichts gespeichert: startet auf dem eigenen Eintrag", () => {
    expect(resolveActiveAthleteId({ ...base, ...noSlot, stored: null })).toBe(SELF_ATHLETE_ID);
  });
  it("Account ohne Platz, fremden Platz gewählt: bleibt dort", () => {
    expect(resolveActiveAthleteId({ ...base, ...noSlot, stored: "a2" })).toBe("a2");
  });
  it("gespeichert 'self', Account ohne Platz: bleibt self", () => {
    expect(resolveActiveAthleteId({ ...base, ...noSlot, stored: SELF_ATHLETE_ID })).toBe(SELF_ATHLETE_ID);
  });
  it("gespeichert 'self', aber Account hat einen Platz: eigener Platz", () => {
    expect(resolveActiveAthleteId({ ...base, ...withSlot, stored: SELF_ATHLETE_ID })).toBe("a2");
  });
  it("Account mit Platz, nichts gespeichert: wie bisher der Primär-Athlet", () => {
    expect(resolveActiveAthleteId({ ...base, ...withSlot, stored: null })).toBe("a1");
  });
  it("Profil lädt noch: 'self' bleibt stehen, sonst Primär-Athlet", () => {
    const loading = { selfProfile: null, slotId: null };
    expect(resolveActiveAthleteId({ ...base, ...loading, stored: SELF_ATHLETE_ID })).toBe(SELF_ATHLETE_ID);
    expect(resolveActiveAthleteId({ ...base, ...loading, stored: null })).toBe("a1");
  });
  it("ausgeloggt: 'self' fällt auf den Primär-Athleten", () => {
    const out = { selfProfile: null, slotId: null, userKnown: false };
    expect(resolveActiveAthleteId({ ...base, ...out, stored: SELF_ATHLETE_ID })).toBe("a1");
  });
  it("unbekannte gespeicherte ID: wie nichts gespeichert", () => {
    expect(resolveActiveAthleteId({ ...base, ...noSlot, stored: "weg" })).toBe(SELF_ATHLETE_ID);
    expect(resolveActiveAthleteId({ ...base, ...withSlot, stored: "weg" })).toBe("a1");
  });
});
