import { describe, expect, it } from "vitest";
import {
  accessorySteps,
  actualWeatherColor,
  buildDoneCompareRows,
  buildPlanningSections,
  complianceRuleText,
  fmtMinSec,
  isNonTrainingCard,
  isRestDay,
  isRecoveryType,
  isZ2Type,
  latestWellness,
  legacyWorkoutSegments,
  matchRideForCard,
  nextLoadAfter,
  planTypeTermKey,
  resolvePlanningFtp,
  typeColor,
  typeIcon,
  uvLabel,
  visibleCompliance,
  weatherBadgeColor,
  z2Estimate,
} from "./planning-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = "2026-07-22";

function card(overrides: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: "Session",
    typ: "Z2 Dauer",
    km: null,
    durationMin: null,
    tssPlanned: null,
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

function ride(dateISO: string): Ride {
  return { dateISO } as Ride;
}

describe("typeColor/typeIcon", () => {
  it("liefert für einen bekannten Typ dessen Farbe/Icon", () => {
    expect(typeColor("Sweet Spot")).toBe("#e08a3c");
    expect(typeIcon("Sweet Spot")).toBe("⚡");
  });

  it("fällt für einen unbekannten/fehlenden Typ auf den Default zurück", () => {
    expect(typeColor("Unbekannt")).toBe("#6b7280");
    expect(typeIcon(null)).toBe("📅");
  });
});

describe("planTypeTermKey", () => {
  it("bildet Trainingslehre-Typen auf Glossar-Keys ab", () => {
    expect(planTypeTermKey("Sweet Spot")).toBe("sweet-spot");
    expect(planTypeTermKey("VO2max")).toBe("vo2max");
    expect(planTypeTermKey("Schwelle")).toBe("z4");
    expect(planTypeTermKey("Z2 Dauer")).toBe("z2");
    expect(planTypeTermKey("Z1 Recovery")).toBe("z1");
  });

  it("liefert null für organisatorische Typen und Unbekanntes", () => {
    expect(planTypeTermKey("Gruppenfahrt")).toBeNull();
    expect(planTypeTermKey("Notiz")).toBeNull();
    expect(planTypeTermKey(null)).toBeNull();
  });
});

describe("isRestDay", () => {
  it("erkennt nur typ 'Ruhetag'", () => {
    expect(isRestDay(card({ id: "a", date: "2026-07-22", typ: "Ruhetag" }))).toBe(true);
    expect(isRestDay(card({ id: "b", date: "2026-07-22", typ: "Z2 Dauer" }))).toBe(false);
  });
});

describe("isNonTrainingCard", () => {
  it("umfasst Ruhetag UND Notiz, sonst nichts", () => {
    expect(isNonTrainingCard(card({ id: "a", date: "2026-07-22", typ: "Ruhetag" }))).toBe(true);
    expect(isNonTrainingCard(card({ id: "b", date: "2026-07-22", typ: "Notiz" }))).toBe(true);
    expect(isNonTrainingCard(card({ id: "c", date: "2026-07-22", typ: "Z2 Dauer" }))).toBe(false);
  });
});

describe("buildPlanningSections", () => {
  it("teilt Karten in ausstehend/absolviert/verpasst/ausgefallen", () => {
    const cards = [
      card({ id: "future", date: "2026-07-25" }), // ausstehend
      card({ id: "done", date: "2026-07-20" }), // hat einen Ride → absolviert
      card({ id: "missed", date: "2026-07-18" }), // vergangen, kein Ride → verpasst
      card({ id: "cancelled", date: "2026-07-19", cancelled: true }), // ausgefallen
    ];
    const sections = buildPlanningSections(cards, [ride("2026-07-20")], TODAY);

    expect(sections.weeks.flatMap((w) => w.cards.map((c) => c.id))).toEqual(["future"]);
    expect(sections.done.map((c) => c.id)).toEqual(["done"]);
    expect(sections.missed.map((c) => c.id)).toEqual(["missed"]);
    expect(sections.cancelled.map((c) => c.id)).toEqual(["cancelled"]);
  });

  it("zählt eine verpasste Ruhetag-Karte nie als 'verpasst'", () => {
    const cards = [card({ id: "rest", date: "2026-07-18", typ: "Ruhetag" })];
    expect(buildPlanningSections(cards, [], TODAY).missed).toEqual([]);
  });

  it("eine vergangene Notiz-Karte ist weder 'verpasst' noch Teil der Fortschrittsquote", () => {
    const cards = [
      card({ id: "sess", date: "2026-07-18" }), // vergangene echte Einheit ohne Ride → verpasst
      card({ id: "notiz", date: "2026-07-18", typ: "Notiz", name: "Ausrüstung checken" }),
    ];
    const { missed, stats } = buildPlanningSections(cards, [], TODAY);
    expect(missed.map((c) => c.id)).toEqual(["sess"]);
    expect(stats.totalSessions).toBe(1); // nur "sess", die Notiz-Karte zählt nicht mit
  });

  it("hält eine verschobene Karte ausstehend, wenn ihr neues Datum noch in der Zukunft liegt", () => {
    const cards = [card({ id: "moved", date: "2026-07-30", originalDate: "2026-07-10" })];
    const sections = buildPlanningSections(cards, [], TODAY);
    expect(sections.weeks.flatMap((w) => w.cards.map((c) => c.id))).toEqual(["moved"]);
  });

  it("zählt eine verschobene Karte als 'verpasst', wenn auch ihr neues Datum vergangen ist", () => {
    const cards = [card({ id: "moved-past", date: "2026-07-18", originalDate: "2026-07-10" })];
    const sections = buildPlanningSections(cards, [], TODAY);
    expect(sections.missed.map((c) => c.id)).toEqual(["moved-past"]);
    expect(sections.weeks.flatMap((w) => w.cards.map((c) => c.id))).toEqual([]);
  });

  it("zählt Ruhetage weder im Zähler noch im Nenner der Fortschrittsquote", () => {
    const cards = [
      card({ id: "done1", date: "2026-07-20", typ: "Sweet Spot" }),
      card({ id: "done-rest", date: "2026-07-21", typ: "Ruhetag" }), // gefahrener Ruhetag
      card({ id: "pending", date: "2026-07-25", typ: "Schwelle" }),
    ];
    const { stats } = buildPlanningSections(cards, [ride("2026-07-20"), ride("2026-07-21")], TODAY);
    expect(stats.totalSessions).toBe(2); // nur done1 + pending, kein Ruhetag
    expect(stats.doneCount).toBe(1);
    expect(stats.pct).toBe(50);
  });

  it("gruppiert ausstehende Karten nach Woche und erkennt Erholungswochen", () => {
    const cards = [
      card({ id: "a", date: "2026-07-27", week: "2026-KW31", phase: "Erholung", typ: "Ruhetag" }),
      card({ id: "b", date: "2026-07-28", week: "2026-KW31", phase: "Erholung", typ: "Z1 Recovery" }),
      card({ id: "c", date: "2026-08-03", week: "2026-KW32", phase: "Sweet Spot", typ: "Sweet Spot" }),
    ];
    const { weeks } = buildPlanningSections(cards, [], TODAY);
    expect(weeks.find((w) => w.week === "2026-KW31")?.isRecoveryWeek).toBe(true);
    expect(weeks.find((w) => w.week === "2026-KW32")?.isRecoveryWeek).toBe(false);
  });

  it("liefert bei leerer Kartenliste leere Sektionen und pct 0", () => {
    const { weeks, done, missed, cancelled, stats } = buildPlanningSections([], [], TODAY);
    expect(weeks).toEqual([]);
    expect(done).toEqual([]);
    expect(missed).toEqual([]);
    expect(cancelled).toEqual([]);
    expect(stats.pct).toBe(0);
    expect(stats.totalSessions).toBe(0);
  });
});

describe("resolvePlanningFtp", () => {
  it("nutzt ftpMeasured aus der Athleten-Konfiguration, wenn bekannt", () => {
    expect(resolvePlanningFtp("athlete1", null)).toBe(193);
    expect(resolvePlanningFtp("athlete2", 999)).toBe(265); // Config sticht vor JSON-Wert
  });

  it("fällt bei unbekanntem Athlet auf den JSON-Wert, sonst auf undefined", () => {
    expect(resolvePlanningFtp("unknown", 250)).toBe(250);
    expect(resolvePlanningFtp("unknown", null)).toBeUndefined();
  });
});

describe("matchRideForCard", () => {
  const c = card({ id: "a", date: "2026-07-20" });

  it("filtert bei editierbarem Athlet zusätzlich auf dataSource intervals", () => {
    const rides = [
      { dateISO: "2026-07-20", dataSource: "notion" } as Ride,
      { dateISO: "2026-07-20", dataSource: "intervals" } as Ride,
    ];
    expect(matchRideForCard(rides, c, true)?.dataSource).toBe("intervals");
  });

  it("nimmt bei read-only-Ansicht den ersten Treffer nach Datum, ohne dataSource-Filter", () => {
    const rides = [{ dateISO: "2026-07-20", dataSource: "notion" } as Ride];
    expect(matchRideForCard(rides, c, false)?.dataSource).toBe("notion");
  });

  it("liefert null ohne Treffer", () => {
    expect(matchRideForCard([], c, true)).toBeNull();
  });

  it("bindet am 3-Fahrten-Renntag die Renn-Fahrt, nicht das Einrollen", () => {
    const raceCard = card({ id: "gfny", date: "2026-08-30", typ: "Race" });
    const rides = [
      { dateISO: "2026-08-30", dataSource: "intervals", typ: "Einrollen", tss: 8, min: 20 },
      { dateISO: "2026-08-30", dataSource: "intervals", typ: "Race", tss: 210, min: 160 },
      { dateISO: "2026-08-30", dataSource: "intervals", typ: "Ausrollen", tss: 4, min: 15 },
    ] as Ride[];
    expect(matchRideForCard(rides, raceCard, false)?.typ).toBe("Race");
    expect(matchRideForCard(rides, raceCard, true)?.typ).toBe("Race");
  });

  it("liefert null an einem Tag mit ausschließlich Einrollen/Ausrollen", () => {
    const rides = [
      { dateISO: "2026-07-20", dataSource: "intervals", typ: "Ausrollen", tss: 5, min: 10 },
    ] as Ride[];
    expect(matchRideForCard(rides, c, true)).toBeNull();
  });
});

describe("visibleCompliance", () => {
  it("nur sichtbar bei exaktem Karten-Match mit mindestens einem Intervall", () => {
    const ride = {
      dateISO: "2026-07-20",
      compliance: { matchedCardId: "a", matched: [{}], rating: "green" },
    } as unknown as Ride;
    expect(visibleCompliance(ride, "a")).not.toBeNull();
    expect(visibleCompliance(ride, "other")).toBeNull();
  });

  it("null ohne compliance-Feld oder leerem matched-Array", () => {
    expect(visibleCompliance({ dateISO: "2026-07-20" } as Ride, "a")).toBeNull();
    const empty = {
      dateISO: "2026-07-20",
      compliance: { matchedCardId: "a", matched: [] },
    } as unknown as Ride;
    expect(visibleCompliance(empty, "a")).toBeNull();
  });
});

describe("weatherBadgeColor", () => {
  const base = { temp: 20, tempFeel: 20, windSpeed: 10, windDir: 180, precipProb: 10, uvMax: 3, weatherCode: 1 };

  it("grün ohne auffällige Werte", () => {
    expect(weatherBadgeColor(base)).toBe("var(--ok)");
  });

  it("gold bei genau einem Schwellwert", () => {
    expect(weatherBadgeColor({ ...base, windSpeed: 35 })).toBe("var(--warn)");
  });

  it("rot bei Hitze oder mindestens zwei Schwellwerten", () => {
    expect(weatherBadgeColor({ ...base, temp: 33 })).toBe("var(--danger)");
    expect(weatherBadgeColor({ ...base, windSpeed: 35, precipProb: 60 })).toBe("var(--danger)");
  });
});

describe("uvLabel", () => {
  it("null ohne UV-Wert", () => {
    expect(uvLabel(null)).toBeNull();
  });

  it("stuft niedrig/mittel/hoch/sehr hoch korrekt ein", () => {
    expect(uvLabel(2)?.text).toContain("niedrig");
    expect(uvLabel(4)?.text).toContain("mittel");
    expect(uvLabel(7)?.text).toContain("(hoch)");
    expect(uvLabel(9)?.text).toContain("sehr hoch");
    expect(uvLabel(9)?.color).toBe("var(--danger)");
  });
});

describe("legacyWorkoutSegments", () => {
  it("baut Segmente aus dem alten Zahlenformat inkl. Watt-Zeile", () => {
    const result = legacyWorkoutSegments({
      label: "4x8min SS",
      intervals: 4,
      duration: 8,
      warmup: 10,
      rest: 3,
      cooldown: 10,
      watts: [160, 185],
    });
    expect(result).not.toBeNull();
    expect(result?.segments.filter((s) => s.type === "interval")).toHaveLength(4);
    expect(result?.segments.filter((s) => s.type === "rest")).toHaveLength(3); // n-1 Pausen
    expect(result?.wattsLine).toBe("160–185W · Ziel: 173W");
    expect(result?.totalMin).toBe(10 + 8 * 4 + 3 * 3 + 10);
  });

  it("null für das neue Block-Format", () => {
    expect(legacyWorkoutSegments({ blocks: [{ type: "interval", text: "4x8'" }] })).toBeNull();
  });

  it("null ohne intervals/duration", () => {
    expect(legacyWorkoutSegments({ label: "Freitext" })).toBeNull();
    expect(legacyWorkoutSegments(null)).toBeNull();
  });
});

describe("isZ2Type/isRecoveryType", () => {
  it("erkennt beide Z2-Typnamen", () => {
    expect(isZ2Type("Z2 Lang")).toBe(true);
    expect(isZ2Type("Z2 Dauer")).toBe(true);
    expect(isZ2Type("Sweet Spot")).toBe(false);
  });

  it("erkennt beide Recovery-Typnamen (Athlet 1 + Athlet 2)", () => {
    expect(isRecoveryType("Z1 Recovery")).toBe(true);
    expect(isRecoveryType("Z1")).toBe(true);
    expect(isRecoveryType("Z2 Dauer")).toBe(false);
  });
});

describe("z2Estimate", () => {
  it("berechnet Distanzbereich und Kalorien für Z2 Lang", () => {
    const est = z2Estimate({ typ: "Z2 Lang", km: 100 });
    expect(est).toEqual({ kmMin: 85, kmMax: 115, kcal: expect.any(Number), hours: expect.any(Number) });
  });

  it("null ohne km oder bei Nicht-Z2-Typ", () => {
    expect(z2Estimate({ typ: "Z2 Lang", km: null })).toBeNull();
    expect(z2Estimate({ typ: "Sweet Spot", km: 100 })).toBeNull();
  });
});

describe("latestWellness", () => {
  it("liefert den Tag mit dem jüngsten dateISO", () => {
    const wellness = [{ dateISO: "2026-07-18" }, { dateISO: "2026-07-20" }, { dateISO: "2026-07-19" }] as WellnessDay[];
    expect(latestWellness(wellness)?.dateISO).toBe("2026-07-20");
  });

  it("null bei leerer Liste", () => {
    expect(latestWellness([])).toBeNull();
  });
});

describe("nextLoadAfter", () => {
  it("findet die nächste Session mit workout nach dem gegebenen Datum", () => {
    const sessions = [
      { date: "2026-07-21", name: "Recovery", workout: undefined },
      { date: "2026-07-23", name: "Intervalle", workout: { label: "x" } },
      { date: "2026-07-30", name: "Später", workout: { label: "y" } },
    ];
    const next = nextLoadAfter(sessions, "2026-07-20");
    expect(next?.name).toBe("Intervalle");
    expect(next?.daysUntil).toBe(3);
  });

  it("null ohne passende künftige Session", () => {
    expect(nextLoadAfter([], "2026-07-20")).toBeNull();
  });
});

describe("fmtMinSec", () => {
  it("formatiert Sekunden als m:ss", () => {
    expect(fmtMinSec(125)).toBe("2:05");
    expect(fmtMinSec(59)).toBe("0:59");
  });

  it("liefert '–' ohne gültigen Wert", () => {
    expect(fmtMinSec(null)).toBe("–");
    expect(fmtMinSec(undefined)).toBe("–");
    expect(fmtMinSec(NaN)).toBe("–");
  });
});

describe("complianceRuleText", () => {
  it("übersetzt einen bekannten Regelcode", () => {
    expect(complianceRuleText("alle-intervalle-erfuellt")).toBe("alle Intervalle erfüllt");
  });

  it("fällt auf den Rohcode zurück", () => {
    expect(complianceRuleText("K-NEU")).toBe("K-NEU");
  });
});

describe("accessorySteps", () => {
  it("filtert nur Schritte mit kind 'accessory'", () => {
    const steps = accessorySteps({
      steps: [
        { kind: "set", reps: 4 },
        { kind: "accessory", reps: 6, work: { duration_s: 20, target: "Sprint" } },
      ],
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].work?.target).toBe("Sprint");
  });

  it("leeres Array ohne workoutStructure/steps", () => {
    expect(accessorySteps(null)).toEqual([]);
    expect(accessorySteps({})).toEqual([]);
  });
});

describe("actualWeatherColor", () => {
  it("grün ohne auffällige Werte", () => {
    expect(actualWeatherColor({ temp: 20, windSpeed: 10, precip: 0, weatherCode: 1 })).toBe("var(--ok)");
  });

  it("gold bei genau einem auffälligen Faktor (z.B. Regen)", () => {
    expect(actualWeatherColor({ temp: 20, windSpeed: 10, precip: 1, weatherCode: 61 })).toBe("var(--warn)");
  });

  it("rot bei Hitze allein oder zwei auffälligen Faktoren", () => {
    expect(actualWeatherColor({ temp: 33, windSpeed: 10, precip: 0, weatherCode: 1 })).toBe("var(--danger)");
    expect(actualWeatherColor({ temp: 20, windSpeed: 35, precip: 1, weatherCode: 61 })).toBe("var(--danger)");
  });
});

describe("buildDoneCompareRows", () => {
  const A1 = "athlete1"; // hrMax 201 in config.ts
  const FTP = 200;

  function doneRide(overrides: Partial<Ride> = {}): Ride {
    return { dateISO: "2026-08-06", ...overrides } as Ride;
  }

  /** Compliance-Objekt, das visibleCompliance() gegen `cardId` durchlässt. */
  function compliance(cardId: string, matched: Array<Record<string, unknown>>): RideCompliance {
    return {
      matchedCardId: cardId,
      plannedZoneTime_s: 0,
      actualZoneTime_s: 0,
      intervalsPlanned: matched.length,
      intervalsCompleted: matched.length,
      fadePct: 0,
      rating: "green",
      rule: "alle-intervalle-erfuellt",
      matched: matched.map((m) => ({
        kind: "set",
        fulfilled: true,
        plannedDurationS: 600,
        actualDurationS: 600,
        plannedWatts: 185,
        avgWatts: null,
        avgHr: null,
        startSec: null,
        endSec: null,
        ...m,
      })),
    } as RideCompliance;
  }

  it("06.08.-Fall: Plan Schwelle, tatsächlich Z2 Lang gefahren → Typ-Zeile mit Warnfarbe", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Schwelle", km: 60 });
    const r = doneRide({ typ: "Z2 Lang", km: 86 });
    const typRow = buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Typ");
    expect(typRow).toEqual({
      label: "Typ",
      icon: "🏷️",
      plan: "Schwelle",
      actual: "Z2 Lang",
      color: "var(--warn)",
    });
  });

  it("keine Typ-Zeile bei identischem Text", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Z2 Dauer" });
    const r = doneRide({ typ: "Z2 Dauer" });
    expect(buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Typ")).toBeUndefined();
  });

  it("keine Typ-Zeile bei Ruhetag (restDayRiddenSignal übernimmt das)", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Ruhetag" });
    const r = doneRide({ typ: "Z2 Dauer" });
    expect(buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Typ")).toBeUndefined();
  });

  it("Typ-Zeile ohne Farbe bei reiner Label-Nuance (gleiche Intensitätsklasse)", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Z2" });
    const r = doneRide({ typ: "Z2 Dauer" });
    const typRow = buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Typ");
    expect(typRow?.color).toBeUndefined();
  });

  it("Distanz (unstrukturiert): grün bei Übererfüllung, gold bei >15% Unterschreitung", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Z2 Dauer", km: 60 });
    const over = buildDoneCompareRows(c, doneRide({ km: 65 }), A1, FTP).find((row) => row.label === "Distanz");
    expect(over?.color).toBe("var(--ok)");
    const under = buildDoneCompareRows(c, doneRide({ km: 40 }), A1, FTP).find((row) => row.label === "Distanz");
    expect(under?.color).toBe("var(--warn)");
  });

  it("Distanz bei strukturierter Einheit nur Kontext: kein Plan, keine Farbe, kein Delta", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot", km: 40, workout: { watts: [200, 220] } });
    const row = buildDoneCompareRows(c, doneRide({ km: 55 }), A1, FTP).find((row) => row.label === "Distanz");
    expect(row).toMatchObject({ plan: "–", actual: "55,0 km" });
    expect(row?.color).toBeUndefined();
    expect(row?.extra).toBeUndefined();
  });

  it("Ø Watt ohne Compliance-Match: kein hartes Rot mehr — außerhalb der Range nur gold", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot", workout: { watts: [200, 220] } });
    const below = buildDoneCompareRows(c, doneRide({ watt: 190 }), A1, FTP).find((row) => row.label === "Ø Watt");
    expect(below?.color).toBe("var(--warn)");
    const above = buildDoneCompareRows(c, doneRide({ watt: 230 }), A1, FTP).find((row) => row.label === "Ø Watt");
    expect(above?.color).toBe("var(--warn)");
    const within = buildDoneCompareRows(c, doneRide({ watt: 210 }), A1, FTP).find((row) => row.label === "Ø Watt");
    expect(within?.color).toBe("var(--ok)");
  });

  it("Ø Watt mit Compliance-Match: Intervall-Schnitt gegen Intervall-Ziel-Band, Gesamt-Ø + NP als Kontext", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot", workout: { watts: [180, 190] } });
    const r = doneRide({
      watt: 141,
      np: 171,
      compliance: compliance("a", [
        { plannedWatts: 185, avgWatts: 210, actualDurationS: 600 },
        { plannedWatts: 185, avgWatts: 206, actualDurationS: 600 },
      ]),
    });
    const row = buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Ø Watt");
    expect(row?.plan).toBe("185 W"); // lo === hi → Einzelwert
    expect(row?.actual).toBe("208 W"); // (210·600 + 206·600) / 1200
    expect(row?.color).toBe("var(--ok)");
    expect(row?.extra).toBe("Ø 141 W · NP 171 W");
  });

  it("Ø Watt mit Compliance-Match, Intervall-Schnitt unter Ziel → gold, kein Rot", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot" });
    const r = doneRide({
      watt: 120,
      compliance: compliance("a", [{ plannedWatts: 200, avgWatts: 150, actualDurationS: 600 }]),
    });
    expect(buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Ø Watt")?.color).toBe("var(--warn)");
  });

  it("Dauer nutzt card.durationMin, bevor auf Workout-Summe/km-Schätzung zurückgefallen wird", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot", durationMin: 75 });
    const row = buildDoneCompareRows(c, doneRide({ min: 80 }), A1, FTP).find((row) => row.label === "Dauer");
    expect(row?.plan).toBe("75 min");
  });

  it("Dauer fällt bei Blockform-Workout (kein durationMin) auf die km-Schätzung zurück, nicht auf '–'", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot", km: 60, workout: { blocks: [{ type: "interval", text: "3x12min" }] } });
    const row = buildDoneCompareRows(c, doneRide({ min: 90 }), A1, FTP).find((row) => row.label === "Dauer");
    expect(row?.plan).toBe("~157 min");
  });

  it("Ø Watt liest card.workout.watts (ohne Compliance-Match) auch bei einem Workout mit blocks-Array", () => {
    const c = card({
      id: "a",
      date: "2026-08-06",
      typ: "Sweet Spot",
      workout: { blocks: [{ type: "interval", text: "x" }], watts: [200, 220] },
    });
    const row = buildDoneCompareRows(c, doneRide({ watt: 210 }), A1, FTP).find((row) => row.label === "Ø Watt");
    expect(row?.plan).toBe("200–220 W");
    expect(row?.color).toBe("var(--ok)");
  });

  it("Puls ohne Compliance-Match: nur Ist-Wert, kein Band, keine Farbe", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Z2 Dauer" });
    const row = buildDoneCompareRows(c, doneRide({ hf: 140 }), A1, FTP).find((row) => row.label === "Puls");
    expect(row).toMatchObject({ plan: "–", actual: "140 bpm" });
    expect(row?.color).toBeUndefined();
  });

  it("Puls mit Compliance-Match + hrMax: Zonen-Band als Soll, Intervall-Schnitt-Puls als Ist", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot" });
    // Ziel 185 W bei FTP 200 → 92,5 % FTP → Coggan Z4 (≤105 %) →
    // HR_ZONES.z4 [0.88, 0.95] × hrMax 201 → 177–191 bpm
    const r = doneRide({
      hf: 150,
      compliance: compliance("a", [{ plannedWatts: 185, avgHr: 172, actualDurationS: 600 }]),
    });
    const row = buildDoneCompareRows(c, r, A1, FTP).find((row) => row.label === "Puls");
    expect(row?.plan).toBe("177–191 bpm");
    expect(row?.actual).toBe("172 bpm");
    expect(row?.color).toBe("var(--warn)"); // 172 < 177
  });

  it("Puls mit Compliance-Match, aber Athlet ohne hrMax → nur Ist (Gesamt-Schnitt), kein Band", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Sweet Spot" });
    const r = doneRide({
      hf: 150,
      compliance: compliance("a", [{ plannedWatts: 185, avgHr: 172, actualDurationS: 600 }]),
    });
    const row = buildDoneCompareRows(c, r, "athlete2", 265).find((row) => row.label === "Puls");
    expect(row).toMatchObject({ plan: "–", actual: "150 bpm" });
    expect(row?.color).toBeUndefined();
  });

  it("leere Liste ohne jegliche Ist-Werte", () => {
    const c = card({ id: "a", date: "2026-08-06", typ: "Z2 Dauer" });
    expect(buildDoneCompareRows(c, doneRide(), A1, FTP)).toEqual([]);
  });
});
