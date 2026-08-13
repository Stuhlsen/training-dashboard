import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeatherWeeklyChart } from "./WeatherWeeklyChart";

afterEach(cleanup);

function buildRides() {
  // 2026-KW23/24 (Montag-basiert, s. core/aggregate.js::isoWeekKey) — KW23
  // unauffällig, KW24 windig+regnerisch (→ "danger", s. core/weather.js).
  return [
    { dateISO: "2026-06-01", weather: { temp: 20, windSpeed: 10, precip: 0 } },
    { dateISO: "2026-06-08", weather: { temp: 22, windSpeed: 35, precip: 1.2 } },
  ];
}

describe("WeatherWeeklyChart", () => {
  it("rendert ein SVG mit einem Balken je Kalenderwoche", () => {
    const { container } = render(<WeatherWeeklyChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Wetter/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll('rect[fill^="var(--"]').length).toBeGreaterThanOrEqual(2);
  });

  it("zeigt einen Leerzustand ohne Wetterdaten", () => {
    render(<WeatherWeeklyChart rides={[{ dateISO: "2026-06-01" }] as never} />);
    screen.getByText(/Wetterdaten werden ab dem nächsten Sync aufgebaut/);
  });

  it("färbt eine windig-regnerische Woche als Gefahr", () => {
    const { container } = render(<WeatherWeeklyChart rides={buildRides() as never} />);
    expect(container.querySelector('rect[fill="var(--danger)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="var(--ok)"]')).not.toBeNull();
  });

  it("zeigt bei Hover auf eine Woche einen Tooltip mit Wetterdaten", () => {
    const { container } = render(<WeatherWeeklyChart rides={buildRides() as never} />);
    const hitArea = container.querySelector('rect[fill="transparent"]');
    expect(hitArea).not.toBeNull();
    fireEvent.mouseEnter(hitArea as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /Wind/ });
    fireEvent.mouseLeave(hitArea as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("zeigt einen Regen-Marker bei Wochen-Niederschlag über 0.5mm", () => {
    const { container } = render(<WeatherWeeklyChart rides={buildRides() as never} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("🌧");
  });
});
