/* ============================================================
   FEATURES/NUTRITION/NUTRITION-DAY-MODEL.TS — Tagesziel aus den
   Rohdaten (reine Funktion, kein I/O, keine React-Hooks)
   (Fahrplan 23, E6 PR A; Entscheidungen E30, E34, E35)

   Führt Profil, Wellness, Ernährungsziel und die geplante Einheit
   des Tages zu `estimateDailyGoal` (core/nutrition.js) zusammen.
   Ergebnis: entweder das Tagesziel samt Formelname/Hinweisen/Datum des
   Körperfett-Werts, ODER die Liste der fehlenden Angaben.

   Regeln:
   - Gewicht (E30): neuester Wellness-Wert, wenn höchstens 7 Tage alt,
     sonst Profilgewicht, sonst fehlt es.
   - Körperfett: NUR ein gemessener Wellness-Wert samt Datum, nie ein
     Standardwert (12/20 %). Keine Frist (E34). Wellness liefert Prozent,
     estimateDailyGoal erwartet Dezimal (0,12) → hier durch 100.
   - Einheit des Tages: Rad-Karten des Tages (nicht abgesagt). Watt aus
     der Workout-Struktur (zeitgewichtetes Mittel in % FTP) × FTP, sonst
     aus dem geplanten TSS. Kein Karteneintrag = Ruhetag.
   ============================================================ */

import { estimateCarbTarget, estimateDailyGoal, proteinRangeG } from "../../core/nutrition.js";
import { intensityClassForCard } from "../../core/plan-config.js";
import { addDaysISO } from "../../core/format.js";
import { expandWorkoutPhases } from "../../core/workout-math.js";
import { activitySport } from "../../core/activity-sport.js";
import type { NutritionGoal, PlanCard } from "../../api/types";

/** Wellness-Werte sind höchstens so viele Tage alt, damit sie das Profilgewicht schlagen (E30). */
export const WEIGHT_MAX_AGE_DAYS = 7;

export interface NutritionWellnessDay {
  date?: string;
  dateISO?: string;
  weight?: number | null;
  /** Prozent (z. B. 18.5), wie scripts/lib/wellness.js es liefert */
  bodyFat?: number | null;
  /** Aufgenommene kcal (Zufuhr) aus der Sync-Pipeline, falls getrackt */
  kcalConsumed?: number | null;
}

export interface NutritionProfileInput {
  heightCm: number | null;
  /** ISO-Datum YYYY-MM-DD */
  birthdate: string | null;
  weightKg: number | null;
  sex: "m" | "f" | null;
}

/** Was die aktiven Ziele (`goals`, Fahrplan 43) für die Ernährung bedeuten.
 *  Fehlt das Feld, rechnet alles wie vor E6. */
export interface DayGoalProfile {
  /** Ziel „Fett verlieren“ ist aktiv (Haupt- oder Nebenziel): strenger Boden, Defizit-Regeln. */
  fatLoss: boolean;
  /** Eiweiß in g pro kg Körpergewicht, falls das Profil einen Bereich liefert */
  protein: { min: number; max: number } | null;
  carbs: { followLoad?: boolean; hardDaysFueled?: boolean } | null;
}

/** Zusatzangaben zum Tagesziel, nur mit `goals`. */
export interface DayGoalInfo {
  strictFloor: boolean;
  /** Warum ein geplantes Defizit heute entfällt, sonst null */
  deficitBlockedReason: "no-body-fat" | "hard-day" | null;
  /** Für den Folgetag steht nichts im Plan; ein Defizit bleibt deshalb bestehen */
  nextDayUnknown: boolean;
  /** Energieverfügbarkeit im Bereich 30 bis 45 kcal/kg Magermasse */
  eaWarn: boolean;
  /** Das gespeicherte Tempo lag über dem Deckel und wurde dafür gekürzt */
  paceCapped: boolean;
  proteinG: { min: number; max: number } | null;
  carbsG: [number, number] | null;
}

export interface NutritionDayInput {
  dateISO: string;
  profile: NutritionProfileInput | null;
  wellness: readonly NutritionWellnessDay[];
  goal: NutritionGoal | null;
  /** Plan-Karten (beliebige Tage — gefiltert wird hier nach `dateISO`) */
  cards: readonly PlanCard[];
  /** Aktuelle FTP in Watt, oder null */
  ftpWatts: number | null;
  /** Wirkung der aktiven Ziele; fehlt = wie vor Fahrplan 43 E6 */
  goals?: DayGoalProfile | null;
}

export type MissingField = "Gewicht" | "Körpergröße" | "Geburtsdatum";

export type NutritionDay =
  | {
      ok: true;
      dateISO: string;
      target: number;
      floor: number;
      capped: boolean;
      bmr: number;
      formula: "cunningham-1980" | "ten-haaf-2014";
      hints: string[];
      /** Datum des gemessenen Körperfett-Werts (nur bei Cunningham), sonst null */
      bodyFatDate: string | null;
      sexAssumed: boolean;
      trainingKcal: number;
      /** Es gibt eine Rad-Einheit am Tag, ihre Energie ließ sich aber nicht berechnen (FTP/Intensität fehlt) */
      trainingUnknown: boolean;
      weightKg: number;
      weightSource: "wellness" | "profile";
      sourceKeys: string[];
      /** Nur wenn `goals` übergeben wurde */
      goalInfo?: DayGoalInfo;
    }
  | { ok: false; missing: MissingField[]; hint: string | null };

/* ── kleine Hilfen ─────────────────────────────────────────── */

const isPositive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(iso: string): number | null {
  if (!ISO_RE.test(iso)) return null;
  const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Number.isNaN(t) ? null : Math.round(t / 86_400_000);
}

/** Volle Lebensjahre am Stichtag, oder null bei ungültigem/zukünftigem Geburtsdatum. */
export function ageOn(birthdate: string | null, dateISO: string): number | null {
  if (!birthdate || !ISO_RE.test(birthdate) || !ISO_RE.test(dateISO)) return null;
  if (dayNumber(birthdate) === null || dayNumber(dateISO) === null) return null;
  let age = +dateISO.slice(0, 4) - +birthdate.slice(0, 4);
  // Geburtstag in diesem Jahr noch nicht erreicht? (MM-DD-Vergleich genügt bei ISO)
  if (dateISO.slice(5) < birthdate.slice(5)) age -= 1;
  return age >= 0 ? age : null;
}

const wellnessDate = (w: NutritionWellnessDay): string | null => w.dateISO || w.date || null;

/** Neuester Wellness-Tag bis einschließlich `dateISO`, dessen `pick` einen Wert > 0 liefert. */
function latestWellness(
  wellness: readonly NutritionWellnessDay[],
  dateISO: string,
  pick: (w: NutritionWellnessDay) => number | null | undefined,
): { value: number; date: string } | null {
  let best: { value: number; date: string } | null = null;
  for (const w of wellness) {
    const date = wellnessDate(w);
    const value = pick(w);
    if (!date || !ISO_RE.test(date) || date > dateISO || !isPositive(value)) continue;
    if (!best || date > best.date) best = { value, date };
  }
  return best;
}

/** Gewichtsquelle nach E30. */
export function resolveWeight(
  wellness: readonly NutritionWellnessDay[],
  profileWeightKg: number | null,
  dateISO: string,
): { weightKg: number; source: "wellness" | "profile" } | null {
  const latest = latestWellness(wellness, dateISO, (w) => w.weight);
  if (latest) {
    const age = (dayNumber(dateISO) ?? 0) - (dayNumber(latest.date) ?? 0);
    if (age <= WEIGHT_MAX_AGE_DAYS) return { weightKg: latest.value, source: "wellness" };
  }
  if (isPositive(profileWeightKg)) return { weightKg: profileWeightKg, source: "profile" };
  return null;
}

/** Mittlere Intensität (% FTP) einer Karte: zeitgewichtet aus der Workout-Struktur,
 *  sonst aus dem geplanten TSS (IF = √(TSS / (Stunden · 100))). null, wenn beides fehlt. */
function cardIntensityPct(card: PlanCard, minutes: number): number | null {
  const phases = expandWorkoutPhases(card.workoutStructure as { steps?: unknown[] } | null);
  let weighted = 0;
  let seconds = 0;
  for (const p of phases) {
    if (p.pct == null) continue;
    weighted += p.pct * p.durationS;
    seconds += p.durationS;
  }
  if (seconds > 0) return weighted / seconds;

  if (isPositive(card.tssPlanned)) {
    const intensityFactor = Math.sqrt(card.tssPlanned / ((minutes / 60) * 100));
    return Number.isFinite(intensityFactor) ? intensityFactor * 100 : null;
  }
  return null;
}

/** Die Rad-Einheit(en) des Tages als eine Einheit `{watt, min}` für estimateDailyGoal. */
export function sessionForDay(
  cards: readonly PlanCard[],
  dateISO: string,
  ftpWatts: number | null,
): { session: { watt: number; min: number } | null; unknown: boolean } {
  let totalMin = 0;
  let totalKJ = 0;
  let unknown = false;

  for (const card of cards) {
    if (card.date !== dateISO || card.cancelled) continue;
    if (activitySport(card) !== "ride") continue;
    const minutes = card.durationMin;
    if (!isPositive(minutes)) continue;

    const pct = cardIntensityPct(card, minutes);
    if (!isPositive(ftpWatts) || pct == null || !(pct > 0)) {
      unknown = true;
      continue;
    }
    totalMin += minutes;
    totalKJ += ((pct / 100) * ftpWatts * minutes * 60) / 1000;
  }

  if (totalMin === 0) return { session: null, unknown };
  return { session: { watt: (totalKJ * 1000) / (totalMin * 60), min: totalMin }, unknown };
}

/* ── Härte der Tage (Fahrplan 43 E6) ─────────────────────── */

/** Härte kommt aus der Intensitätsklasse der Karte (PlanCard trägt kein `isQuality`;
 *  das gibt es nur im Plan-Generator). Abgesagte Karten zählen nicht. */
const isHardCard = (card: PlanCard): boolean => !card.cancelled && intensityClassForCard(card) === "hart";

/** `hardTomorrow` ist `null`, wenn der Plan nichts ab morgen enthält: dann ist der
 *  Folgetag unbekannt (kein Karteneintrag heißt sonst Ruhetag, hier aber nur „Plan zu Ende“). */
function hardDayFlags(
  cards: readonly PlanCard[],
  dateISO: string,
): { hardDay: boolean; hardTomorrow: boolean | null } {
  const tomorrow = addDaysISO(dateISO, 1) as string;
  const hardDay = cards.some((c) => c.date === dateISO && isHardCard(c));
  const planReachesTomorrow = cards.some((c) => c.date >= tomorrow && !c.cancelled);
  if (!planReachesTomorrow) return { hardDay, hardTomorrow: null };
  return { hardDay, hardTomorrow: cards.some((c) => c.date === tomorrow && isHardCard(c)) };
}

/** Kohlenhydrat-Band aus estimateCarbTarget (keine zweite Rechnung), nach Profil:
 *  followLoad = jeden Tag, hardDaysFueled = nur an harten Tagen. */
function carbsForDay(
  carbs: DayGoalProfile["carbs"],
  weightKg: number,
  plannedDurationMin: number,
  hardDay: boolean,
): [number, number] | null {
  if (!carbs || !(carbs.followLoad || (carbs.hardDaysFueled && hardDay))) return null;
  const r = estimateCarbTarget({ weightKg, plannedDurationMin });
  return r.ok ? (r.gramRange as [number, number]) : null;
}

/* ── Hauptfunktion ─────────────────────────────────────────── */

export function buildNutritionDay(input: NutritionDayInput): NutritionDay {
  const { dateISO, profile, wellness, goal, cards, ftpWatts, goals } = input;

  const weight = resolveWeight(wellness, profile?.weightKg ?? null, dateISO);
  const age = ageOn(profile?.birthdate ?? null, dateISO);
  const heightCm = isPositive(profile?.heightCm) ? profile!.heightCm : null;

  const missing: MissingField[] = [];
  if (!weight) missing.push("Gewicht");
  if (heightCm == null) missing.push("Körpergröße");
  if (age == null) missing.push("Geburtsdatum");
  if (missing.length > 0 || !weight || heightCm == null || age == null) {
    return { ok: false, missing, hint: null };
  }

  // Nur gemessenes Körperfett (Prozent → Dezimal), nie ein Standardwert
  const bodyFat = latestWellness(wellness, dateISO, (w) => w.bodyFat);
  const { session, unknown } = sessionForDay(cards, dateISO, ftpWatts);
  const flags = goals ? hardDayFlags(cards, dateISO) : null;

  const r = estimateDailyGoal({
    profile: {
      weightKg: weight.weightKg,
      heightCm,
      age,
      sex: profile?.sex ?? null,
      bodyFat: bodyFat ? bodyFat.value / 100 : null,
      bodyFatDate: bodyFat ? bodyFat.date : null,
    },
    goal: goal
      ? {
          goalType: goal.goalType,
          pacePerWeekKg: goal.pacePerWeekKg ?? undefined,
          targetWeightKg: goal.targetWeightKg ?? undefined,
        }
      : undefined,
    session: session ?? undefined,
    goalContext: goals?.fatLoss && flags ? { fatLoss: true, ...flags } : undefined,
  });
  if (!r.ok) return { ok: false, missing: [], hint: r.hint };

  const day: Extract<NutritionDay, { ok: true }> = {
    ok: true,
    dateISO,
    target: r.target,
    floor: r.floor,
    capped: r.capped,
    bmr: r.bmr,
    formula: r.formula,
    hints: r.hints,
    bodyFatDate: r.bodyFatDate,
    sexAssumed: r.sexAssumed,
    trainingKcal: r.trainingKcal,
    trainingUnknown: unknown,
    weightKg: weight.weightKg,
    weightSource: weight.source,
    sourceKeys: r.source,
  };
  if (!goals || !flags) return day;

  // Die Zusatzfelder liefert estimateDailyGoal nur mit Zielkontext (Fett verlieren).
  const extra = r as {
    strictFloor?: boolean;
    deficitBlockedReason?: "no-body-fat" | "hard-day" | null;
    nextDayUnknown?: boolean;
    eaWarn?: boolean;
    paceCapped?: boolean;
  };
  return {
    ...day,
    goalInfo: {
      strictFloor: extra.strictFloor ?? false,
      deficitBlockedReason: extra.deficitBlockedReason ?? null,
      nextDayUnknown: extra.nextDayUnknown ?? false,
      eaWarn: extra.eaWarn ?? false,
      paceCapped: extra.paceCapped ?? false,
      proteinG: proteinRangeG(goals.protein, weight.weightKg),
      carbsG: carbsForDay(goals.carbs, weight.weightKg, session?.min ?? 0, flags.hardDay),
    },
  };
}
