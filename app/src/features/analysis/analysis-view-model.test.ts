import { describe, expect, it } from "vitest";
import {
  buildAerobicCards,
  buildAnalysisKpis,
  buildIntensityDistribution,
  buildLoadRows,
  buildPowerDiagnostics,
  buildRecordChips,
  buildTypDistribution,
} from "./analysis-view-model";

type Ride = import("../../types.js").Ride;

function ride(overrides: Partial<Ride>): Ride {
  return {
    dateISO: "2026-06-01",
    dateShort: "01.06",
    name: "Testfahrt",
    typ: "Z2 Dauer",
    km: 50,
    min: 120,
    ...overrides,
  } as Ride;
}

describe("buildAnalysisKpis", () => {
  it("aggregiert Distanz/Zeit/TSS über alle Fahrten", () => {
    const rides = [ride({ km: 50, min: 120, tss: 60 }), ride({ km: 30, min: 60, tss: 40 })];
    const kpis = buildAnalysisKpis(rides, 193, "2026-06-05");
    expect(kpis.find((k) => k.label === "Fahrten")?.value).toBe("2");
    expect(kpis.find((k) => k.label === "Distanz")?.value).toBe("80 km");
    expect(kpis.find((k) => k.label === "Gesamt TSS")?.value).toBe("100");
  });

  it("zeigt '–' ohne gemessene FTP, sonst den Wert in Watt", () => {
    const rides = [ride({})];
    expect(buildAnalysisKpis(rides, null, "2026-06-05").find((k) => k.label === "FTP (gemessen)")?.value).toBe("–");
    expect(buildAnalysisKpis(rides, 193, "2026-06-05").find((k) => k.label === "FTP (gemessen)")?.value).toBe("193W");
  });

  it("zeigt das Kadenz-Ziel nur bei eigenem Plan (Fahrten mit week)", () => {
    const withoutPlan = [ride({ week: undefined, kad: 82 })];
    const withPlan = [ride({ week: "2026-KW22", kad: 82 })];
    expect(buildAnalysisKpis(withoutPlan, null, "2026-06-05").find((k) => k.label === "Ø Kadenz")?.sub).toBeNull();
    expect(buildAnalysisKpis(withPlan, null, "2026-06-05").find((k) => k.label === "Ø Kadenz")?.sub).toMatch(/Ziel: 90/);
  });
});

describe("buildLoadRows", () => {
  it("liefert leere Liste ohne Fahrten", () => {
    expect(buildLoadRows([])).toEqual([]);
  });

  it("gruppiert nach ISO-Kalenderwoche und hängt Label/Detail an", () => {
    const rides = [
      ride({ dateISO: "2026-06-01", tss: 50 }),
      ride({ dateISO: "2026-06-08", tss: 55 }),
    ];
    const rows = buildLoadRows(rides);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(typeof row.label).toBe("string");
      expect(typeof row.detail).toBe("string");
      expect(["ok", "caution", "high"]).toContain(row.risk);
    }
  });

  it("zeigt höchstens die letzten 8 Wochen", () => {
    const rides = Array.from({ length: 10 }, (_, i) =>
      ride({ dateISO: `2026-${String(1 + Math.floor(i / 4)).padStart(2, "0")}-${String(1 + (i % 4) * 7).padStart(2, "0")}`, tss: 40 }),
    );
    expect(buildLoadRows(rides).length).toBeLessThanOrEqual(8);
  });
});

describe("buildIntensityDistribution", () => {
  it("liefert null ohne jede Zonen- oder IF-Datengrundlage", () => {
    expect(buildIntensityDistribution([ride({ km: 0, min: 0 })])).toBeNull();
  });

  it("bevorzugt echte Zeit-in-Zone-Daten vor der IF-Näherung", () => {
    const rides = [ride({ zoneTimes: [1000, 2000, 500, 300, 100] })];
    const dist = buildIntensityDistribution(rides);
    expect(dist?.source).toBe("zoneTimes");
    expect(dist?.representative).toBe(true);
    expect(dist?.shapeLabel).not.toBeNull();
  });

  it("markiert die IF-Näherung als nicht repräsentativ bei geringer Abdeckung", () => {
    const rides = [
      ride({ np: 150, ftpWatt: 200, min: 90 }),
      ...Array.from({ length: 5 }, () => ride({ np: undefined, ftpWatt: undefined })),
    ];
    const dist = buildIntensityDistribution(rides);
    expect(dist?.source).toBe("if");
    expect(dist?.representative).toBe(false);
    expect(dist?.shapeLabel).toBeNull();
    expect(dist?.note).toMatch(/fehlen noch Zeit-in-Zone-Daten/);
  });
});

describe("buildTypDistribution", () => {
  it("summiert km je Typ, sortiert absteigend, Anteil in Prozent", () => {
    const rides = [
      ride({ typ: "Sweet Spot", km: 60 }),
      ride({ typ: "Z2 Dauer", km: 40 }),
      ride({ typ: "Sweet Spot", km: 30 }),
    ];
    const rows = buildTypDistribution(rides);
    expect(rows[0].typ).toBe("Sweet Spot");
    expect(rows[0].count).toBe(2);
    expect(rows[0].km).toBe(90);
    expect(rows[0].pct).toBeCloseTo((90 / 130) * 100, 5);
    expect(rows[0].color).toBe("#e08a3c");
  });

  it("fällt bei unbekanntem Typ auf Grau zurück, bei fehlendem Typ auf 'Sonstige'", () => {
    const rows = buildTypDistribution([ride({ typ: "Neuer Typ" }), ride({ typ: undefined })]);
    const unknown = rows.find((r) => r.typ === "Neuer Typ");
    const missing = rows.find((r) => r.typ === "Sonstige");
    expect(unknown?.color).toBe("#6b7280");
    expect(missing).toBeDefined();
  });
});

describe("buildAerobicCards", () => {
  it("liefert 'empty'-Text je Karte ohne ausreichende Datenbasis", () => {
    const cards = buildAerobicCards([ride({ typ: "Sweet Spot", min: 30 })], true);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.title)).toEqual(["Effizienzfaktor", "HF-Decoupling", "Kadenz-Ökonomie"]);
    for (const c of cards) {
      expect(c.empty).toBeTruthy();
      expect(c.value).toBeUndefined();
    }
  });

  it("Effizienzfaktor: Wert + Delta-Farbe aus vergleichbaren Z2-Fahrten", () => {
    const rides = [
      ride({ dateISO: "2026-06-01", typ: "Z2 Dauer", min: 90, efficiency: 1.4 }),
      ride({ dateISO: "2026-06-08", typ: "Z2 Dauer", min: 90, efficiency: 1.5 }),
      ride({ dateISO: "2026-06-15", typ: "Z2 Dauer", min: 90, efficiency: 1.6 }),
    ];
    const [ef] = buildAerobicCards(rides, true);
    expect(ef.unit).toBe("W/bpm");
    expect(ef.value).toBeDefined();
    expect(ef.subs?.[0].text).toMatch(/vergleichbare Z2-Fahrten/);
  });

  it("HF-Decoupling: stabil (<5%) grün, sonst orange", () => {
    const rides = Array.from({ length: 5 }, (_, i) =>
      ride({ dateISO: `2026-06-${String(1 + i).padStart(2, "0")}`, typ: "Z2 Dauer", min: 90, decoupling: 3 })
    );
    const [, dc] = buildAerobicCards(rides, true);
    expect(dc.valueColor).toBe("var(--z1, #4a9a6e)");
  });

  it("Kadenz-Ökonomie: Zielformulierung hängt von ownPlan ab", () => {
    const rides = [ride({ kad: 92 }), ride({ kad: 88 }), ride({ kad: 95 })];
    const withPlan = buildAerobicCards(rides, true)[2];
    const withoutPlan = buildAerobicCards(rides, false)[2];
    expect(withPlan.subs?.[0].text).toMatch(/Ziel 90/);
    expect(withoutPlan.subs?.[0].text).toMatch(/≥ 90 RPM/);
    expect(withoutPlan.subs?.[0].text).not.toMatch(/Ziel/);
  });
});

describe("buildPowerDiagnostics", () => {
  it("FTP-Dreiklang bleibt strikt getrennt: gemessen ≠ geschätzt ≠ Ziel", () => {
    const rides = [ride({ dateISO: "2026-06-01", eftp: 195 })];
    const d = buildPowerDiagnostics({
      rides,
      wellness: [],
      weight: 80,
      ftpMeasured: 193,
      ftpMeasuredDate: "2026-06-12",
      ftpGoal: 210,
      ownPlan: true,
      retestDateISO: "2026-09-19",
    });
    expect(d.rows.map((r) => r.value)).toEqual([193, 195, 210]);
    expect(d.rows[0].wkgLabel).toMatch(/W\/kg/);
    expect(d.weightNote).toMatch(/80/);
  });

  it("Retest-Prognose (ownPlan) nur ab 3 eFTP-Punkten, sonst 'note'", () => {
    const oneRide = [ride({ dateISO: "2026-06-01", eftp: 195 })];
    const early = buildPowerDiagnostics({
      rides: oneRide,
      wellness: [],
      weight: null,
      ftpMeasured: 193,
      ftpMeasuredDate: null,
      ftpGoal: 210,
      ownPlan: true,
      retestDateISO: "2026-09-19",
    });
    expect(early.forecast?.kind).toBe("note");

    const threeRides = [
      ride({ dateISO: "2026-06-01", eftp: 195 }),
      ride({ dateISO: "2026-06-08", eftp: 197 }),
      ride({ dateISO: "2026-06-15", eftp: 199 }),
    ];
    const withHistory = buildPowerDiagnostics({
      rides: threeRides,
      wellness: [],
      weight: null,
      ftpMeasured: 193,
      ftpMeasuredDate: null,
      ftpGoal: 210,
      ownPlan: true,
      retestDateISO: "2026-09-19",
    });
    expect(withHistory.forecast?.kind).toBe("line");
    expect(withHistory.forecast?.segments.some((s) => s.strong)).toBe(true);
  });

  it("ohne ownPlan: Ziel-Horizont-Prognose statt Retest-Termin", () => {
    const rides = [
      ride({ dateISO: "2026-06-01", eftp: 250 }),
      ride({ dateISO: "2026-06-08", eftp: 255 }),
      ride({ dateISO: "2026-06-15", eftp: 260 }),
    ];
    const d = buildPowerDiagnostics({
      rides,
      wellness: [],
      weight: null,
      ftpMeasured: 265,
      ftpMeasuredDate: "2026-06-24",
      ftpGoal: 280,
      ownPlan: false,
      retestDateISO: "2026-09-19",
    });
    expect(d.rows[2].meta).toBe("ohne Termin");
    expect(d.forecast?.kind).toBe("line");
  });
});

describe("buildRecordChips", () => {
  it("liefert Bestwerte inkl. Ablöse-Historie-Zähler", () => {
    const rides = [
      ride({ dateISO: "2026-06-01", km: 60 }),
      ride({ dateISO: "2026-06-08", km: 90 }),
    ];
    const chips = buildRecordChips(rides);
    const longest = chips.find((c) => c.key === "km");
    expect(longest?.value).toBe("90,0");
    expect(longest?.historyCount).toBe(1);
  });

  it("liefert leere Liste ohne Fahrten", () => {
    expect(buildRecordChips([])).toEqual([]);
  });
});
