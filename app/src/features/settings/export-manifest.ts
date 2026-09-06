/* ============================================================
   FEATURES/SETTINGS/EXPORT-MANIFEST.TS — Zusammenbau des Daten-Exports
   (Idee 10, „Meine Daten herunterladen")

   Reine Funktion, keine Imports, kein I/O: nimmt die bereits geladenen
   Daten entgegen und liefert die Liste der Dateien (Pfad + Textinhalt),
   die der Orchestrator (`export-own-data.ts`) dann per fflate zippt.
   Hier lebt die testbare Logik — welche Dateien, welche Namen, welcher
   README-Text. Der Orchestrator kümmert sich um Laden, ZIP und Download.

   Datenschutz: diese Funktion serialisiert nur, was sie bekommt. Die
   Schwärzung der `athlete_sync_config` (API-Key, Koordinaten) passiert
   VOR dem Aufruf im Orchestrator — hier kommen Koordinaten gar nicht an.
   ============================================================ */

/** Eine Datei im Export-ZIP. */
export interface ExportFile {
  /** Pfad im ZIP, z. B. `"konto/ziele-aktiv.json"`. */
  path: string;
  /** Fertiger Textinhalt (UTF-8). */
  content: string;
}

/** Der `konto/`-Teil: was der Nutzer selbst im Dashboard eingegeben hat.
 *  Jeder Wert wird 1:1 als JSON serialisiert — die Typen sind bewusst
 *  `unknown`, diese Schicht interpretiert nichts. */
export interface ExportKonto {
  profil: unknown;
  zieleAktiv: unknown;
  events: unknown;
  trainingskarten: unknown;
  befinden: unknown;
  ftpVerlauf: unknown;
  vorschlaege: unknown;
  trainingsplanAktiv: unknown;
  formate: unknown;
  heroLayout: unknown;
  leiterVerlauf: unknown;
  exportEinstellungen: unknown;
  /** Bereits geschwärztes Objekt (nur Hinweistext), s. Modulkopf. */
  syncKonfiguration: unknown;
}

/** Der `trainingsdaten/`-Teil: aus intervals.icu abgeleitete Lesedaten.
 *  `null`, wenn dem Login kein Pipeline-Athlet zugeordnet ist ODER die
 *  Pipeline-Daten nicht geladen werden konnten (dann `trainingsdatenError`
 *  im Input). */
export interface ExportTrainingsdaten {
  rides: unknown;
  wellness: unknown;
  sonstige: unknown;
}

export interface ExportManifestInput {
  /** ISO-Zeitstempel der Erzeugung (Orchestrator: `new Date().toISOString()`). */
  exportedAt: string;
  /** Anzeigename des Kontos, nur für den README-Kopf. */
  displayName: string | null;
  konto: ExportKonto;
  trainingsdaten: ExportTrainingsdaten | null;
  /** Fehlermeldung, wenn die Lesedaten-Pipeline nicht geladen werden konnte
   *  (WLAN-Wackler o. Ä.). Die Konto-Daten bleiben davon unberührt und
   *  vollständig — nur `trainingsdaten/` fehlt dann, mit Vermerk im README.
   *  `null`, wenn kein Fehler auftrat. */
  trainingsdatenError: string | null;
}

const JSON_INDENT = 2;

/** Ein Wert als hübsch eingerückte JSON-Datei. `undefined` → `null`,
 *  damit eine Datei immer gültiges JSON enthält. */
function jsonFile(path: string, value: unknown): ExportFile {
  return { path, content: `${JSON.stringify(value ?? null, null, JSON_INDENT)}\n` };
}

function buildReadme(input: ExportManifestInput): string {
  const konto = input.displayName ?? "(kein Anzeigename)";
  const lines = [
    "Datenexport – Training Dashboard",
    "===============================",
    "",
    `Erstellt am: ${input.exportedAt}`,
    `Konto: ${konto}`,
    "",
    "Dieser Export enthält alle Daten, die unter deinem Login gespeichert",
    "sind, als JSON-Dateien (UTF-8, eingerückt). Zwei Ordner:",
    "",
    "  konto/          – Daten, die du selbst im Dashboard eingegeben hast",
    "  trainingsdaten/ – aus intervals.icu abgeleitete Lesedaten",
    "",
    'Ordner "konto/"',
    "---------------",
    "  profil.json                 Profil-Grunddaten (Anzeigename, Rolle, Einstellungen)",
    "  ziele-aktiv.json            Aktive Ziele. Deaktivierte Ziele werden nicht gespeichert.",
    "  events.json                 Wettkämpfe und Termine inkl. Ergebnisse",
    "  trainingskarten.json        Alle Plan-Karten inkl. Verschiebe- und Ausfall-Historie",
    "  befinden.json               Tägliche Check-ins inkl. Notizen",
    "  ftp-verlauf.json            FTP-Historie (Ramp-Tests u. a.)",
    "  vorschlaege.json            Trainer-/Import-Vorschläge (jeder Status)",
    "  trainingsplan-aktiv.json    Aktiver selbst gebauter Trainingsplan (null, wenn keiner)",
    "  formate.json                Aktiv/inaktiv gesetzte Session-Formate",
    "  hero-layout.json            Kachel-Anordnung der Startseite je Athleten-Tab",
    "  leiter-verlauf.json         Progressions-Leiter-Historie",
    "  export-einstellungen.json   Gespeicherte Export-Richtungsvorgabe",
    "  sync-konfiguration.json     Nur ein Hinweis – siehe unten",
    "",
  ];
  if (input.trainingsdaten) {
    lines.push(
      'Ordner "trainingsdaten/"',
      "------------------------",
      "  rides.json                  Einzelfahrten (normalisiert)",
      "  wellness.json               Tageswerte (Schlaf, HRV, Ruhepuls, Gewicht …)",
      "  sonstige-lesedaten.json     Leistungskurven, Wetter-Forecast, Plan-Sessions, Meta",
      "",
    );
  } else if (input.trainingsdatenError) {
    lines.push(
      'Ordner "trainingsdaten/": nicht enthalten – die abgeleiteten Lesedaten',
      `konnten nicht geladen werden (${input.trainingsdatenError}).`,
      "Die Konto-Daten oben sind davon unberührt und vollständig.",
      "",
    );
  } else {
    lines.push(
      'Ordner "trainingsdaten/": nicht enthalten – deinem Login sind keine',
      "Pipeline-Lesedaten zugeordnet.",
      "",
    );
  }
  lines.push(
    "Nicht enthalten (Datenschutz)",
    "-----------------------------",
    "  – intervals.icu-API-Key",
    "  – grobe Standortkoordinaten",
    "  – Trainer-Ansicht-Einstellungen (enthalten IDs anderer Personen)",
    "  Diese liegen ausschließlich serverseitig (owner-only) und verlassen",
    "  den Server nicht.",
    "",
    "Hinweise",
    "--------",
    "  – Eine leere Datei ([] oder null) bedeutet: kein Eintrag vorhanden.",
    "  – Der PMC-/Form-Verlauf (CTL/ATL/TSB) ist kein gespeicherter Datensatz,",
    "    sondern wird aus rides.json berechnet.",
    "",
  );
  return lines.join("\n");
}

/** Baut die vollständige Dateiliste des Exports. Deterministisch: gleiche
 *  Eingabe → gleiche Ausgabe, keine Zeit-/Zufallswerte außer dem
 *  mitgegebenen `exportedAt`. */
export function buildExportManifest(input: ExportManifestInput): ExportFile[] {
  const files: ExportFile[] = [{ path: "README.txt", content: buildReadme(input) }];

  const k = input.konto;
  files.push(
    jsonFile("konto/profil.json", k.profil),
    jsonFile("konto/ziele-aktiv.json", k.zieleAktiv),
    jsonFile("konto/events.json", k.events),
    jsonFile("konto/trainingskarten.json", k.trainingskarten),
    jsonFile("konto/befinden.json", k.befinden),
    jsonFile("konto/ftp-verlauf.json", k.ftpVerlauf),
    jsonFile("konto/vorschlaege.json", k.vorschlaege),
    jsonFile("konto/trainingsplan-aktiv.json", k.trainingsplanAktiv),
    jsonFile("konto/formate.json", k.formate),
    jsonFile("konto/hero-layout.json", k.heroLayout),
    jsonFile("konto/leiter-verlauf.json", k.leiterVerlauf),
    jsonFile("konto/export-einstellungen.json", k.exportEinstellungen),
    jsonFile("konto/sync-konfiguration.json", k.syncKonfiguration),
  );

  if (input.trainingsdaten) {
    files.push(
      jsonFile("trainingsdaten/rides.json", input.trainingsdaten.rides),
      jsonFile("trainingsdaten/wellness.json", input.trainingsdaten.wellness),
      jsonFile("trainingsdaten/sonstige-lesedaten.json", input.trainingsdaten.sonstige),
    );
  }

  return files;
}
