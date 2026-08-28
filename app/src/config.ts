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
   *  aus intervals.icu vermischen (FTP-Dreiklang, s. AGENTS.md).
   *  `null` bei einem Einsteiger ohne Leistungstest (Athlet 4) — alle
   *  Lesestellen behandeln das über `?? null`/`?? 0`, die FTP-Widgets im
   *  Hero blenden sich dann aus. */
  ftpMeasured: number | null;
  ftpMeasuredDate: string | null;
  eFTP: number | null;
  ftpGoal: number | null;
  /** Saison-Start-FTP für den Hero-Fortschrittsring. `null` bei Athlet 2 —
   *  keine eigene Saison-Basis, der Meilenstein entfällt dort. */
  seasonStartFtp: number | null;
  dataSources: string[];
  /** Grundumsatz-Schätzgrundlage (Mifflin-St-Jeor), Analyse-Tab "Regeneration
   *  & Körper" — nur Fallback, wenn Wellness keine `restingEnergy` trägt.
   *  1:1 aus `assets/js/state/config.js::athletes[].bmr`, nur bei Athlet 2
   *  gesetzt. */
  bmr?: { heightCm: number; age: number; sex: string; weightKg: number };
  /** Reiner Vergleichsathlet ohne Schreibpfad (kein Befinden, keine
   *  Planungs-Edits, kein Wahoo-Push) — auch für den eigenen Login. Nur
   *  Athlet 2. Athlet 1 und Athlet 4 haben das volle Modell und setzen
   *  dieses Flag NICHT. `isReadOnlyAthlete()` liest es. */
  readOnly?: boolean;
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
    bmr: { heightCm: 185, age: 40, sex: "m", weightKg: 92.5 },
    readOnly: true,
  },
  {
    // Athlet 4 ("Bentastiic") — Renn-/Trainings-Einsteiger. Volles Modell
    // (eigener Login, Befinden, editierbare plan_cards), aber Lesedaten wie
    // Athlet 2 (intervals.icu + Supabase, kein Notion). Der intervals.icu-
    // Key kommt aus Settings (Tabelle intervals_credentials), nicht aus einem
    // Sync-Secret. WATTLOS bis zum ersten Test (scripts/lib/plan-athlete4.js,
    // KW47) — FTP-Felder `null`, die Hero-FTP-Widgets blenden sich dann aus.
    // Die interne ID "athlete3" ist reserviert, aber bewusst noch nicht
    // verdrahtet — daher die Lücke.
    id: "athlete4",
    name: "bentastiic",
    endpoint: "data/rides-4.json",
    ftpMeasured: null,
    ftpMeasuredDate: null,
    eFTP: null,
    ftpGoal: null,
    seasonStartFtp: null,
    dataSources: ["intervals.icu"],
  },
];

export function athleteConfig(id: string): AthleteConfig | null {
  return ATHLETES.find((a) => a.id === id) ?? null;
}

/** Reiner Vergleichsathlet ohne Schreibpfad (nur Athlet 2)? Ersetzt den
 *  früheren `=== PRIMARY_ATHLETE_ID`-Klammergriff im Planungstab — der galt
 *  nur, solange athlete1 der einzige Athlet mit vollem Modell war. */
export function isReadOnlyAthlete(id: string): boolean {
  return athleteConfig(id)?.readOnly === true;
}

/** 1:1 aus `assets/js/state/config.js::retestDate` — FTP-Retest in der
 *  Taper-Woche (14.–20.09.2026). Athletenweiter Termin, nicht Teil von
 *  `AthleteConfig`: nur bei Athlet 1 relevant (Leistungsdiagnostik,
 *  Etappe 11e prüft `ownPlan` selbst, wie das Original CONFIG.retestDate). */
export const RETEST_DATE = "2026-09-19";

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
  // Athlet 4 ("Bentastiic", Einsteiger-Vorlage, KW36–47) — eigene Namen,
  // keine Überschneidung mit den Phasen oben. Farben aus derselben Zonen-
  // Skala wie die übrigen Phasen (kein neuer Basiston): Blau = locker/Aufbau,
  // Orange = Qualität, Grün = Test. "Erholung" wird mit oben geteilt.
  Einstieg: { color: "#4a7fa8", label: "Einstieg — Gewöhnung (KW36–38)" },
  Grundlagen: { color: "#4a7fa8", label: "Grundlagen — erste zügige Blöcke (KW40–42)" },
  Steigerung: { color: "#e08a3c", label: "Steigerung — längere zügige Blöcke (KW44–46)" },
  Test: { color: "#4a9a6e", label: "Test — 20-Min-Test (KW47)" },
};

export function phaseColor(phase: string | null | undefined): string {
  return (phase ? PHASES[phase] : undefined)?.color ?? "#6b7280";
}

/** 1:1 aus `assets/js/state/config.js::weekOrder` — Sortier-Fallback für
 *  Wochen-Label-Strings, die keine ISO-Kalenderwoche sind (Plan-1-Historie
 *  "W1".."W12", Athlet-2-Planungstab "KW23".."KW35"). Bewusst erst hier
 *  ergänzt (Etappe 11b, Fahrtenbuch) statt schon in Etappe 2b — der
 *  Planungstab brauchte es nicht (Wochen-Reihenfolge dort über
 *  Datums-Sortierung der Karten), das Fahrtenbuch sortiert dagegen über
 *  `weekSortIndex()` (core/aggregate.js) mit genau diesem Fallback. */
export const WEEK_ORDER: readonly string[] = [
  // Notion-Ära (Athlet 1, historisch)
  "Vor W1",
  "Vor",
  "W1",
  "W2",
  "W3",
  "W4",
  "W5",
  "W6",
  "W7",
  "W8",
  "W9",
  "W10",
  "W11",
  "W12",
  // Athlet 2 (eigener Plan, GFNY Bremen 2026, KW23–KW35)
  "KW23",
  "KW24",
  "KW25",
  "KW26",
  "KW27",
  "KW28",
  "KW29",
  "KW30",
  "KW31",
  "KW32",
  "KW33",
  "KW34",
  "KW35",
  // Athlet 4 ("Bentastiic", Einsteiger-Vorlage, KW36–KW47)
  "KW36",
  "KW37",
  "KW38",
  "KW39",
  "KW40",
  "KW41",
  "KW42",
  "KW43",
  "KW44",
  "KW45",
  "KW46",
  "KW47",
];

export function weekIndex(week: string | null | undefined): number {
  if (!week) return 999;
  const i = WEEK_ORDER.indexOf(week);
  return i === -1 ? 999 : i;
}
