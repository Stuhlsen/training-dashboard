/* Tests: SportToggle — Sport-Umschalter (Fahrplan 10 E8a).
   Sichtbar nur bei > 1 Sportart; Optik/Verhalten wie AthleteToggle. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createHarness } from "../test/harness";

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

async function load() {
  return import("./SportToggle");
}

describe("SportToggle", () => {
  it("rendert nichts für einen Athleten mit nur einer Sportart (athlete1)", async () => {
    const { SportToggle } = await load();
    const { wrapper } = createHarness();
    const { container } = render(<SportToggle athleteId="athlete1" />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("zeigt drei Pillen für den Multi-Sport-Athleten (athlete3)", async () => {
    const { SportToggle } = await load();
    const { wrapper } = createHarness();
    render(<SportToggle athleteId="athlete3" />, { wrapper });
    expect(screen.getByRole("button", { name: "Radfahren" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Laufen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schwimmen" })).toBeTruthy();
  });

  it("markiert die aktive Sportart und schaltet bei Klick um", async () => {
    const { SportToggle } = await load();
    const { wrapper } = createHarness();
    render(<SportToggle athleteId="athlete3" />, { wrapper });
    const rad = screen.getByRole("button", { name: "Radfahren" });
    const lauf = screen.getByRole("button", { name: "Laufen" });
    expect(rad.getAttribute("aria-pressed")).toBe("true");
    expect(lauf.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(lauf);
    expect(lauf.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("active_sport")).toBe("run");
  });

  describe("Modus 'planning-filter' (Fahrplan 44 E1)", () => {
    it("zeigt 'Alle' + die Sportarten, Standard 'Alle' aktiv", async () => {
      const { SportToggle } = await load();
      const { wrapper } = createHarness();
      render(<SportToggle athleteId="athlete3" mode="planning-filter" />, { wrapper });
      expect(screen.getByRole("button", { name: "Alle" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "Radfahren" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: "Laufen" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Schwimmen" })).toBeTruthy();
    });

    it("Klick setzt NUR den Planungsfilter, nie den globalen Umschalter", async () => {
      localStorage.setItem("active_sport", "ride");
      const { SportToggle } = await load();
      const { wrapper } = createHarness();
      render(<SportToggle athleteId="athlete3" mode="planning-filter" />, { wrapper });
      fireEvent.click(screen.getByRole("button", { name: "Laufen" }));
      expect(localStorage.getItem("planning_sport_filter")).toBe("run");
      expect(localStorage.getItem("active_sport")).toBe("ride");
      fireEvent.click(screen.getByRole("button", { name: "Alle" }));
      expect(localStorage.getItem("planning_sport_filter")).toBe("all");
      expect(localStorage.getItem("active_sport")).toBe("ride");
    });

    it("rendert nichts für einen Einzelsport-Athleten (athlete1)", async () => {
      const { SportToggle } = await load();
      const { wrapper } = createHarness();
      const { container } = render(<SportToggle athleteId="athlete1" mode="planning-filter" />, { wrapper });
      expect(container.firstChild).toBeNull();
    });
  });
});
