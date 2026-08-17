import { describe, it, expect, afterEach, vi } from "vitest";
import { getConfig, getEnvironment } from "./config";

function setLocation(hostname: string, port = "") {
  vi.stubGlobal("location", { hostname, port } as Location);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__RUNTIME_CONFIG__;
});

describe("config.ts — Hostname/Port-Auflösung", () => {
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

describe("config.ts — window.__RUNTIME_CONFIG__ (Docker, Fahrplan 3 DKR1)", () => {
  it("hat Vorrang vor der Hostname-Tabelle, auch auf localhost", () => {
    setLocation("localhost", "8080");
    window.__RUNTIME_CONFIG__ = {
      supabaseUrl: "https://runtime-projekt.supabase.co",
      supabaseAnonKey: "runtime-key",
      env: "prod",
    };
    expect(getConfig()).toEqual({
      env: "prod",
      projectUrl: "https://runtime-projekt.supabase.co",
      anonKey: "runtime-key",
    });
    expect(getEnvironment()).toBe("prod");
  });

  it("fehlendes env-Feld fällt auf dev zurück, nicht auf die Hostname-Tabelle", () => {
    setLocation("localhost");
    window.__RUNTIME_CONFIG__ = {
      supabaseUrl: "https://runtime-projekt.supabase.co",
      supabaseAnonKey: "runtime-key",
    };
    expect(getEnvironment()).toBe("dev");
    expect(getConfig()?.projectUrl).toBe("https://runtime-projekt.supabase.co");
  });

  it("unvollständige Laufzeit-Config (nur url) wird ignoriert, Hostname-Tabelle greift", () => {
    setLocation("localhost");
    window.__RUNTIME_CONFIG__ = { supabaseUrl: "https://runtime-projekt.supabase.co" };
    expect(getConfig()?.projectUrl).not.toBe("https://runtime-projekt.supabase.co");
    expect(getEnvironment()).toBe("dev");
  });

  it("verschriebenes env (z. B. 'production' statt 'prod') → unknown, nicht dev", () => {
    setLocation("localhost");
    window.__RUNTIME_CONFIG__ = {
      supabaseUrl: "https://runtime-projekt.supabase.co",
      supabaseAnonKey: "runtime-key",
      // @ts-expect-error absichtlich ein ungültiger Wert, wie ihn ein Tippfehler
      // in einem künftigen RUNTIME_ENV (docker-compose.prod.yml, DKR4) erzeugen würde
      env: "production",
    };
    expect(getEnvironment()).toBe("unknown");
    expect(getConfig()?.projectUrl).toBe("https://runtime-projekt.supabase.co");
  });
});
