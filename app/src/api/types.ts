export type ErrorCode = "HTTP" | "NETWORK" | "TOKEN_INVALID" | "SCHEMA" | "NO_DATA" | "UNKNOWN";

export interface ResultError {
  code: ErrorCode;
  message: string;
}

export type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ResultError };

/* ── Domänentypen ────────────────────────────────────────────────
   Die Shapes, die die Adapter (api/supabase/*.ts) aus den DB-Zeilen
   erzeugen — nicht die Zeilen selbst. Namen und Feldbedeutungen sind
   1:1 aus data-access/supabase/* der Vanilla-Version übernommen
   (Etappe 2b, Konzept G3/G4: das Datenmodell bleibt unangetastet,
   nur die Zugriffsschicht wird neu gebaut).
   ──────────────────────────────────────────────────────────────── */

export type Role = "athlete" | "coach";

export interface Profile {
  id: string;
  displayName: string | null;
  role: Role;
  coachId: string | null;
  wellbeingPublic: boolean;
  /** Migration 0025 — gibt gemessene FTP + Ramp-Test-Zeitstrahl für den
   *  öffentlichen (ausgeloggten) Lesepfad frei. Self-Service wie
   *  wellbeing_public, Default true. */
  ftpPublic: boolean;
  isAdmin: boolean;
  /** D4b (Migration 0016) — Freigabe der scharfen Leiter-Fortschreibung,
   *  athletenweit wie is_admin, kein Self-Service. */
  ladderProgressionEnabled: boolean;
  /** Migration 0020 — Anzeigepräferenz für Distanz-/Temperatureinheiten,
   *  Self-Service wie wellbeing_public. */
  unitsPreference: "km" | "mi";
  /** Migration 0026 — Ganzwochen-Verschiebung des Trainingsplans gegenüber
   *  der Code-Vorlage (Punkt 1 der 6-Punkte-Liste). Default 0, faktisch nur
   *  für Athlet 4 relevant (generierte Vorlage). Positiv = Plan startet
   *  später. Steuert die Datierung der `plan_cards`, das offset-fähige
   *  Plan-Wochen-Modell und die Sync-Baseline. */
  planOffsetWeeks: number;
}

/** Strukturiertes Workout einer Plankarte. Bewusst `unknown`-durchgereicht:
 *  die Struktur (Intervallblöcke, watts/pct) wird in Etappe 6 (Planungstab)
 *  getypt, wenn die Karten-UI sie tatsächlich liest — hier würde ein
 *  geratener Typ nur eine zweite Wahrheit neben core/workout-*.js schaffen. */
export type WorkoutJson = unknown;

/** Plankarte in der "Session-Shape", die bisher core/planning.js::
 *  applyAdjustment() erzeugt hat (s. toPlanCard() im Adapter). */
export interface PlanCard {
  id: string;
  date: string;
  sortOrder: number;
  name: string | null;
  typ: string | null;
  km: number | null;
  durationMin: number | null;
  tssPlanned: number | null;
  week: string | null;
  phase: string | null;
  details: string | null;
  workout: WorkoutJson;
  workoutStructure: WorkoutJson;
  originalDate?: string;
  movedReason?: string;
  cancelled?: true;
  cancelReason?: string;
  pushedExternalId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Patch für updatePlanCard — jeder Aufrufer schickt nur die Felder, die er
 *  tatsächlich ändert (`undefined` = "nicht anfassen", `null` = "leeren"). */
export interface PlanCardPatch {
  plannedDate?: string;
  /** Position innerhalb desselben Tages (kleiner = weiter oben, = die im
   *  Raster primär gezeigte Karte). Nur das Umsortieren mehrerer Karten an
   *  einem Tag schreibt dieses Feld (buildReorderPatches). */
  sortOrder?: number;
  movedFromDate?: string | null;
  moveReason?: string | null;
  status?: "geplant" | "ausgefallen";
  cancelReason?: string | null;
  title?: string | null;
  typ?: string | null;
  tssPlanned?: number | null;
  km?: number | null;
  details?: string | null;
  workout?: WorkoutJson;
  workoutStructure?: WorkoutJson;
  pushedExternalId?: string | null;
  week?: string | null;
  phase?: string | null;
}

/** Eingabe-Shape der Karten-Dialoge (Anlegen/Vollbearbeitung) — nicht
 *  identisch mit PlanCard: kein id/createdAt/updatedAt, `name` statt title. */
export interface PlanCardInput {
  date: string;
  name: string | null;
  typ: string | null;
  tssPlanned?: number | null;
  km?: number | null;
  details?: string | null;
  workout?: WorkoutJson;
  workoutStructure?: WorkoutJson;
  sortOrder?: number;
}

/* ── Trainingsplan-Generator (Fahrplan 8) ───────────────────────────
   V1 `training_plans` (Migration 0028) als Domänenshape. Der Adapter
   api/supabase/training-plans.ts mappt die snake_case-Zeile hierher;
   die reinen Bau-Helfer in features/planning/plan-persist.ts liefern
   den `TrainingPlanDraft`, den `createTrainingPlan()` schreibt.
   ──────────────────────────────────────────────────────────────── */

export type PlanMode = "event" | "open";
export type PlanModel = "pyramidal" | "polarized" | "block" | "linear";
export type PlanFocus = "allgemein" | "berg" | "langstrecke" | "crit";
export type PlanLevel = "einsteiger" | "fortgeschritten";

/** Was der „Neuer Plan"-Dialog aus Formular + erzeugtem Plan zusammensetzt
 *  und `createTrainingPlan()` in `training_plans` schreibt. `athlete_id` /
 *  `created_by` / `is_active` setzt der Adapter, nicht der Draft. */
export interface TrainingPlanDraft {
  mode: PlanMode;
  goalEventId: string | null;
  startDate: string;
  endDate: string;
  weeks: number;
  model: PlanModel;
  focus: PlanFocus;
  level: PlanLevel;
  trainingWeekdays: number[]; // ISO 1..7
  weeklyHours: number | null;
  indoorShare: number | null; // 0..1
  ftpAtCreation: number | null;
  ftpTarget: number | null;
  /** Roh-Formular + Aggregat-Momentaufnahme (V1 `params`, Reproduzierbarkeit). */
  params: Record<string, unknown>;
  /** V4 `WeekModelEntry[]` — Quelle für plan-week-model (E7). */
  weekModel: unknown[];
}

export interface TrainingPlan extends TrainingPlanDraft {
  id: string;
  athleteId: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EventType = "race" | "other";
export type EventPriority = "main" | "secondary";

export interface EventItem {
  id: string;
  title: string;
  eventDate: string;
  type: EventType;
  priority: EventPriority | null;
  ftpGoal: number | null;
  isTest: boolean;
  note: string | null;
  /** Rennergebnis (Migration 0027, nur bei type='race') — manuell erfasst.
   *  `resultTimeS` = Netto-/Zielzeit in Sekunden. */
  resultTimeS: number | null;
  resultAvgWatts: number | null;
  resultPlaceAg: number | null;
  resultPlaceOverall: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  title: string;
  eventDate: string;
  type: EventType;
  priority?: EventPriority | null;
  ftpGoal?: number | null;
  isTest?: boolean;
  note?: string | null;
  resultTimeS?: number | null;
  resultAvgWatts?: number | null;
  resultPlaceAg?: number | null;
  resultPlaceOverall?: number | null;
}

export type EventPatch = Partial<EventInput>;

/** Ziel des eingeloggten Athleten (Settings, Etappe 9). Nur aktive Ziele
 *  werden je gelesen — ein Ziel wird nie gelöscht, nur deaktiviert
 *  (`goals.is_active`, s. Adapter). */
export interface Goal {
  id: string;
  kind: string;
  targetValue: number | null;
  targetDate: string | null;
  note: string | null;
  isActive: boolean;
}

export interface GoalInput {
  kind: string;
  targetValue?: number | null;
  targetDate?: string | null;
  note?: string | null;
}

export interface Checkin {
  id: string;
  date: string;
  energy: number;
  muscleFeel: number;
  mood: number;
  note: string | null;
  updatedAt: string;
}

/** Freigegebener Check-in aus der `wellbeing_shared`-View — ohne `note`,
 *  serverseitig gefiltert (0003_wellbeing.sql). */
export interface SharedCheckin {
  date: string;
  energy: number;
  muscleFeel: number;
  mood: number;
}

export interface CheckinInput {
  energy: number;
  muscleFeel: number;
  mood: number;
  note?: string | null;
}

/** intervals.icu-Zugangsdaten des eingeloggten Users (Settings) — ersetzt
 *  das frühere localStorage-Popup-Muster (`intervals_api_key`/
 *  `intervals_athlete_id`) für Wahoo-Push UND den Streams-Abruf des
 *  Planungstab-Detail-Charts. `athleteId` ist intervals.icus eigene
 *  Athleten-Kennung (z.B. "i12345"), NICHT die interne "athlete1"/
 *  "athlete2"-ID. */
export interface IntervalsCredentials {
  apiKey: string;
  athleteId: string;
}

/** Grober Standort für die Open-Meteo-Wettervorschau des Sync
 *  (Tabelle `athlete_sync_config`, Migration 0023, Fahrplan 7). Wird
 *  serverseitig auf 2 Nachkommastellen gerundet gespeichert (~1,1 km) und
 *  NUR vom Sync gelesen — nie über einen Frontend-Lesepfad ausgeliefert,
 *  nie in `rides.json`. `null`, solange der Athlet nichts eingetragen hat. */
export interface SyncLocation {
  lat: number | null;
  lon: number | null;
}

export type ProposalOp = "add" | "replace" | "move" | "cancel";
export type ProposalSource = "trainer" | "claude";
export type ProposalStatus = "open" | "accepted" | "rejected" | "stale" | "withdrawn";

export interface Proposal {
  id: string;
  athleteId: string;
  createdBy: string;
  source: ProposalSource;
  groupId: string | null;
  op: ProposalOp;
  targetCardId: string | null;
  targetUpdatedAt: string | null;
  payload: Record<string, unknown> | null;
  reason: string | null;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
}

/** Einzufügender Vorschlag — `source`/`groupId` setzt der Aufrufer
 *  (Trainer-Einzelvorschlag vs. Claude-Import mit gemeinsamer Gruppe). */
export interface ProposalInput {
  op: ProposalOp;
  targetCardId?: string | null;
  targetUpdatedAt?: string | null;
  payload: Record<string, unknown> | null;
  reason?: string | null;
  source: ProposalSource;
  groupId?: string | null;
}
