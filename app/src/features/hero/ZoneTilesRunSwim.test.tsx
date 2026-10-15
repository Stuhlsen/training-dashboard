/* Tests: Zonen-Kacheln für Lauf und Schwimmen (PaceZonesTile, HrZonesTile je
   Sportart, Sichtbarkeitsregel) — Fahrplan 24, E3.
   Echter Datenweg: ZONE_EXPLANATIONS, sports/*, computePaceZones, buildPaceSection.
   Erwartungen werden aus den Zonen-Dateien abgeleitet, nicht verdrahtet. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { computePaceZones, paceScaleMax, PACE_FROM_KMH } from "../../core/pace-zones.js";
import {
  EASY_ZONE_ID_BY_SPORT,
  EASY_ZONE_SHARE_SENTENCE,
  HR_RICHTWERT_HINT,
  SWIMMING_HR_HINT,
  ZONE_EXPLANATIONS,
} from "../../core/zone-explanations.js";
import { sportProfileFor } from "../../sports";
import { RUNNING_HR_ZONES } from "../../sports/running/metrics";
import { SWIMMING_HR_ZONES } from "../../sports/swimming/metrics";
import { buildPaceSection, type PaceSectionViewModel } from "../analysis/pace-section-view-model";
import { HrZonesTile } from "./HrZonesTile";
import { PaceZonesTile } from "./PaceZonesTile";
import {
  buildHrZones,
  buildPaceZonesViewModel,
  heroZoneTileIds,
  PACE_RICHTWERT_HINT,
  paceRangeText,
} from "./zone-explainer-view-model";

afterEach(cleanup);

/** Pace-View-Model mit Schwelle: Basis ist der echte Analyse-Tab-Weg ohne
 *  Rides (degradiert), Zonen/Skala kommen aus denselben core-Funktionen. */
function paceWithThreshold(sport: "run" | "swim", kmh: number): PaceSectionViewModel {
  const base = buildPaceSection({ rides: [], sport });
  const zoneSource = sportProfileFor(sport)!.zones;
  return {
    ...base,
    thresholdSpeed: kmh,
    thresholdPaceSec: PACE_FROM_KMH(kmh),
    degraded: false,
    zones: computePaceZones(kmh, zoneSource, PACE_FROM_KMH) as PaceSectionViewModel["zones"],
    scaleMaxSpeed: paceScaleMax(kmh, zoneSource),
  };
}

/** Pace-Bereich MIT Einheit — ein nacktes m:ss träfe auch Quellenangaben ("2024;6:1363730"). */
const PACE_RANGE = /\d+:\d{2}(–\d+:\d{2})? min\/(km|100 m)/;

describe("paceRangeText", () => {
  it("nennt die langsamere Grenze zuerst, bei der untersten Zone nur 'langsamer als'", () => {
    expect(paceRangeText(330, 300, "min/km")).toBe("5:30–5:00 min/km");
    expect(paceRangeText(null, 380, "min/km")).toBe("langsamer als 6:20 min/km");
    expect(paceRangeText(null, null, "min/km")).toBeNull();
  });
});

describe("buildPaceZonesViewModel", () => {
  it("Lauf mit Schwelle: Zonen = Daniels-Meta, Bereichstexte in min/km", () => {
    const pace = paceWithThreshold("run", 12);
    const vm = buildPaceZonesViewModel(pace);
    const meta = sportProfileFor("run")!.zones.meta;
    expect(vm.degraded).toBe(false);
    expect(vm.explainerZones.map((z) => z.id)).toEqual(meta.map((m) => m.id));
    expect(vm.explainerZones.map((z) => z.label)).toEqual(meta.map((m) => m.label));
    expect(vm.explainerZones[0].range).toMatch(/^langsamer als \d+:\d{2} min\/km$/);
    for (const z of vm.explainerZones.slice(1)) expect(z.range).toMatch(/^\d+:\d{2}–\d+:\d{2} min\/km$/);
    expect(vm.scaleZones.map((z) => z.bisPaceSec)).toEqual(pace.zones.map((z) => z.bisPaceSec));
  });

  it("Schwimmen mit Schwelle: Pace je 100 m (s/km ÷ 10), Einheit min/100 m", () => {
    const pace = paceWithThreshold("swim", 3);
    const vm = buildPaceZonesViewModel(pace);
    vm.scaleZones.forEach((z, i) => {
      expect(z.bisPaceSec).toBeCloseTo(pace.zones[i].bisPaceSec! / 10);
    });
    expect(vm.explainerZones.every((z) => z.range?.endsWith("min/100 m"))).toBe(true);
    // 3 km/h = 2:00 pro 100 m — die Schwelle selbst (Zone s3, obere Grenze 100 %)
    const css = vm.explainerZones.find((z) => z.id === "s3")!;
    expect(css.range).toMatch(/–2:00 min\/100 m$/);
  });

  it.each(["run", "swim"] as const)("%s ohne Schwelle: degradiert, Labels aus dem Profil, keine Zahlen", (sport) => {
    const vm = buildPaceZonesViewModel(buildPaceSection({ rides: [], sport }));
    const meta = sportProfileFor(sport)!.zones.meta;
    expect(vm.degraded).toBe(true);
    expect(vm.scaleZones).toEqual([]);
    expect(vm.explainerZones.map((z) => z.id)).toEqual(meta.map((m) => m.id));
    expect(vm.explainerZones.every((z) => z.range === null)).toBe(true);
  });
});

describe("buildHrZones je Sportart", () => {
  it.each([
    ["run", RUNNING_HR_ZONES],
    ["swim", SWIMMING_HR_ZONES],
  ] as const)("%s: Prozentgrenzen × HFmax", (sport, pct) => {
    const vm = buildHrZones(sport, 190);
    expect(vm.degraded).toBe(false);
    expect(vm.zones.map((z) => z.id)).toEqual(Object.keys(pct));
    for (const z of vm.zones) {
      const [lo, hi] = pct[z.id];
      expect(z.vonBpm).toBe(Math.round(190 * lo));
      expect(z.bisBpm).toBe(Math.round(190 * hi));
    }
  });

  it("ohne HFmax: degradiert, aber alle Zonen-Labels bleiben", () => {
    const vm = buildHrZones("swim", null);
    expect(vm.degraded).toBe(true);
    expect(vm.zones).toEqual([]);
    expect(vm.explainerZones).toHaveLength(Object.keys(SWIMMING_HR_ZONES).length);
    expect(vm.explainerZones.every((z) => z.range === null)).toBe(true);
  });
});

describe("heroZoneTileIds (Sichtbarkeitsregel)", () => {
  it("Rad: Watt- und HF-Kachel nur mit FTP-Daten, nie die Pace-Kachel", () => {
    expect(heroZoneTileIds("ride", true)).toEqual(["powerScale", "hrZones"]);
    expect(heroZoneTileIds("ride", false)).toEqual([]);
    expect(heroZoneTileIds("ride", true)).not.toContain("paceZones");
  });
  it("Lauf und Schwimmen: Pace- und HF-Kachel, unabhängig von FTP-Daten", () => {
    for (const sport of ["run", "swim"] as const) {
      expect(heroZoneTileIds(sport, false)).toEqual(["paceZones", "hrZones"]);
      expect(heroZoneTileIds(sport, true)).toEqual(["paceZones", "hrZones"]);
    }
  });
});

describe("PaceZonesTile", () => {
  it.each([
    ["run", "running", /E Easy/],
    ["swim", "swimming", /Grundlage/],
  ] as const)("%s mit Schwelle: Vorauswahl Easy-Zone, Bereichstexte, Pflichthinweis", (sport, textKey, easyName) => {
    const { container } = render(<PaceZonesTile pace={paceWithThreshold(sport, sport === "run" ? 12 : 3)} />);
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toMatch(easyName);
    const easyText = ZONE_EXPLANATIONS[textKey].zonen.find((t) => t.id === EASY_ZONE_ID_BY_SPORT[textKey])!;
    expect(container.textContent).toContain(easyText.gefuehl);
    expect(container.textContent).toContain(EASY_ZONE_SHARE_SENTENCE.text);
    expect(container.textContent).toMatch(PACE_RANGE);
    expect(screen.getByText(PACE_RICHTWERT_HINT.text)).toBeTruthy();
    expect(PACE_RICHTWERT_HINT.text).toContain("Richtwert, nicht an deinen Daten geprüft");
  });

  it.each(["run", "swim"] as const)("%s ohne Schwelle: graue Bänder ohne Zahlen, Texte und Pflichthinweis bleiben", (sport) => {
    const pace = buildPaceSection({ rides: [], sport });
    const { container } = render(<PaceZonesTile pace={pace} />);
    expect(container.textContent).not.toMatch(PACE_RANGE);
    expect(container.textContent).not.toMatch(/geschätzt \(unkalibriert\)/);
    expect(screen.getByText(/Schwellenpace noch nicht schätzbar/)).toBeTruthy();
    expect(screen.getByText(PACE_RICHTWERT_HINT.text)).toBeTruthy();
    const textKey = sport === "run" ? "running" : "swimming";
    const easyId = EASY_ZONE_ID_BY_SPORT[textKey];
    const easy = ZONE_EXPLANATIONS[textKey].zonen.find((t) => t.id === easyId)!;
    expect(container.textContent).toContain(easy.gefuehl);
    // jede Zone bleibt wählbar
    const zoneButtons = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    expect(zoneButtons).toHaveLength(ZONE_EXPLANATIONS[textKey].zonen.length);
    fireEvent.click(zoneButtons[3]);
    expect(zoneButtons[3].getAttribute("aria-pressed")).toBe("true");
  });

  it("Pflichthinweis ist nicht wegklickbar: kein Schließen-Element", () => {
    render(<PaceZonesTile pace={paceWithThreshold("run", 12)} />);
    expect(screen.queryByRole("button", { name: /schließen|ausblenden|verstanden/i })).toBeNull();
  });

  it("wählt per Klick auf das Band im Balken die Zone", () => {
    const pace = paceWithThreshold("run", 12);
    render(<PaceZonesTile pace={pace} />);
    const tBand = screen.getAllByText("T Schwelle").find((el) => el.closest("div[style*='cursor: pointer']"))!;
    fireEvent.click(tBand.closest("div[style*='cursor: pointer']")!);
    expect(screen.getByRole("button", { name: /T Schwelle/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("HrZonesTile Lauf und Schwimmen", () => {
  it.each(["run", "swim"] as const)("%s mit HFmax: bpm, Richtwert, Herkunftsvermerk, Z2 vorgewählt", (sport) => {
    const { container } = render(<HrZonesTile sport={sport} vm={buildHrZones(sport, 190)} hrMaxEstimated />);
    expect(container.textContent).toMatch(/\d+ bpm/);
    expect(screen.getByText(HR_RICHTWERT_HINT.text)).toBeTruthy();
    expect(screen.getByText(/HFmax geschätzt/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Z2/ }).getAttribute("aria-pressed")).toBe("true");
    const texts = ZONE_EXPLANATIONS[sport === "run" ? "running" : "swimming"].hf;
    expect(container.textContent).toContain(texts.find((t) => t.id === "z2")!.gefuehl);
  });

  it.each(["run", "swim"] as const)("%s ohne HFmax: degradiert ohne Zahlen, Texte und Richtwert bleiben", (sport) => {
    const { container } = render(<HrZonesTile sport={sport} vm={buildHrZones(sport, null)} hrMaxEstimated={false} />);
    expect(container.textContent).not.toMatch(/\d+\s?bpm/);
    expect(screen.getByText(/HFmax noch nicht bekannt/)).toBeTruthy();
    expect(screen.getByText(HR_RICHTWERT_HINT.text)).toBeTruthy();
  });

  it("zeigt den Wasser-Herzfrequenz-Hinweis nur beim Schwimmen — mit und ohne HFmax", () => {
    for (const hrMax of [190, null]) {
      render(<HrZonesTile sport="swim" vm={buildHrZones("swim", hrMax)} hrMaxEstimated={false} />);
      expect(screen.getByText(SWIMMING_HR_HINT.text)).toBeTruthy();
      cleanup();
    }
    for (const sport of ["ride", "run"] as const) {
      render(<HrZonesTile sport={sport} vm={buildHrZones(sport, 190)} hrMaxEstimated={false} />);
      expect(screen.queryByText(SWIMMING_HR_HINT.text)).toBeNull();
      cleanup();
    }
  });
});
