import { describe, it, expect, afterEach, vi } from "vitest";
import { DEMO_ATHLETES, rosterFor } from "./config";

// Generator-Seite der Demo-Besetzung (Fahrplan 31, V2) — die App-Liste muss
// Namen/IDs/Endpoints exakt spiegeln, sonst findet findSlotId() keinen Platz.
// Über import.meta.glob statt statischem Import: `tsc -b` folgt dem nicht. Der
// Docker-Build sieht nur `./app`, ein statischer Import aus `scripts/` bräche dort.
interface RosterEntry {
  id: string;
  displayName: string;
  endpoint: string;
  sports: string[];
  hrMax: number;
  hrRest: number;
  ftpSeason: number[];
}
const rosterModules = import.meta.glob<{ DEMO_ROSTER: RosterEntry[] }>("../../scripts/demo/lib/roster.js", {
  eager: true,
});
const DEMO_ROSTER = Object.values(rosterModules)[0]?.DEMO_ROSTER ?? [];

function setLocation(hostname: string, port = "") {
  vi.stubGlobal("location", { hostname, port } as Location);
}

/** config.ts wählt die Liste beim Laden — daher frisch importieren. */
async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.__RUNTIME_CONFIG__;
});

describe("DEMO_ATHLETES (Fahrplan 31, V2)", () => {
  it("spiegelt scripts/demo/lib/roster.js — IDs, Namen, Endpoints, Sportarten, Puls", () => {
    expect(DEMO_ATHLETES.map((a) => [a.id, a.name, a.endpoint, a.sports, a.hrMax, a.hrRest])).toEqual(
      DEMO_ROSTER.map((r) => [r.id, r.displayName, r.endpoint, r.sports, r.hrMax, r.hrRest]),
    );
  });

  it("FTP: Saisonstart = erster, gemessen = letzter Wert aus ftpSeason", () => {
    for (const r of DEMO_ROSTER) {
      const a = DEMO_ATHLETES.find((x) => x.id === r.id);
      expect(a?.seasonStartFtp).toBe(r.ftpSeason[0]);
      expect(a?.ftpMeasured).toBe(r.ftpSeason[r.ftpSeason.length - 1]);
    }
  });
});

describe("rosterFor — Umschaltung der Athletenliste", () => {
  it("nur demo ergibt die Demo-Liste", () => {
    expect(rosterFor("demo")).toBe(DEMO_ATHLETES);
    for (const env of ["dev", "prod", "unknown"] as const) {
      expect(rosterFor(env)).not.toBe(DEMO_ATHLETES);
    }
  });
});

describe("ATHLETES beim Laden", () => {
  it('env "demo" → nur Demo-Besetzung, Start-Athlet demo1, kein echtes Pseudonym', async () => {
    setLocation("localhost", "5173");
    window.__RUNTIME_CONFIG__ = {
      env: "demo",
      supabaseUrl: "http://localhost:8000",
      supabaseAnonKey: "demo-anon",
    };
    const cfg = await loadConfig();
    expect(cfg.ATHLETES.map((a) => a.name)).toEqual(["lena.rides", "tri_jonas"]);
    expect(cfg.PRIMARY_ATHLETE_ID).toBe("demo1");
    expect(cfg.athleteConfig("athlete1")).toBeNull();
    expect(cfg.athleteConfig("demo2")?.name).toBe("tri_jonas");
  });

  it("ohne env (localhost, Live-Hostname) → echte Liste, Start-Athlet athlete1", async () => {
    for (const host of ["localhost", "training-dashboard.clear-solutions-it.com"]) {
      setLocation(host);
      const cfg = await loadConfig();
      expect(cfg.ATHLETES.map((a) => a.id)).toEqual(["athlete1", "athlete2", "athlete3", "athlete4"]);
      expect(cfg.PRIMARY_ATHLETE_ID).toBe("athlete1");
    }
  });
});
