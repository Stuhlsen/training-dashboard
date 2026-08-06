/* ============================================================
   CONFIG.TS — Athleten-Stammdaten (Etappe 2b)

   Bewusst NUR der Teil von state/config.js, den die Zugriffsschicht
   tatsächlich braucht: die Athletenliste (der Anzeigename ist der
   Schlüssel, über den athlete1/athlete2 auf die Supabase-Profil-UUID
   aufgelöst wird) plus die JSON-Endpoints der Pipeline (5.5).

   `phases`, `weekOrder`, `hrZones`, `cadenceTarget` und die globalen
   FTP-Singletons wandern erst mit ihren Konsumenten mit — die Zonen-/
   Metrikwerte laut Konzept G5 nach `sports/cycling/` (Etappe 3), die
   Phasenfarben in den Planungstab (Etappe 6). Sie hier vorsorglich
   mitzuschleppen hieße, sie zweimal pflegen zu müssen, solange die
   Vanilla-Seite live ist.

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
