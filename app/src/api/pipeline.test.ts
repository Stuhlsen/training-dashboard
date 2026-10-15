import { describe, expect, it } from "vitest";
import { emptyAthleteData } from "./pipeline";

describe("emptyAthleteData", () => {
  it("liefert ein leeres, vollständiges Gerüst ohne Fehler und ohne Warnungen", () => {
    const data = emptyAthleteData();
    expect(data.rides).toEqual([]);
    expect(data.wellness).toEqual([]);
    expect(data.plannedSessions).toEqual([]);
    expect(data.ftpHistory).toEqual([]);
    expect(data.athleteFtp).toBeNull();
    expect(data.ftpPublic).toBe(true);
    expect(data.warnings).toEqual([]);
  });

  it("gibt jedes Mal ein frisches Objekt zurück (kein geteilter Zustand)", () => {
    expect(emptyAthleteData()).not.toBe(emptyAthleteData());
    expect(emptyAthleteData().rides).not.toBe(emptyAthleteData().rides);
  });
});
