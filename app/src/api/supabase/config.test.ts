import { describe, it, expect, afterEach, vi } from "vitest";
import { getConfig, getEnvironment } from "./config";

function setLocation(hostname: string, port = "") {
  vi.stubGlobal("location", { hostname, port } as Location);
}

describe("config.ts — Hostname/Port-Auflösung", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("localhost ohne Port → dev", () => {
    setLocation("localhost");
    expect(getEnvironment()).toBe("dev");
    expect(getConfig()?.env).toBe("dev");
  });

  it("localhost:5173 (Vite-Dev-Server) → dev, via bare-Key-Fallback", () => {
    setLocation("localhost", "5173");
    expect(getEnvironment()).toBe("dev");
  });

  it("localhost:3000 (alter npx-serve-Port) → weiterhin dev", () => {
    setLocation("localhost", "3000");
    expect(getEnvironment()).toBe("dev");
  });

  it("stuhlsen.github.io → prod", () => {
    setLocation("stuhlsen.github.io");
    expect(getEnvironment()).toBe("prod");
    expect(getConfig()?.env).toBe("prod");
  });

  it("unbekannter Host → unknown, getConfig null", () => {
    setLocation("irgendeine-preview.example.com");
    expect(getEnvironment()).toBe("unknown");
    expect(getConfig()).toBeNull();
  });
});
