/* ============================================================
   FEATURES/SETTINGS/GOALS-VIEW-MODEL.TS — Ziele in den Einstellungen
   (Fahrplan 43 E4)

   Reine Logik ohne React/I/O: die Komponente (GoalsSection.tsx) rendert nur.
   Hier: Rechte, Gruppierung nach Rolle, Katalogauswahl, Formularfelder,
   Validierung → GoalInput, Konflikthinweis und die Texte des Ziel-Checks.

   Rechnen tun core/goals.js (Katalog, Konflikte) und core/goal-check.js
   (Prognose aus der gemergten eFTP-Historie) — hier wird nichts nachgerechnet.
   Texte bleiben sachlich: Fakten, keine Wertung, kein Druck.
   ============================================================ */

import { GOAL_CATALOG, goalConflicts } from "../../core/goals.js";
import { assessFtpGoal } from "../../core/goal-check.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "../../core/ftp-forecast.js";
import { fmtDateFull } from "../../core/format.js";
import type { Goal, GoalInput, GoalKey, GoalRole, NutritionGoal, Sport } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

type CatalogEntry = (typeof GOAL_CATALOG)[number];

/** Ziele, deren Zielwert ein Gewicht wäre. Gewichtswerte liegen ausschließlich
 *  in `nutrition_goals` (Fahrplan 43 V1, Z6) und erscheinen hier nie — auch
 *  wenn der Katalog `hasTargetValue` setzt. E6 fragt Tempo und Zielgewicht ab. */
const WEIGHT_GOAL_KEYS: ReadonlySet<string> = new Set(["fett_verlieren"]);

/** Katalogziel, das als `kind` die feste Art „FTP" speichert:
 *  core/ftp-goal.js::pickFtpGoal (Hero-Kachel) und scripts/lib/goals.js lesen
 *  `kind` und erkennen das FTP-Ziel nur daran. */
const FTP_KIND = "FTP";

const MAX_FREE_TEXT = 80;

const NOTICE_SONSTIGES = "Das ist nur eine Notiz. Sie hat keine Wirkung auf Plan und Ernährung.";
const NOTICE_NEEDS_STRENGTH = "Wirkt bis zum Kraftbereich nur auf die Ernährung.";

/* ── Rechte ─────────────────────────────────────────────────────── */

/** Z8: Ziele schreibt nur der Athlet selbst. Wer nicht schreiben darf, sieht
 *  keine Formulare. (Die lesende Trainer-Ansicht mit Ziel und Check:
 *  features/planning/trainer-goals-view-model.ts.) */
export function canEditGoals(profile: { role?: string } | null | undefined): boolean {
  return profile?.role === "athlete";
}

/* ── Gruppierung ────────────────────────────────────────────────── */

export interface GoalGroups {
  main: Goal | null;
  side: Goal | null;
  /** Alte Freitext-Ziele (role = null): sichtbar und beendbar, zählen aber nie
   *  als Haupt- oder Nebenziel. */
  legacy: Goal[];
}

export function groupGoals(goals: readonly Goal[]): GoalGroups {
  return {
    main: goals.find((g) => g.role === "main") ?? null,
    side: goals.find((g) => g.role === "side") ?? null,
    legacy: goals.filter((g) => g.role == null),
  };
}

/** Belegte Rolle → das Ziel, das ein neues ersetzen würde. */
export function replacementFor(groups: GoalGroups, role: GoalRole): Goal | null {
  return role === "main" ? groups.main : groups.side;
}

/** Offener Hinweis vor dem Speichern: welches Ziel das neue ersetzt. Leer, wenn
 *  die Rolle frei ist. */
export function replaceNotice(groups: GoalGroups, role: GoalRole): string {
  const old = replacementFor(groups, role);
  if (!old) return "";
  const word = role === "main" ? "Hauptziel" : "Nebenziel";
  return `Das ersetzt dein bisheriges ${word} „${describeGoal(old).title}“. Das alte Ziel wird beendet, nicht gelöscht.`;
}

/** Vorbelegung der Rolle im Formular: zuerst das Hauptziel, dann das Nebenziel. */
export function defaultRole(groups: GoalGroups): GoalRole {
  if (!groups.main) return "main";
  if (!groups.side) return "side";
  return "main";
}

/* ── Katalog und Formularfelder ─────────────────────────────────── */

/** Katalogziele für die Sportarten des Athleten. Ohne bekannte Sportarten alle;
 *  ein schon gesetztes Ziel (`keepKey`) bleibt wählbar. */
export function catalogChoices(sports: readonly Sport[], keepKey?: GoalKey | null): CatalogEntry[] {
  if (sports.length === 0) return [...GOAL_CATALOG];
  return GOAL_CATALOG.filter((e) => e.key === keepKey || e.sports.some((s) => sports.includes(s)));
}

export interface GoalFields {
  showValue: boolean;
  valueUnit: string;
  valueRequired: boolean;
  showFreeText: boolean;
  /** Offener Hinweis zur Wirkung des Ziels, sonst null. */
  notice: string | null;
}

export function fieldsFor(goalKey: GoalKey | ""): GoalFields {
  const entry = GOAL_CATALOG.find((e) => e.key === goalKey);
  return {
    showValue: !!entry?.hasTargetValue && !WEIGHT_GOAL_KEYS.has(goalKey),
    valueUnit: goalKey === "ftp" ? "W" : "",
    valueRequired: goalKey === "ftp",
    showFreeText: goalKey === "sonstiges",
    notice:
      goalKey === "sonstiges"
        ? NOTICE_SONSTIGES
        : entry?.availability === "needsStrength"
          ? NOTICE_NEEDS_STRENGTH
          : null,
  };
}

/* ── Formular → GoalInput ───────────────────────────────────────── */

export interface GoalFormState {
  goalKey: GoalKey | "";
  role: GoalRole;
  targetValue: string;
  targetDate: string;
  freeText: string;
  /** Tempo in kg pro Woche (nur bei Ziel „Fett verlieren“, Fahrplan 43 E6) */
  pace?: string;
  /** Zielgewicht in kg, optional (nur bei Ziel „Fett verlieren“) */
  targetWeight?: string;
}

export type BuildGoalResult = { ok: true; input: GoalInput } | { ok: false; message: string };

function parseValue(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Validiert das Formular und baut den Datensatz. `kind` bleibt das, was
 *  ältere Leser erwarten: „FTP" für das FTP-Ziel (sonst verliert die
 *  Hero-Kachel das Ziel), sonst das Label, bei „Sonstiges" der Freitext. */
export function buildGoalInput(form: GoalFormState, todayISO: string): BuildGoalResult {
  const entry = GOAL_CATALOG.find((e) => e.key === form.goalKey);
  if (!entry) return { ok: false, message: "Bitte ein Ziel wählen." };

  const fields = fieldsFor(entry.key);

  let kind: string = entry.key === "ftp" ? FTP_KIND : entry.label;
  if (fields.showFreeText) {
    kind = form.freeText.trim();
    if (!kind) return { ok: false, message: "Bitte das Ziel kurz beschreiben." };
    if (kind.length > MAX_FREE_TEXT) {
      return { ok: false, message: `Bitte höchstens ${MAX_FREE_TEXT} Zeichen.` };
    }
  }

  let targetValue: number | null = null;
  if (fields.showValue) {
    targetValue = parseValue(form.targetValue);
    if (fields.valueRequired && (targetValue == null || targetValue <= 0)) {
      return { ok: false, message: "Bitte einen Zielwert in Watt eingeben." };
    }
    if (targetValue != null && targetValue <= 0) targetValue = null;
  }

  let targetDate: string | null = null;
  if (form.targetDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.targetDate)) {
      return { ok: false, message: "Bitte ein gültiges Datum wählen." };
    }
    if (form.targetDate < todayISO) {
      return { ok: false, message: "Das Datum liegt in der Vergangenheit." };
    }
    targetDate = form.targetDate;
  }

  return {
    ok: true,
    input: { kind, goalKey: entry.key, role: form.role, targetValue, targetDate, note: null },
  };
}

/** Formular zum Bearbeiten eines Ziels. Tempo und Zielgewicht stehen nicht am
 *  Ziel, sondern im aktiven Ernährungsziel — nur ein Defizit trägt sie. */
export function formFromGoal(
  goal: Goal,
  nutrition: Pick<NutritionGoal, "goalType" | "pacePerWeekKg" | "targetWeightKg"> | null,
): GoalFormState {
  const lose = nutrition?.goalType === "lose" ? nutrition : null;
  return {
    goalKey: goal.goalKey ?? "",
    role: goal.role ?? "main",
    targetValue: goal.targetValue != null ? String(goal.targetValue) : "",
    targetDate: goal.targetDate ?? "",
    freeText: goal.goalKey === "sonstiges" ? goal.kind : "",
    pace: lose?.pacePerWeekKg != null ? String(lose.pacePerWeekKg) : "",
    targetWeight: lose?.targetWeightKg != null ? String(lose.targetWeightKg) : "",
  };
}

/** Meldung, wenn das Speichern scheitert. `hadReplacement`: ein altes Ziel
 *  sollte ersetzt werden. replaceGoal() aktiviert das alte Ziel nach einem
 *  Fehler wieder; schlägt auch das fehl, steht „inaktiv" in der Meldung
 *  (api/supabase/goals.ts, per Test gesichert) — dann sagen wir das offen. */
export function saveErrorMessage(message: string | undefined, hadReplacement: boolean): string {
  if (hadReplacement && message && /inaktiv/.test(message)) {
    return "Das Ziel konnte nicht gespeichert werden, und das bisherige Ziel konnte nicht wieder aktiviert werden. Bitte prüfe deine Ziele nach dem Neuladen der Seite.";
  }
  return hadReplacement
    ? "Das Ziel konnte nicht gespeichert werden. Dein bisheriges Ziel bleibt aktiv."
    : "Das Ziel konnte nicht gespeichert werden.";
}

/* ── Konflikthinweis ────────────────────────────────────────────── */

/** Hinweis (nie eine Sperre) für die Kombination aus Haupt- und Nebenziel.
 *  Mit `draft` zählt das Formular schon mit: Der Entwurf ersetzt das Ziel
 *  seiner Rolle. Leerer Text = kein Hinweis. */
export function conflictHint(
  groups: GoalGroups,
  draft: { goalKey: GoalKey | ""; role: GoalRole } | null,
): string {
  let main = groups.main?.goalKey ?? undefined;
  let side = groups.side?.goalKey ?? undefined;
  if (draft?.goalKey) {
    if (draft.role === "main") main = draft.goalKey;
    else side = draft.goalKey;
  }
  return goalConflicts({ goalKey: main }, { goalKey: side }).text;
}

/* ── Anzeige eines gespeicherten Ziels ──────────────────────────── */

export interface GoalDescription {
  roleLabel: "Hauptziel" | "Nebenziel" | null;
  title: string;
  valueText: string;
  dateText: string;
  notice: string | null;
}

function legacyHasWatts(kind: string): boolean {
  const k = kind.toLowerCase();
  return k.includes("ftp") || k === "watt";
}

export function describeGoal(goal: Goal): GoalDescription {
  const entry = GOAL_CATALOG.find((e) => e.key === goal.goalKey);
  const isWeight = !!goal.goalKey && WEIGHT_GOAL_KEYS.has(goal.goalKey);
  const hasWatts = goal.goalKey ? goal.goalKey === "ftp" : legacyHasWatts(goal.kind);

  let valueText = "";
  if (!isWeight && goal.targetValue != null) {
    valueText = hasWatts ? `${goal.targetValue} W` : String(goal.targetValue);
  }

  return {
    roleLabel: goal.role === "main" ? "Hauptziel" : goal.role === "side" ? "Nebenziel" : null,
    title: !entry || entry.key === "sonstiges" ? goal.kind : entry.label,
    valueText,
    dateText: goal.targetDate ? fmtDateFull(goal.targetDate) : "",
    notice: goal.goalKey ? fieldsFor(goal.goalKey).notice : null,
  };
}

/* ── Ziel-Check ─────────────────────────────────────────────────── */

/** Das FTP-Ziel, das geprüft wird: Haupt- vor Nebenziel, mit positivem Wert.
 *  Alte Freitext-Ziele ohne Rolle werden nicht geprüft. */
export function pickCheckGoal(groups: GoalGroups): Goal | null {
  return (
    [groups.main, groups.side].find(
      (g): g is Goal => !!g && g.goalKey === "ftp" && g.targetValue != null && g.targetValue > 0,
    ) ?? null
  );
}

/** Dieselbe gemergte eFTP-Historie wie Hero und Analyse — keine zweite Quelle. */
export function mergedEftpHistory(
  rides: readonly Ride[],
  wellness: readonly WellnessDay[],
): Array<{ date: string; eftp: number }> {
  return mergeEftpHistories(eftpHistory(rides as Ride[]), eftpHistoryFromWellness(wellness as WellnessDay[]));
}

export interface FtpCheckRow {
  label: string;
  value: string;
}

export type FtpCheckView =
  | { kind: "needs-current"; text: string }
  | { kind: "too-little-data"; text: string }
  | { kind: "result"; headline: string; rows: FtpCheckRow[]; confidence: string | null };

/** Watt auf eine Nachkommastelle, ohne ",0" bei ganzen Zahlen. */
function fmtW(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

function fmtTrend(wattsPerWeek: number): string {
  const sign = wattsPerWeek > 0 ? "+" : wattsPerWeek < 0 ? "−" : "";
  return `${sign}${fmtW(Math.abs(wattsPerWeek))} W pro Woche`;
}

const CONFIDENCE_LABEL = { high: "hoch", medium: "mittel", low: "niedrig" } as const;

type CheckOk = Extract<ReturnType<typeof assessFtpGoal>, { ok: true }>;

function headlineOf(r: CheckOk): string {
  switch (r.verdict) {
    case "reached":
      return "Die aktuelle FTP liegt bei oder über dem Ziel.";
    case "on-track":
      return "Der Trend liegt über dem nötigen Tempo.";
    case "tight":
      return "Der Trend liegt unter dem nötigen Tempo.";
    case "no-date":
      return "Ohne Zieldatum: so sähe es beim aktuellen Tempo aus.";
    default:
      return r.wattsPerWeek != null && r.wattsPerWeek <= 0
        ? "Der Trend ist flach oder fallend."
        : "Das Ziel liegt mehr als 10 % über der aktuellen FTP.";
  }
}

function etaText(r: CheckOk): string {
  if (r.etaISO) return `ca. ${fmtDateFull(r.etaISO)}`;
  if (r.wattsPerWeek != null && r.wattsPerWeek <= 0) return "bei flachem Trend nicht absehbar";
  return "in den nächsten 2 Jahren nicht absehbar";
}

/** Texte des Ziel-Checks für ein FTP-Ziel. `null` = nichts zu prüfen (kein
 *  Zielwert). Bei zu wenig Daten kommen keine Zahlen, nur die offene Aussage. */
export function buildFtpCheck(input: {
  goal: { targetValue: number | null; targetDate: string | null };
  current: number | null;
  history: Array<{ date: string; eftp: number }>;
  todayISO: string;
}): FtpCheckView | null {
  const { goal, current, history, todayISO } = input;
  const target = goal.targetValue;
  if (target == null || !(target > 0)) return null;

  if (current == null) {
    return {
      kind: "needs-current",
      text: "Für den Check fehlt deine aktuelle FTP. Du kannst sie unter „FTP-Historie“ eintragen.",
    };
  }

  const r = assessFtpGoal({ current, target, targetDate: goal.targetDate, history, todayISO });
  if (!r.ok) {
    return {
      kind: "too-little-data",
      text: "Für eine Prognose reichen die eFTP-Daten noch nicht. Sobald genug aktuelle Werte da sind, erscheint der Check.",
    };
  }

  const rows: FtpCheckRow[] = [{ label: "Aktuelle FTP", value: `${fmtW(current)} W` }];
  if (r.wattsPerWeek != null) rows.push({ label: "Trend (eFTP)", value: fmtTrend(r.wattsPerWeek) });
  if (r.needPerWeek != null && goal.targetDate) {
    rows.push({
      label: "Nötiges Tempo",
      value: `${fmtW(r.needPerWeek)} W pro Woche bis ${fmtDateFull(goal.targetDate)}`,
    });
  }
  if (r.projectedAtDate) {
    const p = r.projectedAtDate;
    rows.push({
      label: "Prognose zum Zieldatum",
      value: `${Math.round(p.projected)} W (Spanne ${Math.round(p.low)}–${Math.round(p.high)} W)`,
    });
  }
  if (r.verdict !== "reached") rows.push({ label: "Voraussichtlich erreicht", value: etaText(r) });
  if (r.interimTarget) {
    rows.push({
      label: "Zwischenziel",
      value: `${r.interimTarget.watts} W bis ${fmtDateFull(r.interimTarget.dateISO)}`,
    });
  }

  return {
    kind: "result",
    headline: headlineOf(r),
    rows,
    confidence: r.confidence
      ? `Sicherheit der Aussage: ${CONFIDENCE_LABEL[r.confidence]}. Grundlage ist der eFTP-Verlauf der letzten Wochen; eFTP kann springen.`
      : null,
  };
}
