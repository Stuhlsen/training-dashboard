import { describe, expect, it } from "vitest";
import {
  buildAnalysisKpis,
  buildIntensityDistribution,
  buildLoadRows,
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
