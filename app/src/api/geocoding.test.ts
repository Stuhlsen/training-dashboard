/* Tests: api/geocoding.ts — Open-Meteo-Geocoding-Client (Fahrplan 17 E4).
   fetch wird gestubbt, kein echter Netzwerk-Call. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCityLabel, searchCities } from "./geocoding";

function stubFetch(body: unknown, status = 200) {
  const spy = vi.fn((_url: string) => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatCityLabel", () => {
  it("verkettet Name, Region, Land mit Komma", () => {
    expect(formatCityLabel({ name: "Bremen", admin1: "Bremen", country: "Deutschland" })).toBe(
      "Bremen, Bremen, Deutschland",
    );
  });
  it("lässt fehlende Teile weg", () => {
    expect(formatCityLabel({ name: "Bremen", admin1: null, country: null })).toBe("Bremen");
  });
});

describe("searchCities", () => {
  it("unter 2 Zeichen -> keine Treffer, kein fetch-Aufruf", async () => {
    const spy = stubFetch({ results: [] });
    const result = await searchCities("B");
    expect(result).toEqual({ ok: true, matches: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("mappt Treffer inkl. Region/Land, latitude/longitude -> lat/lon", async () => {
    stubFetch({
      results: [
        { name: "Bremen", admin1: "Bremen", country: "Deutschland", latitude: 53.0793, longitude: 8.8017 },
        { name: "Bremen", country: "USA", latitude: 41.4459, longitude: -73.9068 },
      ],
    });
    const result = await searchCities("Bremen");
    expect(result).toEqual({
      ok: true,
      matches: [
        { name: "Bremen", admin1: "Bremen", country: "Deutschland", lat: 53.0793, lon: 8.8017 },
        { name: "Bremen", admin1: null, country: "USA", lat: 41.4459, lon: -73.9068 },
      ],
    });
  });

  it("keine results -> leere Liste, kein Fehler", async () => {
    stubFetch({});
    const result = await searchCities("Xyzabc");
    expect(result).toEqual({ ok: true, matches: [] });
  });

  it("HTTP-Fehler -> Result ok:false", async () => {
    stubFetch({}, 500);
    const result = await searchCities("Bremen");
    expect(result).toEqual({ ok: false, error: { code: "HTTP", message: "Geocoding-Fehler 500" } });
  });

  it("Netzwerkfehler -> Result ok:false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const result = await searchCities("Bremen");
    expect(result).toEqual({ ok: false, error: { code: "NETWORK", message: "offline" } });
  });

  it("URL enthält die getrimmte, kodierte Suchanfrage", async () => {
    const spy = stubFetch({ results: [] });
    await searchCities("  São Paulo  ");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("São Paulo"));
  });
});
