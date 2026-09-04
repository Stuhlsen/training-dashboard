import { describe, it, expect } from "vitest";
import {
  detectDoneFtpTest,
  rescalePreviewRows,
} from "./ftp-rescale-dialog-view-model";

const TODAY = "2026-09-25";

const ride = (date: string) => ({ date }) as unknown as import("../../types.js").Ride;

const ss = (watts: [number, number]) => ({
  pct: [88, 92],
  watts,
  label: "Sweet Spot 3×12",
  zone: "Sweet Spot",
});

describe("detectDoneFtpTest", () => {
  const cards = [
    { id: "t-old", date: "2026-08-20", typ: "FTP-Test" }, // > 21 Tage
    { id: "t-recent", date: "2026-09-11", typ: "FTP-Test" }, // 14 Tage, gefahren
    { id: "t-future", date: "2026-10-02", typ: "FTP-Test" }, // liegt vor uns
    { id: "z2", date: "2026-09-12", typ: "Z2 Dauer" },
  ];
  const rides = [ride("2026-08-20"), ride("2026-09-11")];

  it("findet den jüngsten gefahrenen Testtag im Fenster", () => {
    expect(detectDoneFtpTest({ cards, rides, hasActivePlan: true, todayISO: TODAY })).toEqual({
      testCardId: "t-recent",
      testDateISO: "2026-09-11",
    });
  });

  it("null ohne aktiven selbst gebauten Plan", () => {
    expect(detectDoneFtpTest({ cards, rides, hasActivePlan: false, todayISO: TODAY })).toBeNull();
  });

  it("null, wenn der Testtag keine Ist-Fahrt hat", () => {
    expect(
      detectDoneFtpTest({ cards, rides: [ride("2026-08-20")], hasActivePlan: true, todayISO: TODAY }),
    ).toBeNull();
  });

  it("ignoriert Testtage älter als das Fenster und künftige", () => {
    const onlyEdges = cards.filter((c) => c.id === "t-old" || c.id === "t-future");
    expect(
      detectDoneFtpTest({
        cards: onlyEdges,
        rides: [ride("2026-08-20"), ride("2026-10-02")],
        hasActivePlan: true,
        todayISO: TODAY,
      }),
    ).toBeNull();
  });
});

describe("rescalePreviewRows", () => {
  const cards = [
    { id: "past", date: "2026-09-01", name: "Alt", workout: ss([220, 230]) },
    { id: "f1", date: "2026-10-01", name: "Sweet Spot", workout: ss([220, 230]) },
    { id: "f2", date: "2026-10-03", name: "Schwelle", workout: { pct: [98, 102] } },
  ];

  it("zählt nur künftige Karten und liefert Beispielzeilen", () => {
    const out = rescalePreviewRows({ cards, newFtp: 265, todayISO: TODAY });
    expect(out.affectedCount).toBe(2);
    expect(out.rows).toEqual([
      { name: "Sweet Spot", from: [220, 230], to: [233, 244] },
      { name: "Schwelle", from: null, to: [260, 270] },
    ]);
  });

  it("deckelt die Zeilenanzahl auf limit", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`,
      date: "2026-10-05",
      name: `E${i}`,
      workout: ss([220, 230]),
    }));
    const out = rescalePreviewRows({ cards: many, newFtp: 265, todayISO: TODAY, limit: 3 });
    expect(out.affectedCount).toBe(9);
    expect(out.rows).toHaveLength(3);
  });

  it("ungültige FTP → nichts betroffen", () => {
    expect(rescalePreviewRows({ cards, newFtp: 0, todayISO: TODAY })).toEqual({
      affectedCount: 0,
      rows: [],
    });
  });
});
