/* ============================================================
   CONFIG.TS — Athleten-Stammdaten (Etappe 2b)

   Bewusst NUR der Teil von state/config.js, den die Zugriffsschicht
   tatsächlich braucht: die Athletenliste (der Anzeigename ist der
   Schlüssel, über den athlete1/athlete2 auf die Supabase-Profil-UUID
   aufgelöst wird) plus die JSON-Endpoints der Pipeline (5.5).

   `hrZones` und `cadenceTarget` sind mit Etappe 3 nach `sports/cycling/
   metrics.ts` gewandert (Konzept G5). Die globalen FTP-Singletons wandern
   weiterhin erst mit ihren Konsumenten mit. `PHASES`/`phaseColor()` sind
   jetzt da (Etappe 6a, Planungstab-Wochenbadges) — `weekOrder`/`weekIndex`
   bewusst NICHT: der Planungstab braucht sie nicht (Wochen-Reihenfolge
   ergibt sich dort schon aus der Datums-Sortierung der Karten), sie
   wandern erst mit, wenn ein Chart (Etappe 8) sie tatsächlich braucht.

   `hrMax` ist bewusst NICHT nach `sports/` gegangen: der Wert gehört zum
   Athleten, nicht zur Sportart (die HF-Zonen dort sind reine Anteile
   davon). Er kommt als Feld in `AthleteConfig` dazu, sobald ein Konsument
   ihn braucht — s. `sports/README.md`.

   Datenschutz: keine echten Namen — intern athlete1/athlete2, in der UI
   die selbstgewählten Pseudonyme (GitHub-Handles).
   ============================================================ */

export interface AthleteConfig {
  id: string;
  /** Selbstgewähltes Pseudonym — zugleich `profiles.display_name` in
   *  Supabase und damit der Schlüssel der UUID-Auflösung. */
  name: string;
  /** JSON-Pipeline (5.5): die per Cron erzeugte Datei dieses Athleten,
   *  OHNE führenden Slash — der Loader setzt `import.meta.env.BASE_URL`
   *  davor. Ein absoluter `/data/…`-Pfad wäre auf GitHub Pages falsch
   *  (Projektseite liegt unter /training-dashboard/), ein relativer
   *  `./data/…` bräche bei tiefen Client-Routen wie /planning. */
  endpoint: string;
  /** Per Ramp-Test GEMESSEN — nie mit dem laufend geschätzten eFTP
   *  aus intervals.icu vermischen (FTP-Dreiklang, s. AGENTS.md). */
  ftpMeasured: number;
  ftpMeasuredDate: string;
  eFTP: number;
  ftpGoal: number;
  /** Saison-Start-FTP für den Hero-Fortschrittsring. `null` bei Athlet 2 —
   *  keine eigene Saison-Basis, der Meilenstein entfällt dort. */
  seasonStartFtp: number | null;
  dataSources: string[];
}

export const PRIMARY_ATHLETE_ID = "athlete1";

export const ATHLETES: readonly AthleteConfig[] = [
  {
    id: "athlete1",
    name: "Stuhlsen",
    endpoint: "data/rides.json",
    ftpMeasured: 193,
    ftpMeasuredDate: "2026-06-12",
    eFTP: 199,
    ftpGoal: 210,
    seasonStartFtp: 166,
    dataSources: ["intervals.icu", "Apple Health"],
  },
  {
    id: "athlete2",
    name: "hc_diZee",
    endpoint: "data/rides-2.json",
    ftpMeasured: 265,
    ftpMeasuredDate: "2026-06-24",
    eFTP: 261,
    ftpGoal: 280,
    seasonStartFtp: null,
    dataSources: ["intervals.icu", "Amazfit"],
  },
];

export function athleteConfig(id: string): AthleteConfig | null {
  return ATHLETES.find((a) => a.id === id) ?? null;
}

interface PhaseInfo {
  color: string;
  label: string;
}

/** 1:1 aus `assets/js/state/config.js::phases`. `"Taper"` ist bewusst ohne
 *  Präfix geteilt zwischen Athlet 1 (Trainingsblock-Schema) und Athlet 2
 *  (GFNY Bremen 2026) — `.label` wird nirgends gerendert (nur `.color` über
 *  `phaseColor()`), beide Athleten wollen hier ohnehin dasselbe Grün. */
export const PHASES: Record<string, PhaseInfo> = {
  // Notion-Ära (Athlet 1, historisch)
  Vorbereitung: { color: "#c9a84c", label: "Vorbereitung" },
  Vor: { color: "#c9a84c", label: "Vorbereitung" },
  "Phase 1": { color: "#6b7280", label: "Phase 1 — Basisaufbau" },
  "Phase 2": { color: "#4a7fa8", label: "Phase 2 — Volumenaufbau" },
  "Phase 3": { color: "#7c5cbf", label: "Phase 3 — Leistungsaufbau" },
  // Trainingsblock-Phasen (Athlet 1, intervals.icu-Ära)
  Übergang: { color: "#c9a84c", label: "Übergang" },
  "Sweet Spot": { color: "#e08a3c", label: "Block 1 — Sweet Spot" },
  Schwelle: { color: "#d94f4f", label: "Block 2 — Schwelle" },
  VO2max: { color: "#a24ad0", label: "Block 3 — VO₂max" },
  Taper: { color: "#4a9a6e", label: "Taper + Retest" },
  Erholung: { color: "#6b9fa8", label: "Erholungswoche" },
  // Athlet 2 (eigener Plan, GFNY Bremen 2026) — diese drei Namen existieren
  // bei Athlet 1 nicht, brauchen daher kein Präfix. Der Planungstab zeigt
  // den Phase-Key selbst als Text (kein Label-Lookup).
  Basis: { color: "#4a7fa8", label: "Block 1 — Basis (KW23–26)" },
  Aufbau: {
    color: "#e08a3c",
    label: "Block 2 — Aufbau: Threshold + Over-Under (KW27–30)",
  },
  Rennhärte: { color: "#d94f4f", label: "Block 3 — Rennhärte + Sprint (KW31–34)" },
};

export function phaseColor(phase: string | null | undefined): string {
  return (phase ? PHASES[phase] : undefined)?.color ?? "#6b7280";
}
