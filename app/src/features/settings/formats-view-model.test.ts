import { describe, expect, it } from "vitest";
import { activeSiblingCount, blockedByLimit } from "./formats-view-model";
import type { AthleteFormatEntry } from "../../api/hooks/useAthleteFormats";

function format(id: string, blockTargets: string[]): AthleteFormatEntry["format"] {
  return { id, label: id, targetSystem: "power", currency: "watt", evidenceGrade: "A", blockTargets, axes: {} };
}

const A = format("a", ["schwelle"]);
const B = format("b", ["schwelle"]);
const C = format("c", ["schwelle"]);
const D = format("d", ["vo2max"]);

describe("activeSiblingCount", () => {
  it("zählt aktive Formate mit geteiltem Blockziel, ohne sich selbst", () => {
    const entries: AthleteFormatEntry[] = [
      { format: A, active: true },
      { format: B, active: true },
      { format: C, active: false },
    ];
    expect(activeSiblingCount(entries, A)).toBe(1);
  });

  it("ignoriert Formate ohne geteiltes Blockziel", () => {
    const entries: AthleteFormatEntry[] = [
      { format: A, active: true },
      { format: D, active: true },
    ];
    expect(activeSiblingCount(entries, A)).toBe(0);
  });
});

describe("blockedByLimit", () => {
  it("erlaubt Einschalten, solange weniger als zwei Geschwister aktiv sind", () => {
    const entries: AthleteFormatEntry[] = [{ format: A, active: true }];
    expect(blockedByLimit(entries, B)).toBeNull();
  });

  it("blockiert ab zwei bereits aktiven Geschwistern", () => {
    const entries: AthleteFormatEntry[] = [
      { format: A, active: true },
      { format: B, active: true },
    ];
    expect(blockedByLimit(entries, C)).toBe(
      'Für "schwelle" sind bereits zwei Familien aktiv — zuerst eine deaktivieren.',
    );
  });

  it("Formate ohne Blockziel sind nie beschränkt", () => {
    const noTarget = format("e", []);
    const entries: AthleteFormatEntry[] = [{ format: A, active: true }, { format: B, active: true }];
    expect(blockedByLimit(entries, noTarget)).toBeNull();
  });
});
