import { describe, expect, it } from "vitest";
import { buildSessionGuideView, guideWeightKg, sessionGuideExportText } from "./session-guide-view-model";
import type { PlanCard } from "../../api/types";

function card(overrides: Partial<PlanCard> = {}): PlanCard {
  return {
    id: "c1",
    date: "2026-08-14",
    sortOrder: 0,
    name: "Session",
    typ: "Sweet Spot",
    km: null,
    durationMin: 90,
    tssPlanned: null,
    week: null,
    phase: "Aufbau 2",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const CTX = { cadenceTarget: 90, weightKg: null, ftp: 250 };

describe("buildSessionGuideView", () => {
  it("liefert null für Karten ohne Guide (unbekannter Typ)", () => {
    expect(buildSessionGuideView(card({ typ: "Irgendwas" }), CTX)).toBeNull();
  });

  it("liefert null für Lauf/Schwimm-Karten ohne Guide-Typ (Rekom, Rad-Typ)", () => {
    expect(buildSessionGuideView(card({ sport: "run", typ: "Rekom" }), CTX)).toBeNull();
    expect(buildSessionGuideView(card({ sport: "swim", typ: "Rekom" }), CTX)).toBeNull();
    expect(buildSessionGuideView(card({ sport: "run" }), CTX)).toBeNull(); // „Sweet Spot“ ist kein Lauf-Typ
  });

  it("Lauf-Karte: Ziel, RPE und Schrittfrequenz statt Kadenz (E6)", () => {
    const view = buildSessionGuideView(card({ sport: "run", typ: "Tempolauf", durationMin: 50 }), CTX)!;
    expect(view.goal.length).toBeGreaterThan(0);
    expect(view.rpeLabel).toBe("RPE 6–7");
    expect(view.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining(["RPE 6–7", "So läufst du es", "Schrittfrequenz"]),
    );
    expect(view.sections.map((s) => s.title)).not.toContain("Kadenz");
    expect(view.sources.map((s) => s.key)).toContain("figueiredo-2025");
  });

  it("Schwimm-Karte: weder Kadenz noch „Essen während“, Phase bestimmt das RPE-Band (E6)", () => {
    const base = { sport: "swim" as const, typ: "Intervalle", durationMin: 60 };
    const schwelle = buildSessionGuideView(card({ ...base, phase: "Schwelle" }), CTX)!;
    const vo2 = buildSessionGuideView(card({ ...base, phase: "VO2max" }), CTX)!;
    expect(schwelle.rpeLabel).toBe("RPE 6–7");
    expect(vo2.rpeLabel).toBe("RPE 8–9");
    expect(buildSessionGuideView(card({ ...base, phase: "Aufbau 2" }), CTX)!.rpeLabel).toBe("RPE 6–7");
    const ids = schwelle.sections.map((s) => s.id);
    expect(ids).not.toContain("kadenz");
    expect(ids).not.toContain("fuelInter");
  });

  it("Gewicht bleibt auch bei Lauf an der Gewichtsregel: ohne weightKg keine Gramm-Zahl", () => {
    const long = card({ sport: "run", typ: "Longrun", durationMin: 120 });
    const without = buildSessionGuideView(long, { ...CTX, weightKg: null })!;
    expect(JSON.stringify(without)).not.toMatch(/bei dir/);
    const withWeight = buildSessionGuideView(long, { ...CTX, weightKg: 70 })!;
    expect(JSON.stringify(withWeight)).toMatch(/bei dir ca\. 70–280 g/);
  });

  it("trennt Zielzeile und übrige Abschnitte", () => {
    const view = buildSessionGuideView(card(), CTX);
    expect(view).not.toBeNull();
    expect(view!.goal.length).toBeGreaterThan(0);
    expect(view!.sections.map((s) => s.id)).not.toContain("ziel");
    expect(view!.sections[0].id).toBe("rpe");
  });

  it("setzt das RPE-Band in den Titel des RPE-Abschnitts", () => {
    const view = buildSessionGuideView(card(), CTX)!;
    const rpe = view.sections.find((s) => s.id === "rpe")!;
    expect(rpe.title).toMatch(/^RPE \d+(–\d+)?$/);
    expect(rpe.title).toBe(view.rpeLabel);
  });

  it("sammelt die Quellen aller Abschnitte ohne Doppelte", () => {
    const view = buildSessionGuideView(card(), CTX)!;
    const keys = view.sources.map((s) => s.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("eigene-setzung");
  });

  it("gibt Quellen mit Titel, Fundstelle und Statustext aus", () => {
    const view = buildSessionGuideView(card(), CTX)!;
    const own = view.sources.find((s) => s.key === "eigene-setzung")!;
    expect(own.title).toMatch(/Eigene Setzung/);
    expect(own.status).toBe("übernommene Wahl, nicht belegt");
    const primary = view.sources.find((s) => s.key === "acsm-2016");
    expect(primary?.status).toBe("Originalquelle gelesen");
    expect(primary?.url).toMatch(/^https:\/\/doi\.org\//);
  });

  it("zeigt die persönliche Gramm-Zahl nur mit übergebenem Gewicht", () => {
    const long = card({ durationMin: 120 });
    const without = buildSessionGuideView(long, { ...CTX, weightKg: null })!;
    const withWeight = buildSessionGuideView(long, { ...CTX, weightKg: 70 })!;
    const hintOf = (v: typeof without) => v.sections.find((s) => s.id === "fuelPre")?.hint ?? "";
    expect(hintOf(without)).not.toMatch(/bei dir/);
    expect(hintOf(withWeight)).toMatch(/bei dir ca\. 70–280 g/);
  });

  it("nimmt die Kadenz aus dem Kontext", () => {
    const view = buildSessionGuideView(card(), { ...CTX, cadenceTarget: 95 })!;
    expect(view.sections.find((s) => s.id === "kadenz")!.text).toContain("95");
  });

  it("schließt den Satz vor dem Hinweis mit einem Punkt ab", () => {
    const view = buildSessionGuideView(card({ durationMin: 120 }), CTX)!;
    const during = view.sections.find((s) => s.id === "fuelInter")!;
    expect(during.text).toBe("30–60 g KH pro Stunde.");
    expect(during.hint).toMatch(/^Größere/);
  });

  it("lässt Sätze ohne Hinweis unverändert", () => {
    const view = buildSessionGuideView(card({ durationMin: 30 }), CTX)!;
    expect(view.sections.find((s) => s.id === "fuelInter")!.text).toBe("Wasser reicht.");
  });
});

describe("guideWeightKg", () => {
  const wellness = [{ dateISO: "2026-10-20", weight: 71.5 }];

  it("liefert in der Fremdansicht (Trainer) nie ein Gewicht", () => {
    expect(guideWeightKg({ isSelf: false, wellness, profileWeightKg: 70, todayISO: "2026-10-23" })).toBeNull();
  });

  it("nimmt in der Eigenansicht das frische Wellness-Gewicht", () => {
    expect(guideWeightKg({ isSelf: true, wellness, profileWeightKg: 70, todayISO: "2026-10-23" })).toBe(71.5);
  });

  it("fällt auf das Profilgewicht zurück, wenn Wellness zu alt ist", () => {
    expect(guideWeightKg({ isSelf: true, wellness, profileWeightKg: 70, todayISO: "2026-11-20" })).toBe(70);
  });

  it("liefert null ohne jede Gewichtsquelle", () => {
    expect(guideWeightKg({ isSelf: true, wellness: [], profileWeightKg: null, todayISO: "2026-10-23" })).toBeNull();
  });
});

describe("sessionGuideExportText", () => {
  it("baut den Klartext: Ziel, RPE, Cue, Kadenz, Essen", () => {
    const text = sessionGuideExportText(card(), 90);
    expect(text).toMatch(/^Ziel: /);
    expect(text).toMatch(/\nRPE \d+(–\d+)?: /);
    expect(text).toContain("\nKadenz: ");
    expect(text).toContain("\nEssen während: ");
  });

  it("nennt nie eine persönliche Gramm-Zahl und keine Markdown-Zeichen", () => {
    const text = sessionGuideExportText(card({ durationMin: 200 }), 90);
    expect(text).not.toMatch(/bei dir|Körpergewicht/);
    expect(text).not.toMatch(/[*_`#]/);
  });

  it("liefert leeren String ohne Guide (unbekannter Typ, Rekom, abgesagt)", () => {
    expect(sessionGuideExportText(card({ typ: "Irgendwas" }), 90)).toBe("");
    expect(sessionGuideExportText(card({ sport: "run", typ: "Rekom" }), 90)).toBe("");
    expect(sessionGuideExportText(card({ cancelled: true }), 90)).toBe("");
  });

  it("Lauf/Schwimmen: Klartext läuft über denselben Weg mit (E6), ohne Gramm-Zahl", () => {
    const run = sessionGuideExportText(card({ sport: "run", typ: "Longrun", durationMin: 120 }), 90);
    expect(run).toMatch(/^Ziel: /);
    expect(run).toContain("\nSchrittfrequenz: ");
    expect(run).not.toMatch(/bei dir|U\/min/);
    const swim = sessionGuideExportText(card({ sport: "swim", typ: "Longswim", durationMin: 90 }), 90);
    expect(swim).toContain("\nSo schwimmst du es: ");
    expect(swim).not.toMatch(/Kadenz|Schrittfrequenz|Essen während/);
  });
});
