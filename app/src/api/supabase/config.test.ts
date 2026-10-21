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

describe("config.ts — Demo-Modus (Fahrplan 31, V5)", () => {
  const LIVE_HOST = "training-dashboard.clear-solutions-it.com";
  const demoRuntime = { supabaseUrl: "http://localhost:8000", supabaseAnonKey: "demo-anon" };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('nur env "demo" ergibt demo, mit der Laufzeit-URL', () => {
    setLocation("localhost", "5173");
    window.__RUNTIME_CONFIG__ = { ...demoRuntime, env: "demo" };
    expect(getEnvironment()).toBe("demo");
    expect(getConfig()).toEqual({ env: "demo", projectUrl: "http://localhost:8000", anonKey: "demo-anon" });
  });

  it("fehlendes oder anderes env ist nie demo", () => {
    setLocation("localhost", "8080");
    window.__RUNTIME_CONFIG__ = { ...demoRuntime };
    expect(getEnvironment()).toBe("dev");
    window.__RUNTIME_CONFIG__ = { ...demoRuntime, env: "prod" };
    expect(getEnvironment()).toBe("prod");
    // @ts-expect-error absichtlich ein ungültiger Wert
    window.__RUNTIME_CONFIG__ = { ...demoRuntime, env: "Demo" };
    expect(getEnvironment()).toBe("unknown");
  });

  it("Live-Hostname ergibt nie demo — ohne Laufzeit-Config, ohne env, mit prod", () => {
    setLocation(LIVE_HOST);
    expect(getEnvironment()).not.toBe("demo");
    window.__RUNTIME_CONFIG__ = { supabaseUrl: `https://${LIVE_HOST}`, supabaseAnonKey: "k" };
    expect(getEnvironment()).not.toBe("demo");
    window.__RUNTIME_CONFIG__ = { supabaseUrl: `https://${LIVE_HOST}`, supabaseAnonKey: "k", env: "prod" };
    expect(getEnvironment()).toBe("prod");
  });

  it("demo ohne URL oder Key → kein Client, kein Rückfall auf die localhost-Zeile (dashboard-dev)", () => {
    setLocation("localhost");
    window.__RUNTIME_CONFIG__ = { env: "demo" };
    expect(getEnvironment()).toBe("demo");
    expect(getConfig()).toBeNull();
    window.__RUNTIME_CONFIG__ = { env: "demo", supabaseUrl: "http://localhost:8000" };
    expect(getConfig()).toBeNull();
    window.__RUNTIME_CONFIG__ = { env: "demo", supabaseAnonKey: "demo-anon" };
    expect(getConfig()).toBeNull();
  });

  it("demo mit fremder URL (supabase.co, Live-Domain, Trick-URL) → kein Client", () => {
    setLocation("localhost");
    for (const supabaseUrl of [
      "https://wxkuwhzpsbkmbhaqrurv.supabase.co",
      `https://${LIVE_HOST}`,
      "http://localhost@evil.example.com",
      "kaputt",
    ]) {
      window.__RUNTIME_CONFIG__ = { env: "demo", supabaseUrl, supabaseAnonKey: "k" };
      expect(getConfig()).toBeNull();
    }
  });

  it("Vite-Modus demo ohne Demo-Config → kein Rückfall auf dashboard-dev", () => {
    vi.stubEnv("MODE", "demo");
    setLocation("localhost", "5173");
    expect(getConfig()).toBeNull();
    expect(getEnvironment()).toBe("unknown");
    window.__RUNTIME_CONFIG__ = { ...demoRuntime, env: "dev" };
    expect(getConfig()).toBeNull();
  });
});
