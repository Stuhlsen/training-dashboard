import { describe, expect, it } from "vitest";
import { buildDoneRows, gapsChips, planFidelitySummary, type DoneRideMap } from "./done-table-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;

function card(overrides: Partial<PlanCard> & { id: string }): PlanCard {
  return {
    date: "2026-08-06",
    sortOrder: 0,
    name: "Session",
    typ: "Schwelle",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: "2026-KW32",
    phase: "Rennhärte",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function ride(overrides: Partial<Ride> = {}): Ride {
  return { dateISO: "2026-08-06", ...overrides } as Ride;
}

function compliance(overrides: Partial<RideCompliance> & { matchedCardId: string }): RideCompliance {
  return {
    fadePct: 0,
    rating: "green",
    rule: "alle-intervalle-erfuellt",
    matched: [{ plannedDurationS: 300, plannedWatts: 250 } as never],
    ...overrides,
  } as RideCompliance;
}

describe("buildDoneRows", () => {
  it("übernimmt Dauer/Ø-Watt aus buildDoneCompareRows() statt eigener Berechnung", () => {
    const c = card({ id: "a", workout: { watts: [220, 240] }, durationMin: 60 });
    const r = ride({ min: 58, watt: 235 });
    const rows = buildDoneRows([c], new Map([["a", r]]), "athlete1", 200);
    expect(rows[0].durationPlan).toBe("60 min");
    expect(rows[0].durationActual).toBe("58 min");
    expect(rows[0].wattPlan).toBe("220–240 W");
    expect(rows[0].wattActual).toBe("235 W");
    expect(rows[0].wattColor).toBe("var(--ok)");
  });

  it("liest TSS direkt aus card.tssPlanned/ride.tss, ohne Neuberechnung", () => {
    const c = card({ id: "a", tssPlanned: 80 });
    const r = ride({ tss: 92 });
    const rows = buildDoneRows([c], new Map([["a", r]]), "athlete1", 200);
    expect(rows[0].tssPlanned).toBe(80);
    expect(rows[0].tssActual).toBe(92);
    expect(rows[0].tssRatioPct).toBe(115);
  });

  it("liefert tssRatioPct=null ohne Plan-TSS", () => {
    const c = card({ id: "a", tssPlanned: null });
    const r = ride({ tss: 92 });
    const rows = buildDoneRows([c], new Map([["a", r]]), "athlete1", 200);
    expect(rows[0].tssRatioPct).toBeNull();
  });

  it("unterdrückt Plan-TSS + Soll/Ist-Verhältnis bei Test-Karten (FTP-Test hat nur eine Platzhalter-Plan-TSS)", () => {
    const c = card({ id: "a", typ: "FTP-Test", tssPlanned: 8 });
    const r = ride({ tss: 44 });
    const rows = buildDoneRows([c], new Map([["a", r]]), "athlete1", 200);
    expect(rows[0].tssPlanned).toBeNull();
    expect(rows[0].tssRatioPct).toBeNull();
    expect(rows[0].tssActual).toBe(44);
  });

  it("markiert eine Zeile ohne gematchte Ist-Fahrt als nicht aufklappbar, mit Dash-Feldern", () => {
    const c = card({ id: "a", tssPlanned: 80 });
    const rows = buildDoneRows([c], new Map(), "athlete1", 200);
    expect(rows[0].ride).toBeNull();
    expect(rows[0].expandable).toBe(false);
    expect(rows[0].durationActual).toBe("–");
    expect(rows[0].wattActual).toBe("–");
    expect(rows[0].compliance).toBeNull();
  });

  it("liefert die sichtbare Compliance-Ampel nur bei Match auf GENAU diese Karte", () => {
    const c = card({ id: "a", workoutStructure: null });
    const r = ride({ compliance: compliance({ matchedCardId: "a", rating: "yellow" }) });
    const rows = buildDoneRows([c], new Map([["a", r]]), "athlete1", 200);
    expect(rows[0].compliance?.rating).toBe("yellow");
    expect(rows[0].expandable).toBe(true);
  });

  it("liefert compliance=null, wenn die Ampel auf eine andere Karte gematcht ist", () => {
    const c = card({ id: "a" });
    const r = ride({ compliance: compliance({ matchedCardId: "other" }) });
    const rows = buildDoneRows([c], new Map([["a", r]]), "athlete1", 200);
    expect(rows[0].compliance).toBeNull();
  });
});

describe("planFidelitySummary", () => {
  const TODAY = "2026-08-19";

  it("zählt nur Karten mit sichtbarer Compliance-Ampel im Fenster", () => {
    const rated = card({ id: "a", date: "2026-08-10" });
    const unrated = card({ id: "b", date: "2026-08-11" });
    const doneRides: DoneRideMap = new Map([
      ["a", ride({ dateISO: "2026-08-10", compliance: compliance({ matchedCardId: "a", rating: "green" }) })],
      ["b", ride({ dateISO: "2026-08-11" })], // keine Compliance
    ]);
    const summary = planFidelitySummary([rated, unrated], doneRides, TODAY, 28);
    expect(summary.ratedCount).toBe(1);
    expect(summary.fulfilledCount).toBe(1);
    expect(summary.pct).toBe(100);
  });

  it("zählt nur 'green' als erfüllt, 'yellow'/'red' zählen in ratedCount, nicht in fulfilledCount", () => {
    const cards = [card({ id: "a", date: "2026-08-10" }), card({ id: "b", date: "2026-08-11" })];
    const doneRides: DoneRideMap = new Map([
      ["a", ride({ dateISO: "2026-08-10", compliance: compliance({ matchedCardId: "a", rating: "green" }) })],
      ["b", ride({ dateISO: "2026-08-11", compliance: compliance({ matchedCardId: "b", rating: "red" }) })],
    ]);
    const summary = planFidelitySummary(cards, doneRides, TODAY, 28);
    expect(summary.ratedCount).toBe(2);
    expect(summary.fulfilledCount).toBe(1);
    expect(summary.pct).toBe(50);
  });

  it("schließt Karten außerhalb des Fensters aus (windowDays inklusiv am Start)", () => {
    const inWindow = card({ id: "a", date: "2026-07-22" }); // genau 28 Tage vor TODAY
    const outside = card({ id: "b", date: "2026-07-21" }); // 29 Tage vor TODAY
    const doneRides: DoneRideMap = new Map([
      ["a", ride({ dateISO: "2026-07-22", compliance: compliance({ matchedCardId: "a", rating: "green" }) })],
      ["b", ride({ dateISO: "2026-07-21", compliance: compliance({ matchedCardId: "b", rating: "green" }) })],
    ]);
    const summary = planFidelitySummary([inWindow, outside], doneRides, TODAY, 28);
    expect(summary.ratedCount).toBe(1);
  });

  it("liefert pct=0 ohne bewertbare Karten im Fenster (keine Karten insgesamt)", () => {
    const summary = planFidelitySummary([], new Map(), TODAY, 28);
    expect(summary.ratedCount).toBe(0);
    expect(summary.pct).toBe(0);
  });
});

describe("gapsChips", () => {
  it("nutzt einen festen generischen Text für Verpasst-Karten", () => {
    const missed = card({ id: "a", date: "2026-08-10" });
    const chips = gapsChips([missed], []);
    expect(chips[0].kind).toBe("missed");
    expect(chips[0].note).toBe("Keine passende Fahrt erfasst.");
  });

  it("nutzt card.cancelReason für Ausgefallen-Karten, wenn vorhanden", () => {
    const cancelled = card({ id: "a", date: "2026-08-10", cancelled: true, cancelReason: "Krank" });
    const chips = gapsChips([], [cancelled]);
    expect(chips[0].kind).toBe("cancelled");
    expect(chips[0].note).toBe("Grund: Krank");
  });

  it("fällt auf einen generischen Text zurück, wenn cancelReason fehlt", () => {
    const cancelled = card({ id: "a", date: "2026-08-10", cancelled: true });
    const chips = gapsChips([], [cancelled]);
    expect(chips[0].note).toBe("Ausgefallen.");
  });

  it("mischt Verpasst/Ausgefallen und sortiert neueste zuerst", () => {
    const missed = card({ id: "a", date: "2026-08-05" });
    const cancelled = card({ id: "b", date: "2026-08-12", cancelled: true });
    const chips = gapsChips([missed], [cancelled]);
    expect(chips.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("liefert eine leere Liste ohne Verpasst/Ausgefallen", () => {
    expect(gapsChips([], [])).toEqual([]);
  });
});
