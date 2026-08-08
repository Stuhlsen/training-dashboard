import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeatherBadge } from "./WeatherBadge";

afterEach(cleanup);

const BASE = { temp: 20, tempFeel: 20, windSpeed: 12, windDir: 90, precipProb: 10, uvMax: 5, weatherCode: 1 };

describe("WeatherBadge", () => {
  it("zeigt Temperatur, gefühlte Temperatur, Wind und Regenwahrscheinlichkeit", () => {
    render(<WeatherBadge forecast={BASE} />);
    screen.getByText(/gefühlt 20°C/);
    screen.getByText(/12 km\/h/);
    screen.getByText("🌧 10% Regen");
  });

  it("zeigt kein UV-Label ohne uvMax", () => {
    render(<WeatherBadge forecast={{ ...BASE, uvMax: null }} />);
    expect(screen.queryByText(/UV/)).toBeNull();
  });

  it("zeigt die Hitzewarnung ab gefühlten 32°C", () => {
    render(<WeatherBadge forecast={{ ...BASE, tempFeel: 33 }} />);
    screen.getByText(/Hitzestress/);
  });

  it("zeigt die Kältewarnung unter 5°C", () => {
    render(<WeatherBadge forecast={{ ...BASE, temp: 2 }} />);
    screen.getByText(/Winterausrüstung/);
  });
});
