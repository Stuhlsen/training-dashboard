/* Tests: Hero-Datenzusammensetzung (hero-view-model.ts). Prüft die
   Verdrahtung selbst (welcher core-Baustein bekommt welchen Wert) — die
   Berechnungen dahinter sind bereits in core/*.test.js abgedeckt. */

import { describe, expect, it } from "vitest";
import { buildHeroMetrics, buildHeroViewModel, type HeroViewModelInput } from "./hero-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

function planCard(overrides: Partial<PlanCard>): PlanCard {
  return {
    id: "card-1",
    date: "2026-07-24",
    sortOrder: 0,
    name: "Sweet Spot",
    typ: "Sweet Spot",
    km: 35,
    durationMin: 60,
    tssPlanned: 70,
    week: "2026-KW30",
    phase: "Sweet Spot",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const BASE_INPUT: HeroViewModelInput = {
  athleteId: "athlete1",
  rides: [
    { dateISO: "2026-07-20", date: "2026-07-20", ctl: 40, atl: 45, week: "2026-KW29", phase: "Sweet Spot" },
    { dateISO: "2026-07-22", date: "2026-07-22", ctl: 42, atl: 50, week: "2026-KW30", phase: "Erholung" },
  ] as Ride[],
  wellness: [] as WellnessDay[],
  forecast: {},
  planCards: [],
  subjective: null,
  todayISO: "2026-07-23",
  whatIfFtp: 210,
};

describe("buildHeroViewModel", () => {
  it("ohne Readiness-Baseline (< 10 Wellness-Tage): RHR/HRV zeigen '–', Briefing bleibt trotzdem eine gültige Ampel", () => {
    const vm = buildHeroViewModel(BASE_INPUT);
    expect(vm.briefing.rhr).toBe("–");
    expect(vm.briefing.hrv).toBe("–");
    expect(["green", "yellow", "red"]).toContain(vm.briefing.level);
  });

  it("Ring-Prozente Athlet 1: Basis ist seasonStartFtp, Fallback-eFTP aus der Config ohne eftp-Historie", () => {
    const vm = buildHeroViewModel(BASE_INPUT);
    // athlete1: seasonStartFtp 166, ftpGoal 210, ftpMeasured 193, eFTP-Fallback 199
    expect(vm.eftp.value).toBe(199);
    expect(vm.eftp.progress).toBeCloseTo((199 - 166) / (210 - 166));
    expect(vm.ramp.value).toBe(193);
    expect(vm.ramp.progress).toBeCloseTo((193 - 166) / (210 - 166));
    // eFTP (199) > ramp (193) → eFTP bleibt der große, akzentuierte Ring.
    expect(vm.ftpPrimary).toBe("eftp");
  });

  it("ftp_history: ein gültiger ramp-test-Eintrag überschreibt athleteCfg.ftpMeasured (22.08.2026-Bug — Hero ignorierte ftp_history komplett)", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      ftpHistoryEntries: [
        { id: "1", ftpWatt: 205, validFrom: "2026-07-01", source: "ramp-test", note: null },
      ],
    });
    expect(vm.ramp.value).toBe(205);
    expect(vm.ramp.date).toBe("2026-07-01");
    // 205 (ramp) > 199 (eFTP-Fallback) → jetzt der Ramp-Ring vorn.
    expect(vm.ftpPrimary).toBe("ramp");
  });

  it("ftp_history: Eintrag NACH todayISO gilt noch nicht → Fallback auf athleteCfg.ftpMeasured", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      ftpHistoryEntries: [
        { id: "1", ftpWatt: 205, validFrom: "2026-08-01", source: "ramp-test", note: null },
      ],
    });
    expect(vm.ramp.value).toBe(193);
  });

  it("ftp_history: nur source \"ramp-test\" zählt, \"schaetzung\" wird ignoriert (analog export-briefing-view-model.ts)", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      ftpHistoryEntries: [
        { id: "1", ftpWatt: 250, validFrom: "2026-07-01", source: "schaetzung", note: null },
      ],
    });
    expect(vm.ramp.value).toBe(193);
  });

  it("Ring-Prozente Athlet 2: keine eigene Saisonbasis → Ringbasis fällt auf ftpMeasured zurück", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      athleteId: "athlete2",
      rides: [{ dateISO: "2026-07-22", date: "2026-07-22", eftp: 270 }] as Ride[],
    });
    // athlete2: seasonStartFtp null, ftpMeasured 265, ftpGoal 280
    expect(vm.eftp.value).toBe(270);
    expect(vm.eftp.progress).toBeCloseTo((270 - 265) / (280 - 265));
    expect(vm.ramp.value).toBe(265);
    expect(vm.ramp.progress).toBe(0); // ramp === base
  });

  it("Milestones spiegeln buildMilestones() 1:1 (4 Zeilen bei vollständiger Config)", () => {
    const vm = buildHeroViewModel(BASE_INPUT);
    expect(vm.milestones.map((m) => m.label)).toEqual(["Start-FTP", "Ramp-Test", "Aktuelle eFTP", "Saisonziel"]);
  });

  it("Session: keine Plankarten → session null", () => {
    const vm = buildHeroViewModel(BASE_INPUT);
    expect(vm.session).toBe(null);
  });

  it("Session: nächste fällige Karte wird gefunden", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [planCard({ date: "2026-07-24" })],
    });
    expect(vm.session).not.toBe(null);
    expect(vm.session?.label).toBe("Sweet Spot");
  });

  it("Session: Ruhetag heute → Vorschau der nächsten echten Einheit statt Leertext", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [
        planCard({ date: "2026-07-23", typ: "Ruhetag", name: "Ruhetag", details: "Bewusst frei · kein Training geplant" }),
        planCard({ date: "2026-07-25", typ: "Schwelle", name: "Schwelle 2×20" }),
      ],
    });
    expect(vm.session?.label).toBe("Ruhetag");
    expect(vm.session?.detailParts[0]).toContain("Nächste Einheit:");
    expect(vm.session?.detailParts[0]).toContain("Schwelle 2×20");
  });

  it("Session: Ruhetag ohne weitere geplante Einheit → Fallback auf details-Text", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [planCard({ date: "2026-07-23", typ: "Ruhetag", name: "Ruhetag", details: "Bewusst frei · kein Training geplant" })],
    });
    expect(vm.session?.detailParts).toEqual(["Bewusst frei · kein Training geplant"]);
  });

  it("Session: strukturiertes Intervall-Workout liefert Segment-Balken + Warmup/Cooldown-Watt-Schätzung", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [
        planCard({
          date: "2026-07-24",
          typ: "Schwelle",
          name: "Schwelle 3×10",
          workout: { pct: [95, 105], warmup: 10, intervals: 3, duration: 10, rest: 5, cooldown: 10 },
        }),
      ],
    });
    // ftpMeasured (Athlet 1) = 193 W → 95/105 % davon gerundet
    expect(vm.session?.interval?.wattRange).toEqual([183, 203]);
    // Warmup/Cooldown-Watt sind Schätzungen (60/50 % FTP, TSS_ASSUMED_IF) —
    // im Plan nicht einzeln hinterlegt.
    expect(vm.session?.interval?.warmupLabel).toBe("10' · ~116 W");
    expect(vm.session?.interval?.cooldownLabel).toBe("10' · ~97 W");
    expect(vm.session?.interval?.segments.length).toBeGreaterThan(0);
    expect(vm.session?.chips).toEqual(["~60 min gesamt", "TSS ~64", "Pause 2× 5 min · ~97 W"]);
    expect(vm.session?.detailParts[0]).toBe("Watt bei Warmup/Pause/Cooldown geschätzt (60/50 % FTP) — im Plan nicht einzeln hinterlegt.");
  });

  it("Session: workout ohne intervals/duration (reine Z2-Fahrt) → Watt-Range als Chip, kein Segment-Balken", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [
        planCard({
          date: "2026-07-24",
          typ: "Z2 Lang",
          name: "Z2 Lang",
          workout: { pct: [70, 80] },
          details: "Lange Z2 · HF 123–152 bpm · ≥3h anstreben",
        }),
      ],
    });
    expect(vm.session?.interval).toBe(null);
    expect(vm.session?.chips[0]).toBe("135–154 W");
    expect(vm.session?.detailParts).toEqual(["Lange Z2 · HF 123–152 bpm · ≥3h anstreben"]);
  });

  it("Session: kein workout-Objekt → Dauer/TSS-Chips aus den Plankarten-Feldern statt geparstem Freitext", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [
        planCard({
          date: "2026-07-24",
          typ: "Gruppenfahrt",
          name: "Gruppenfahrt",
          workout: null,
          durationMin: 150,
          tssPlanned: 95,
          details: "Gruppenfahrt Di · HF frei",
        }),
      ],
    });
    expect(vm.session?.interval).toBe(null);
    expect(vm.session?.chips).toEqual(["~150 min", "TSS 95"]);
    expect(vm.session?.detailParts).toEqual(["Gruppenfahrt Di · HF frei"]);
  });

  it("Wetter heute: kommt aus forecast[todayISO], nicht aus dem Session-Datum", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      planCards: [planCard({ date: "2026-07-24" })],
      forecast: {
        "2026-07-23": { weatherCode: 1, temp: 19, tempFeel: 18, precipProb: 10, windSpeed: 11, windDir: 225 },
        "2026-07-24": { weatherCode: 61, temp: 12, precipProb: 90 },
      },
    });
    expect(vm.weatherToday?.tempLabel).toBe("19°C");
    expect(vm.weatherToday?.feelsLabel).toBe("18°C");
    expect(vm.weatherToday?.rainLabel).toBe("10%");
    expect(vm.weatherToday?.windLabel).toBe("11 km/h SW");
  });

  it("Wetter heute: ohne Forecast-Eintrag für todayISO → null, kein Fallback auf andere Tage", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      forecast: { "2026-07-24": { weatherCode: 1, temp: 19 } },
    });
    expect(vm.weatherToday).toBe(null);
  });

  it("Leistungsskala: 5 Coggan-Segmente, Sweet-Spot-Overlay und Ziel-Pin vorhanden", () => {
    const vm = buildHeroViewModel(BASE_INPUT);
    expect(vm.powerScale.segments).toHaveLength(5);
    expect(vm.powerScale.sweetSpot).not.toBe(null);
    expect(vm.powerScale.pins.some((p) => p.kind === "goal")).toBe(true);
  });

  it("Leistungsskala-Pins: ramp/eftp/goal je einmal vertreten, wenn eFTP vom Ramp-Wert abweicht", () => {
    const vm = buildHeroViewModel({
      ...BASE_INPUT,
      rides: [...BASE_INPUT.rides, { dateISO: "2026-07-22", date: "2026-07-22", eftp: 205 } as Ride],
    });
    expect(vm.powerScale.pins.map((p) => p.kind).sort()).toEqual(["eftp", "goal", "ramp"]);
  });
});

describe("buildHeroMetrics", () => {
  const metricRides = [
    { dateISO: "2026-07-20", date: "2026-07-20", km: 40, min: 90, kmh: 26.7, ctl: 40, hf: 140, kad: 85 },
    { dateISO: "2026-07-22", date: "2026-07-22", km: 60, min: 130, kmh: 27.7, ctl: 42, hf: 150, kad: 88, week: "2026-KW30" },
  ] as Ride[];
  const ramp = { value: 193, progress: 0.6, date: "2026-06-12" };
  const eftp = { value: 199, progress: 0.7 };

  it("Grundwerte: Gesamtdistanz, Fahrten, Trainingszeit, Ø Tempo aus den Ist-Fahrten", () => {
    const metrics = buildHeroMetrics(metricRides, ramp, eftp);
    const byLabel = Object.fromEntries(metrics.map((m) => [m.label, m.value]));
    expect(byLabel["Gesamtdistanz"]).toBe("100 km");
    expect(byLabel["Fahrten"]).toBe(2);
    expect(byLabel["Trainingszeit"]).toBe("3:40h");
    expect(byLabel["Ø Tempo"]).toBe("27,2 km/h");
  });

  it("FTP-Kachel übernimmt ramp.value/ramp.date 1:1 (kein zweiter ftpValue()-Aufruf)", () => {
    const metrics = buildHeroMetrics(metricRides, ramp, eftp);
    const ftpTile = metrics.find((m) => m.label === "FTP (Ramp Test)");
    expect(ftpTile?.value).toBe("193W");
    expect(ftpTile?.desc).toContain("12.06.2026");
  });

  it("FTP-Kachel ohne ramp.value: '–' statt '0W'", () => {
    const metrics = buildHeroMetrics(metricRides, { value: 0, progress: 0, date: null }, eftp);
    expect(metrics.find((m) => m.label === "FTP (Ramp Test)")?.value).toBe("–");
  });

  it("eFTP-Kachel nur bei truthy eftp.value, Beschreibung athletenabhängig (ownPlan aus rides.week)", () => {
    const withPlan = buildHeroMetrics(metricRides, ramp, eftp);
    expect(withPlan.find((m) => m.label === "eFTP (Intervals.icu)")?.desc).toContain("besten Leistungen");

    const withoutPlan = buildHeroMetrics(
      metricRides.map((r) => ({ ...r, week: undefined })) as Ride[],
      ramp,
      eftp,
    );
    expect(withoutPlan.find((m) => m.label === "eFTP (Intervals.icu)")?.desc).toContain("Vergleichsdaten");

    const noEftp = buildHeroMetrics(metricRides, ramp, { value: 0, progress: 0 });
    expect(noEftp.find((m) => m.label === "eFTP (Intervals.icu)")).toBeUndefined();
  });

  it("CTL Peak / Längste Fahrt / Ø HF / Ø Kadenz aus den passenden Feldern", () => {
    const metrics = buildHeroMetrics(metricRides, ramp, eftp);
    const byLabel = Object.fromEntries(metrics.map((m) => [m.label, m.value]));
    expect(byLabel["CTL Peak"]).toBe("42");
    expect(byLabel["Längste Fahrt"]).toBe("60,0 km");
    expect(byLabel["Ø Herzfrequenz"]).toBe("145 bpm");
    expect(byLabel["Ø Kadenz"]).toBe("87 RPM");
  });
});
