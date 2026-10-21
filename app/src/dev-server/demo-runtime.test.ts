import { describe, expect, it } from "vitest";
import { parseEnvFile, resolveDemoRuntime } from "./demo-runtime";

const KEY = "demo-anon";

describe("parseEnvFile", () => {
  it("liest KEY=VALUE, ignoriert Kommentare/Leerzeilen, entfernt Anführungszeichen", () => {
    const text = '# Kommentar\n\nDEMO_SUPABASE_URL="http://localhost:8000"\r\nDEMO_ANON_KEY=abc\nkaputt\n';
    expect(parseEnvFile(text)).toEqual({ DEMO_SUPABASE_URL: "http://localhost:8000", DEMO_ANON_KEY: "abc" });
  });
});

describe("resolveDemoRuntime", () => {
  it("liefert die Demo-Config mit env demo", () => {
    expect(resolveDemoRuntime({ DEMO_SUPABASE_URL: "http://localhost:8000", DEMO_ANON_KEY: KEY }, {})).toEqual({
      supabaseUrl: "http://localhost:8000",
      supabaseAnonKey: KEY,
      env: "demo",
    });
  });

  it("Umgebung hat Vorrang vor .env.demo, die Datei füllt Lücken", () => {
    const cfg = resolveDemoRuntime(
      { DEMO_SUPABASE_URL: "http://127.0.0.1:8000" },
      { DEMO_SUPABASE_URL: "http://localhost:9999", DEMO_ANON_KEY: KEY },
    );
    expect(cfg.supabaseUrl).toBe("http://127.0.0.1:8000");
    expect(cfg.supabaseAnonKey).toBe(KEY);
  });

  it("bricht ab, wenn URL oder Key fehlen — mit Hinweis auf dev:real", () => {
    expect(() => resolveDemoRuntime({}, {})).toThrow(/DEMO_SUPABASE_URL und DEMO_ANON_KEY fehlen.*dev:real/);
    expect(() => resolveDemoRuntime({ DEMO_SUPABASE_URL: "http://localhost:8000" }, {})).toThrow(
      /DEMO_ANON_KEY fehlt/,
    );
    expect(() => resolveDemoRuntime({ DEMO_ANON_KEY: KEY }, {})).toThrow(/DEMO_SUPABASE_URL fehlt/);
  });

  it("lehnt jede Nicht-localhost-URL ab (supabase.co, Live-Domain, Trick-URL, ftp, kaputt)", () => {
    for (const url of [
      "https://wxkuwhzpsbkmbhaqrurv.supabase.co",
      "https://training-dashboard.clear-solutions-it.com",
      "http://localhost@evil.example.com",
      "http://localhost.evil.example.com",
      "ftp://localhost",
    ]) {
      expect(() => resolveDemoRuntime({ DEMO_SUPABASE_URL: url, DEMO_ANON_KEY: KEY }, {}), url).toThrow(
        /muss auf localhost/,
      );
    }
    expect(() => resolveDemoRuntime({ DEMO_SUPABASE_URL: "kaputt", DEMO_ANON_KEY: KEY }, {})).toThrow(
      /keine gültige URL/,
    );
  });

  it("Fehlermeldungen enthalten nie den Key", () => {
    try {
      resolveDemoRuntime({ DEMO_SUPABASE_URL: "https://x.supabase.co", DEMO_ANON_KEY: "geheim-123" }, {});
    } catch (e) {
      expect(String(e)).not.toContain("geheim-123");
      return;
    }
    throw new Error("hätte werfen müssen");
  });
});
