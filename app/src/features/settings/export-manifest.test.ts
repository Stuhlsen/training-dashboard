import { describe, expect, it } from "vitest";
import { buildExportManifest, type ExportManifestInput } from "./export-manifest";

function input(over: Partial<ExportManifestInput> = {}): ExportManifestInput {
  return {
    exportedAt: "2026-09-06T10:00:00.000Z",
    displayName: "Stuhlsen",
    konto: {
      profil: { id: "u1", role: "athlete" },
      zieleAktiv: [],
      events: [],
      trainingskarten: [],
      befinden: [],
      ftpVerlauf: [],
      vorschlaege: [],
      trainingsplanAktiv: null,
      formate: [],
      heroLayout: [],
      leiterVerlauf: [],
      exportEinstellungen: { preset: "general", eventId: null },
      syncKonfiguration: { _hinweis: "…" },
    },
    trainingsdaten: null,
    trainingsdatenError: null,
    ...over,
  };
}

function byPath(files: { path: string; content: string }[]) {
  return new Map(files.map((f) => [f.path, f.content]));
}

describe("buildExportManifest", () => {
  it("legt immer README.txt und genau 13 konto/-Dateien an", () => {
    const files = buildExportManifest(input());
    const paths = files.map((f) => f.path);
    expect(paths).toContain("README.txt");
    expect(paths.filter((p) => p.startsWith("konto/"))).toHaveLength(13);
    expect(paths).toContain("konto/profil.json");
    expect(paths).toContain("konto/befinden.json");
    expect(paths).toContain("konto/sync-konfiguration.json");
  });

  it("enthält keine Trainer-Ansicht-Datei (bewusst aus v1 ausgenommen)", () => {
    const paths = buildExportManifest(input()).map((f) => f.path);
    expect(paths).not.toContain("konto/trainer-ansicht-einstellungen.json");
  });

  it("lässt den Ordner trainingsdaten/ weg, wenn keine Pipeline-Daten zugeordnet sind", () => {
    const paths = buildExportManifest(input({ trainingsdaten: null })).map((f) => f.path);
    expect(paths.some((p) => p.startsWith("trainingsdaten/"))).toBe(false);
  });

  it("schreibt rides/wellness/sonstige, wenn trainingsdaten vorliegen", () => {
    const files = buildExportManifest(
      input({ trainingsdaten: { rides: [{ id: "r1" }], wellness: [], sonstige: { updated: "x" } } }),
    );
    const map = byPath(files);
    expect(JSON.parse(map.get("trainingsdaten/rides.json")!)).toEqual([{ id: "r1" }]);
    expect(JSON.parse(map.get("trainingsdaten/wellness.json")!)).toEqual([]);
    expect(JSON.parse(map.get("trainingsdaten/sonstige-lesedaten.json")!)).toEqual({ updated: "x" });
  });

  it("schreibt bei einem Lesedaten-Ladefehler KEINE trainingsdaten/-Dateien, nur den README-Vermerk", () => {
    const files = buildExportManifest(
      input({ trainingsdaten: null, trainingsdatenError: "HTTP 503 für data/rides.json" }),
    );
    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("trainingsdaten/"))).toBe(false);
    // die 13 Konto-Dateien sind unberührt vollständig
    expect(paths.filter((p) => p.startsWith("konto/"))).toHaveLength(13);
    const readme = byPath(files).get("README.txt")!;
    expect(readme).toContain("konnten nicht geladen werden (HTTP 503 für data/rides.json)");
    expect(readme).toContain("unberührt und vollständig");
  });

  it("serialisiert jede JSON-Datei als gültiges, wieder einlesbares JSON", () => {
    const files = buildExportManifest(
      input({ trainingsdaten: { rides: [], wellness: [], sonstige: {} } }),
    );
    for (const f of files) {
      if (f.path.endsWith(".json")) {
        expect(() => JSON.parse(f.content)).not.toThrow();
      }
    }
  });

  it("macht aus undefined in einem konto-Feld gültiges null-JSON", () => {
    const i = input();
    i.konto.formate = undefined; // bewusst ein fehlender Wert (Feldtyp ist unknown)
    const map = byPath(buildExportManifest(i));
    expect(map.get("konto/formate.json")).toBe("null\n");
  });

  it("nennt im README den Zeitstempel, das Konto und die Datenschutz-Auslassungen", () => {
    const readme = buildExportManifest(input()).find((f) => f.path === "README.txt")!.content;
    expect(readme).toContain("2026-09-06T10:00:00.000Z");
    expect(readme).toContain("Stuhlsen");
    expect(readme).toContain("intervals.icu-API-Key");
    expect(readme).toContain("grobe Standortkoordinaten");
    expect(readme).toContain("Trainer-Ansicht-Einstellungen");
    expect(readme).toContain("CTL/ATL/TSB");
  });

  it("weist im README auf den fehlenden trainingsdaten/-Ordner hin, wenn er fehlt", () => {
    const readme = buildExportManifest(input({ trainingsdaten: null })).find(
      (f) => f.path === "README.txt",
    )!.content;
    expect(readme).toContain("keine");
    // die Ordnerauflistung von trainingsdaten/ fehlt (der Verweis auf
    // rides.json im Hinweis-Block bleibt bestehen – das ist ok)
    expect(readme).not.toContain("Einzelfahrten (normalisiert)");
  });

  it("fällt auf einen Platzhalter zurück, wenn kein Anzeigename gesetzt ist", () => {
    const readme = buildExportManifest(input({ displayName: null })).find(
      (f) => f.path === "README.txt",
    )!.content;
    expect(readme).toContain("(kein Anzeigename)");
  });

  it("ist deterministisch bei gleicher Eingabe", () => {
    expect(buildExportManifest(input())).toEqual(buildExportManifest(input()));
  });
});
