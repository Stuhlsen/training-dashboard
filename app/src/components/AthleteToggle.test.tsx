/* Tests: AthleteToggle — Einträge kommen von außen (feste Plätze, ggf. plus
 * eigener Eintrag eines Accounts ohne Platz). */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AthleteToggle } from "./AthleteToggle";

const SLOTS = [
  { id: "a1", name: "alpha" },
  { id: "a2", name: "beta" },
];

afterEach(cleanup);

describe("AthleteToggle", () => {
  it("zeigt genau die übergebenen Einträge", () => {
    render(<AthleteToggle athletes={SLOTS} activeAthleteId="a1" onChange={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["alpha", "beta"]);
  });

  it("mit eigenem Eintrag: ein Button mehr, Breite wächst mit", () => {
    const withSelf = [...SLOTS, { id: "self", name: "gamma" }];
    const { container } = render(<AthleteToggle athletes={withSelf} activeAthleteId="self" onChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "gamma" }).getAttribute("aria-pressed")).toBe("true");
    expect((container.firstChild as HTMLElement).style.width).toBe("372px");
  });

  it("Klick meldet die ID des Eintrags", () => {
    const onChange = vi.fn();
    render(<AthleteToggle athletes={[...SLOTS, { id: "self", name: "gamma" }]} activeAthleteId="a1" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "gamma" }));
    expect(onChange).toHaveBeenCalledWith("self");
  });
});
