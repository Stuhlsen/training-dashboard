import { describe, it, expect } from "vitest";
import { parseFinishTime, formatFinishTime, hasRaceResult } from "./event-result-view-model";
import type { EventItem } from "../../api/types";

describe("parseFinishTime", () => {
  it("h:mm:ss", () => {
    expect(parseFinishTime("3:12:45")).toBe(3 * 3600 + 12 * 60 + 45);
    expect(parseFinishTime(" 0:05:00 ")).toBe(300);
    expect(parseFinishTime("0:45:30")).toBe(45 * 60 + 30);
  });

  it("nur h:mm:ss — zwei Teile sind mehrdeutig → null", () => {
    expect(parseFinishTime("3:12")).toBeNull();
    expect(parseFinishTime("45:30")).toBeNull();
    expect(parseFinishTime("192:30")).toBeNull();
  });

  it("leer / Müll / falsches Format → null", () => {
    expect(parseFinishTime("")).toBeNull();
    expect(parseFinishTime("   ")).toBeNull();
    expect(parseFinishTime("abc")).toBeNull();
    expect(parseFinishTime("3")).toBeNull();
    expect(parseFinishTime("1:2:3:4")).toBeNull();
    expect(parseFinishTime("1:2a:3")).toBeNull();
  });

  it("Minuten/Sekunden > 59 → null", () => {
    expect(parseFinishTime("1:75:00")).toBeNull();
    expect(parseFinishTime("1:00:75")).toBeNull();
  });

  it("Null-Dauer → null", () => {
    expect(parseFinishTime("0:00:00")).toBeNull();
  });
});

describe("formatFinishTime", () => {
  it("Sekunden → h:mm:ss", () => {
    expect(formatFinishTime(11565)).toBe("3:12:45");
    expect(formatFinishTime(300)).toBe("0:05:00");
  });

  it("null / 0 / negativ → \"\"", () => {
    expect(formatFinishTime(null)).toBe("");
    expect(formatFinishTime(0)).toBe("");
    expect(formatFinishTime(-5)).toBe("");
  });

  it("round-trip mit parseFinishTime", () => {
    expect(parseFinishTime(formatFinishTime(11565))).toBe(11565);
  });
});

describe("hasRaceResult", () => {
  const base = { resultTimeS: null, resultAvgWatts: null, resultPlaceAg: null, resultPlaceOverall: null };
  it("keins gesetzt → false", () => {
    expect(hasRaceResult(base as EventItem)).toBe(false);
  });
  it("irgendeins gesetzt → true", () => {
    expect(hasRaceResult({ ...base, resultPlaceAg: 42 } as EventItem)).toBe(true);
    expect(hasRaceResult({ ...base, resultTimeS: 100 } as EventItem)).toBe(true);
  });
});
