import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Z2Block } from "./Z2Block";

afterEach(cleanup);

describe("Z2Block", () => {
  it("zeigt HF-Zielzone, Distanzbereich und Kalorien für Z2 Lang", () => {
    render(<Z2Block typ="Z2 Lang" km={100} details="Locker fahren" />);
    screen.getByText("Z2 Aerobic · 123–152 bpm");
    screen.getByText("85–115 km");
    screen.getByText("Locker fahren");
  });

  it("rendert nichts außerhalb der Z2-Typen oder ohne km", () => {
    expect(render(<Z2Block typ="Sweet Spot" km={100} details="x" />).container.firstChild).toBeNull();
    expect(render(<Z2Block typ="Z2 Lang" km={null} details="x" />).container.firstChild).toBeNull();
  });
});
