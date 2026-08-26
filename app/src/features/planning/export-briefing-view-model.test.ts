/* Tests: export-briefing-view-model.ts — Assemblierung der ctx-Struktur für
 * core/export-briefing.js::buildExportText() (Etappe 7c). */

import { describe, expect, it } from "vitest";
import { buildExportBriefingCtx, wellbeingWindow, ACTUALS_WEEKS, WELLBEING_WEEKS } from "./export-briefing-view-model";
import { assessReadiness } from "../../core/readiness.js";

const TODAY = "2026-08-15";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Stuhlsen",
    ftp: 193,
    ftpGoal: 210,
    dataSources: ["intervals.icu"],
    events: [],
    cards: [],
    rides: [],
    wellness: [],
    wellbeing: [],
    powerCurveBlocks: [],
    ftpHistoryEntries: [],
    projection: null,
    conflicts: [],
    proposals: [],
    ladderState: [],
    today: TODAY,
    ...overrides,
  };
}

describe("wellbeingWindow", () => {
  it("liefert ein WELLBEING_WEEKS-breites Fenster bis heute", () => {
    expect(wellbeingWindow(TODAY)).toEqual({ from: "2026-07-18", to: TODAY });
    expect(WELLBEING_WEEKS).toBe(4);
  });
});

describe("buildExportBriefingCtx", () => {
  it("filtert planCards auf >= heute, lässt cards für Guardrails unangetastet", () => {
    const cards = [
      { id: "c1", date: "2026-08-01" }, // in der Vergangenheit
      { id: "c2", date: TODAY },
      { id: "c3", date: "2026-08-20" },
    ] as never;
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ cards }));
    expect(ctx.planCards.map((c) => c.id)).toEqual(["c2", "c3"]);
  });

  it("filtert actuals auf ACTUALS_WEEKS zurück", () => {
    expect(ACTUALS_WEEKS).toBe(4);
    const rides = [
      { dateISO: "2026-07-10" }, // älter als 4 Wochen (Grenze 2026-07-18)
      { dateISO: "2026-07-20" },
      { dateISO: TODAY },
    ] as never;
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ rides }));
    expect(ctx.actuals.map((r: { dateISO: string }) => r.dateISO)).toEqual(["2026-07-20", TODAY]);
  });

  it("FTP bevorzugt einen ramp-test-Eintrag aus ftpHistoryEntries vor input.ftp", () => {
    const ftpHistoryEntries = [
      { ftpWatt: 200, validFrom: "2026-07-01", source: "ramp-test" },
      { ftpWatt: 999, validFrom: "2026-06-01", source: "schaetzung" }, // zählt nicht
    ];
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ ftp: 193, ftpHistoryEntries }));
    expect(ctx.ftp).toBe(200);
  });

  it("ohne ramp-test-Eintrag fällt FTP auf input.ftp zurück", () => {
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ ftp: 193, ftpHistoryEntries: [] }));
    expect(ctx.ftp).toBe(193);
  });

  it("recentProposals: nur entschiedene Status, neueste zuerst, Limit 10, Datum aus decidedAt", () => {
    const proposals = [
      { id: "p1", status: "open", op: "move", decidedAt: null, createdAt: "2026-08-01T00:00:00Z", reason: "x" },
      { id: "p2", status: "accepted", op: "move", decidedAt: "2026-08-05T10:00:00Z", createdAt: "2026-08-01T00:00:00Z", reason: "y" },
      { id: "p3", status: "rejected", op: "cancel", decidedAt: "2026-08-10T10:00:00Z", createdAt: "2026-08-02T00:00:00Z", reason: "z" },
    ] as never;
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ proposals }));
    expect(ctx.recentProposals).toEqual([
      { date: "2026-08-10", op: "cancel", status: "rejected", reason: "z" },
      { date: "2026-08-05", op: "move", status: "accepted", reason: "y" },
    ]);
  });

  it("ladderState/presetSuggestions werden unverändert durchgereicht (Default leer)", () => {
    const ladderState = [{ formatId: "f1", label: "Sweet Spot", evidenceGrade: "A", step: 2, stepData: null, summary: "x", neighbors: { prev: null, next: null } }] as never;
    const ctxWithout = buildExportBriefingCtx("athlete1", baseInput());
    expect(ctxWithout.presetSuggestions).toEqual([]);

    const ctx = buildExportBriefingCtx("athlete1", baseInput({ ladderState }));
    expect(ctx.ladderState).toBe(ladderState);
  });

  it("displayName fällt auf 'Athlet' zurück, wenn null", () => {
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ displayName: null }));
    expect(ctx.displayName).toBe("Athlet");
  });

  it("progress/guardrails sind immer befüllt (core-Module degradieren selbst bei leeren Daten)", () => {
    const ctx = buildExportBriefingCtx("athlete1", baseInput());
    expect(ctx.progress).toEqual({
      eftp: null,
      ef: { comparable: [], rolling: [], slopePer30d: null, first: null, last: null },
      decoupling: null,
      bestEfforts: [],
    });
    expect(ctx.guardrails).toBeTruthy();
  });

  it("readiness: null bei leerem wellness (zu wenig Historie für eine Baseline)", () => {
    const ctx = buildExportBriefingCtx("athlete1", baseInput());
    expect(ctx.readiness).toBe(null);
  });

  it("readiness: bei ausreichender Historie identisch zum direkten assessReadiness()-Ergebnis", () => {
    const wellness = Array.from({ length: 49 }, (_, i) => {
      const d = new Date(`${TODAY}T00:00:00`);
      d.setDate(d.getDate() - (i + 1));
      const dateISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { date: dateISO, hrv: 62 + (i % 3) - 1, restingHR: 52 + (i % 2), sleepHours: 7.2, sleepScore: 82 };
    }) as never;
    const ctx = buildExportBriefingCtx("athlete1", baseInput({ wellness }));
    expect(ctx.readiness).toEqual(assessReadiness(wellness, TODAY));
    expect(ctx.readiness?.level).toBeTruthy();
  });
});
