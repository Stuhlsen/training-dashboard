/* Tests: Layout — Reihenfolge der Menüeinträge (Fahrplan 23 E29):
 * "Ernährung" für ALLE Athleten, hinter "Events", vor dem bedingten "Bike-Fit". */

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockSports: string[] = ["ride"];

vi.mock("../api/auth/useAuth", () => ({ useAuth: () => ({ session: null, signOut: vi.fn() }) }));
vi.mock("../api/hooks/useActiveAthlete", () => ({
  useActiveAthlete: () => ({ activeAthleteId: "athlete1", setActiveAthleteId: vi.fn() }),
}));
vi.mock("../api/hooks/useAthleteSports", () => ({ useAthleteSports: () => mockSports }));
vi.mock("../hooks/account-label", () => ({ useAccountLabel: () => "" }));
vi.mock("./EnvBadge", () => ({ EnvBadge: () => null }));
vi.mock("./Footer", () => ({ Footer: () => null }));
vi.mock("./AthleteToggle", () => ({ AthleteToggle: () => null }));
vi.mock("./SportToggle", () => ({ SportToggle: () => null }));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));

const { Layout } = await import("./Layout");

afterEach(cleanup);

function navLabels(): string[] {
  const { container } = render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
  return Array.from(container.querySelectorAll(".app-header-nav a")).map((a) => a.textContent ?? "");
}

describe("Layout — Menüeinträge", () => {
  it("Rad-Athlet: Ernährung steht nach Events und vor Bike-Fit", () => {
    mockSports = ["ride"];
    expect(navLabels()).toEqual([
      "Hero",
      "Planungstab",
      "Fahrtenbuch",
      "Analyse",
      "Events",
      "Ernährung",
      "Bike-Fit",
    ]);
  });

  it("Athlet ohne Rad: Ernährung ist trotzdem da (nicht an hasCycling gebunden), Bike-Fit fehlt", () => {
    mockSports = ["run"];
    const labels = navLabels();
    expect(labels).toContain("Ernährung");
    expect(labels).not.toContain("Bike-Fit");
    expect(labels.indexOf("Ernährung")).toBe(labels.indexOf("Events") + 1);
  });
});
