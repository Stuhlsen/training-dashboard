/* Tests: SportToggle — Sport-Umschalter (Fahrplan 10 E8a).
   Sichtbar nur bei > 1 Sportart; Optik/Verhalten wie AthleteToggle. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(cleanup);

async function load() {
  return import("./SportToggle");
}

describe("SportToggle", () => {
  it("rendert nichts für einen Athleten mit nur einer Sportart (athlete1)", async () => {
    const { SportToggle } = await load();
    const { container } = render(<SportToggle athleteId="athlete1" />);
    expect(container.firstChild).toBeNull();
  });

  it("zeigt drei Pillen für den Multi-Sport-Athleten (athlete3)", async () => {
    const { SportToggle } = await load();
    render(<SportToggle athleteId="athlete3" />);
    expect(screen.getByRole("button", { name: "Rad" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lauf" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schwimm" })).toBeTruthy();
  });

  it("markiert die aktive Sportart und schaltet bei Klick um", async () => {
    const { SportToggle } = await load();
    render(<SportToggle athleteId="athlete3" />);
    const rad = screen.getByRole("button", { name: "Rad" });
    const lauf = screen.getByRole("button", { name: "Lauf" });
    expect(rad.getAttribute("aria-pressed")).toBe("true");
    expect(lauf.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(lauf);
    expect(lauf.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("active_sport")).toBe("run");
  });
});
